import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  computeMetrics,
  computeProForma,
  computeHudFlags,
  computeConfidence,
  type DealInputs,
  type ExtractedSourcesUses,
  type SourcesUsesRow,
  type UnitMixRow,
  type UnderwritingResult,
} from "@/lib/deal-tracker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a senior HUD MAP underwriter at FACG with 20+ years analyzing multifamily deals across the 221(d)(4), 223(f), 231, 232, and 223(a)(7) programs.

The user's deal data may have been extracted from messy Excel files, PDFs, Word documents, PowerPoint decks, or typed by hand. Act as the analyst who normally cleans this raw data into an institutional-quality screening package: identify every dollar of capital, every cost line, and map each to its proper HUD underwriting category — regardless of how the data came in.

The system has already computed the deterministic financial metrics (NOI, DSCR, LTC, debt yield, etc.) and built a starter Sources & Uses breakdown from the input fields. Your job is to refine that breakdown:

1. Use clean, HUD-standard institutional labels. Examples:
   - Sources: "HUD-Insured Mortgage Loan", "BSPRA — Builder Sponsor Profit & Risk Allowance", "Sponsor Equity — Cash", "Sponsor Equity — Land Value", "Sponsor Equity — Pre-Development Spent", "Bridge Loan Proceeds", "LIHTC Equity", "Tax Credit Bridge", "Seller Note", "Subordinate Debt", "City/State Grant"
   - Uses: "Land Acquisition", "Hard Construction Costs", "General Contractor Fee", "Soft Costs & Professional Fees", "Financing & Carrying Costs", "Working Capital Escrow", "Initial Operating Deficit Escrow", "Replacement Reserve Funding", "Construction Contingency", "Lender Fees", "Title & Closing"

2. Split aggregated input fields when warranted. For example, treat Land Value as both a source ("Sponsor Equity — Land Value") and a use ("Land Acquisition"). Use your judgment based on the deal's structure.

3. Drop any line item that resolves to $0.

4. CRITICAL: Total Sources MUST equal Total Uses on a balanced deal. If the input data does NOT balance, return your line items AS-IS — do NOT fabricate balancing entries. The system will flag the discrepancy for analyst review.

5. Provide a 2-4 sentence narrative explaining your interpretation: what came in clean, what you had to infer, any data quality flags, and structural items the analyst should verify before submission.

CRITICAL HUD UNDERWRITING RULES — flag any of these as a CRITICAL ERROR in your granular_notes:
- A model that puts the bridge loan into Total Project Cost. The bridge is a pre-development timing instrument retired at HUD construction closing — it is a Source of funds for pre-closing carrying costs, but the costs it pays for are already captured in Hard/Soft/Financing/Escrow lines. Rolling the bridge balance into TPC double-counts and misrepresents LTC to HUD.
- A model that includes BSPRA in Total Project Cost. BSPRA is a sponsor profit allowance (a credit), not a cash development cost.
- An S&U where the bridge appears as both a Source AND the underlying costs it funded appear as Uses without an offsetting Bridge-Repayment Use — this is double counting.

Return ONLY this JSON shape (no markdown fences, no preamble):
{
  "sources": [{"label": "string", "amount": number}, ...],
  "uses":    [{"label": "string", "amount": number}, ...],
  "granular_notes": "string"
}

Constraints:
- All amounts are absolute USD (no commas, no $)
- Only include line items with strictly positive amounts
- Labels are short institutional phrases`;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

function isSourcesUsesRow(v: unknown): v is SourcesUsesRow {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.label === "string" &&
    typeof o.amount === "number" &&
    Number.isFinite(o.amount) &&
    o.amount > 0
  );
}

function buildDefaultSources(inputs: DealInputs): SourcesUsesRow[] {
  return [
    { label: "HUD-Insured Mortgage Loan", amount: inputs.hud_loan_amount },
    { label: "BSPRA", amount: inputs.bspra_amount },
    { label: "Sponsor Equity — Pre-Development Spent", amount: inputs.sponsor_funds_spent },
    { label: "Sponsor Equity — Cash to Close", amount: inputs.sponsor_cash_to_close },
  ].filter((r) => r.amount > 0);
}

function buildDefaultUses(inputs: DealInputs): SourcesUsesRow[] {
  return [
    { label: "Land Acquisition", amount: inputs.land_value },
    { label: "Hard Construction Costs", amount: inputs.hard_costs },
    { label: "Soft Costs & Professional Fees", amount: inputs.soft_costs_fees },
    { label: "Financing & Carrying Costs", amount: inputs.financing_carrying_costs },
    { label: "BSPRA", amount: inputs.bspra_amount },
    { label: "Working Capital Escrow", amount: inputs.working_capital_escrow },
    { label: "Initial Operating Deficit Escrow", amount: inputs.iod_escrow },
  ].filter((r) => r.amount > 0);
}

function buildUnitMixTable(inputs: DealInputs, totalUnits: number): UnitMixRow[] {
  const rows: UnitMixRow[] = [];
  const denom = totalUnits > 0 ? totalUnits : 1;
  const push = (
    type: string,
    count: number,
    sf: number,
    rent: number
  ) => {
    if (count > 0)
      rows.push({
        type,
        count,
        sf,
        monthly_rent: rent,
        annual_rent: count * rent * 12,
        pct_of_units: (count / denom) * 100,
      });
  };
  push("Studio", inputs.studio_count, inputs.studio_sf, inputs.studio_rent);
  push("1 BR", inputs.one_br_count, inputs.one_br_sf, inputs.one_br_rent);
  push("2 BR", inputs.two_br_count, inputs.two_br_sf, inputs.two_br_rent);
  push("3 BR", inputs.three_br_count, inputs.three_br_sf, inputs.three_br_rent);
  return rows;
}

function computeBalanceCheck(
  sources: SourcesUsesRow[],
  uses: SourcesUsesRow[],
  statedTotalSources: number | null,
  statedTotalUses: number | null
): UnderwritingResult["balance_check"] {
  const lineSumSources = sources.reduce((a, r) => a + r.amount, 0);
  const lineSumUses = uses.reduce((a, r) => a + r.amount, 0);
  // When the source spreadsheet stated explicit totals, those win — the line
  // items are displayed verbatim but the deal's authoritative totals come
  // from the model itself, not from re-summing rows that may round differently.
  const totalSources = statedTotalSources ?? lineSumSources;
  const totalUses = statedTotalUses ?? lineSumUses;
  const delta = totalSources - totalUses;
  const denominator = Math.max(totalSources, totalUses);
  const deltaPct = denominator > 0 ? Math.abs(delta) / denominator * 100 : 0;
  // Tolerance: 1% of larger side, floor of $1,000
  const tolerance = Math.max(1000, denominator * 0.01);
  const isBalanced = Math.abs(delta) <= tolerance;
  return {
    total_sources: totalSources,
    total_uses: totalUses,
    delta,
    delta_pct: deltaPct,
    is_balanced: isBalanced,
    tolerance,
    stated_total_sources: statedTotalSources,
    stated_total_uses: statedTotalUses,
    sources_sum_vs_stated:
      statedTotalSources !== null ? lineSumSources - statedTotalSources : null,
    uses_sum_vs_stated:
      statedTotalUses !== null ? lineSumUses - statedTotalUses : null,
  };
}

type Body = {
  inputs?: DealInputs;
  extractedFields?: string[];
  /**
   * Verbatim S&U pulled from an uploaded model. When present, this is the
   * authoritative capital structure — Claude refinement and field-derived
   * defaults are bypassed entirely.
   */
  extractedSourcesUses?: ExtractedSourcesUses | null;
};

export async function POST(req: NextRequest) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    const inputs = body.inputs;
    if (!inputs || typeof inputs !== "object") {
      return jsonError("Missing 'inputs'.", 400);
    }
    const extractedFields = Array.isArray(body.extractedFields)
      ? body.extractedFields.filter((k) => typeof k === "string")
      : [];

    // === Server-side computation (deterministic) ===
    const computed = computeMetrics(inputs);
    const proForma = computeProForma(inputs, computed, 5);
    const flags = computeHudFlags(inputs, computed);
    const unitMixTable = buildUnitMixTable(inputs, computed.total_units_used);
    const confidence = computeConfidence(inputs, extractedFields);

    // If the user uploaded a model with an explicit S&U table, that table is
    // the single source of truth. Use it verbatim — no Claude pass, no
    // field-derived defaults, no re-labeling. This is what guarantees the
    // prospectus matches the spreadsheet penny for penny.
    const extractedSU =
      body.extractedSourcesUses && typeof body.extractedSourcesUses === "object"
        ? body.extractedSourcesUses
        : null;

    let sources: SourcesUsesRow[];
    let uses: SourcesUsesRow[];
    let granularNotes: string;
    let suOrigin: UnderwritingResult["sources_uses_origin"];
    let statedTotalSources: number | null = null;
    let statedTotalUses: number | null = null;

    if (extractedSU) {
      sources = extractedSU.sources;
      uses = extractedSU.uses;
      statedTotalSources = extractedSU.stated_total_sources;
      statedTotalUses = extractedSU.stated_total_uses;
      suOrigin = {
        source: "extracted",
        location: extractedSU.source_location || "Uploaded model",
      };
      granularNotes = `Sources & Uses captured verbatim from ${extractedSU.source_location || "uploaded model"}. Line items, labels, and stated totals reflect the spreadsheet exactly — no recalculation, normalization, or AI refinement applied.`;
    } else {
      sources = buildDefaultSources(inputs);
      uses = buildDefaultUses(inputs);
      suOrigin = { source: "derived", location: null };
      granularNotes =
        "No Sources & Uses table was found in the upload — capital structure derived from individual cost fields entered in Step 1.";
    }

    // Claude refinement is ONLY used when we had to derive S&U from flat
    // inputs. When an extracted S&U is present we skip Claude entirely —
    // the spreadsheet is the source of truth and renaming or re-bucketing
    // it would defeat the purpose.
    if (!extractedSU && process.env.ANTHROPIC_API_KEY) {
      const defaultSources = sources;
      const defaultUses = uses;
      const userPrompt = [
        `## Deal inputs`,
        JSON.stringify(inputs, null, 2),
        ``,
        `## Server-computed metrics`,
        JSON.stringify(computed, null, 2),
        ``,
        `## Server-default Sources (your starting point)`,
        defaultSources
          .map((s) => `  - ${s.label}: $${s.amount.toLocaleString()}`)
          .join("\n"),
        ``,
        `## Server-default Uses (your starting point)`,
        defaultUses
          .map((u) => `  - ${u.label}: $${u.amount.toLocaleString()}`)
          .join("\n"),
        ``,
        `## Field provenance`,
        `Extracted from uploaded files: ${
          confidence.totals.extracted
        } fields (${
          extractedFields.slice(0, 25).join(", ") || "none"
        }${extractedFields.length > 25 ? ", …" : ""})`,
        `Manually entered: ${confidence.totals.manual} fields`,
        `Estimated (matches default convention): ${confidence.totals.estimated} fields`,
        `Missing (zero/empty): ${confidence.totals.missing} fields`,
        ``,
        `Refine the Sources & Uses arrays and write your granular notes.`,
      ].join("\n");

      try {
        const client = new Anthropic();
        const response = await client.messages.create(
          {
            model: MODEL,
            // S&U refinement + 2-4 sentence narrative is small — 2048 tokens
            // is plenty and tightens the wall-clock ceiling. Lower cap means
            // we stay well under Vercel's 60s function-duration hard kill.
            max_tokens: 2048,
            system: SYSTEM_PROMPT,
            messages: [{ role: "user", content: userPrompt }],
          },
          // Hard request timeout — if Anthropic is slow today we'd rather
          // fall back to the deterministic server defaults than hang to 60s.
          { timeout: 45_000 }
        );
        const rawText = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("");
        if (rawText.trim()) {
          try {
            const parsed = JSON.parse(extractJson(rawText)) as Record<
              string,
              unknown
            >;
            const claudeSources = Array.isArray(parsed.sources)
              ? parsed.sources.filter(isSourcesUsesRow)
              : [];
            const claudeUses = Array.isArray(parsed.uses)
              ? parsed.uses.filter(isSourcesUsesRow)
              : [];
            // Only swap in Claude's version if it returned at least one of each
            if (claudeSources.length > 0 && claudeUses.length > 0) {
              sources = claudeSources;
              uses = claudeUses;
            }
            if (typeof parsed.granular_notes === "string" && parsed.granular_notes.trim()) {
              granularNotes = parsed.granular_notes.trim();
            }
          } catch (parseErr) {
            console.error(
              "[underwriting] Claude JSON parse failed, falling back to defaults:",
              parseErr
            );
          }
        }
      } catch (claudeErr) {
        console.error(
          "[underwriting] Claude call failed, falling back to defaults:",
          claudeErr
        );
        // Soft fail — server defaults are already in place
      }
    }

    // === Balance check (using whichever sources/uses we ended up with) ===
    const balanceCheck = computeBalanceCheck(
      sources,
      uses,
      statedTotalSources,
      statedTotalUses
    );

    // === AMI ===
    const oneBr = inputs.one_br_rent;
    const twoBr = inputs.two_br_rent;
    const oneBrPct =
      inputs.ami_1br_120 > 0 ? (oneBr / inputs.ami_1br_120) * 100 : 0;
    const twoBrPct =
      inputs.ami_2br_120 > 0 ? (twoBr / inputs.ami_2br_120) * 100 : 0;

    const result: UnderwritingResult = {
      computed,
      pro_forma: proForma,
      flags,
      sources,
      uses,
      unit_mix_table: unitMixTable,
      ami_analysis: {
        one_br: {
          subject: oneBr,
          ami_80: inputs.ami_1br_80,
          ami_100: inputs.ami_1br_100,
          ami_120: inputs.ami_1br_120,
          pct_of_120: oneBrPct,
        },
        two_br: {
          subject: twoBr,
          ami_80: inputs.ami_2br_80,
          ami_100: inputs.ami_2br_100,
          ami_120: inputs.ami_2br_120,
          pct_of_120: twoBrPct,
        },
      },
      balance_check: balanceCheck,
      sources_uses_origin: suOrigin,
      confidence,
      granular_notes: granularNotes,
    };

    return NextResponse.json({ underwriting: result });
  } catch (err) {
    console.error("[underwriting] unhandled:", err);
    const m = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(m, 500);
  }
}
