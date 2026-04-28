import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per file
const MAX_TOTAL_BYTES = 25 * 1024 * 1024; // 25MB total

const SYSTEM_PROMPT = `You are extracting deal data from one or more multifamily underwriting documents (rent rolls, OMs, broker packages, model exports, term sheets). The user has uploaded Excel, PDF, Word, or PowerPoint files. Extract any of the following fields you can identify across ALL uploaded files. If different files disagree, prefer the most authoritative source (executed term sheet > pro forma > marketing OM).

OMIT any field you cannot determine. Do not guess or fabricate.

Field schema (snake_case keys, all string/number values):

Project overview:
  project_name (string), address (string), city_state (string),
  asset_type (one of: "Workforce Multifamily", "Market Rate", "Affordable", "Senior Housing", "Student Housing"),
  hud_program (one of: "221(d)(4)", "223(f)", "231", "232", "223(a)(7)"),
  total_units (number), total_stories (number), total_acres (number),
  parking_spaces (number), construction_months (number), stabilization_months (number)

Unit mix:
  studio_count (number), studio_sf (number), studio_rent (monthly $),
  one_br_count, one_br_sf, one_br_rent (monthly $),
  two_br_count, two_br_sf, two_br_rent,
  three_br_count, three_br_sf, three_br_rent

Capital structure:
  hud_loan_amount, hud_note_rate (% as decimal e.g. 5.5),
  amortization_years, mip_rate (% as decimal),
  land_value, hard_costs, soft_costs_fees, financing_carrying_costs,
  bspra_amount, working_capital_escrow, iod_escrow,
  sponsor_funds_spent, sponsor_cash_to_close,
  bridge_loan_amount, bridge_rate (% as decimal), bridge_term_months

Operating assumptions:
  vacancy_collection_pct (% as decimal), property_mgmt_pct (% as decimal),
  rm_turnover (annual $), common_area_utilities, gna, payroll, operations, insurance,
  replacement_reserves (annual $), ancillary_income,
  rent_growth_pct (% as decimal), exit_cap_rate (% as decimal),
  property_tax (annual $), tax_abatement_pct (% as decimal)

AMI rent limits:
  ami_market (string), ami_source (string),
  ami_1br_80, ami_1br_100, ami_1br_120 (monthly $),
  ami_2br_80, ami_2br_100, ami_2br_120 (monthly $)

Model oversight:
  managing_director (string), analyst_name (string), date (YYYY-MM-DD)

=== SOURCES & USES (HIGHEST PRIORITY) ===

If the upload contains a Sources & Uses table — typical in Excel models on a "Sources & Uses", "S&U", or "Capital Structure" sheet, or in OM/term sheet PDFs — extract it EXACTLY AS SHOWN. This becomes the single source of truth for the deal's capital structure.

Rules:
- Capture EVERY line item visible in the Sources section and EVERY line item in the Uses section
- Use the labels VERBATIM from the spreadsheet (do not normalize, rename, or merge — if the model says "Sponsor Equity Pre-Closing" use that exact phrasing)
- Use the dollar amounts EXACTLY as stated (no rounding, no recalculation from other tabs)
- If the spreadsheet shows a "Total Sources" or "Total Uses" line, capture those numbers in the stated_total_* fields. Do NOT recompute them — they are the model's authoritative totals.
- Do NOT fabricate an S&U from the individual cost fields above. Only return this block if you are looking at an actual S&U table.
- Note where it came from (sheet name, page, file name) in source_location.

Schema for this block:
{
  "sources": [{"label": "string (verbatim)", "amount": number}, ...],
  "uses":    [{"label": "string (verbatim)", "amount": number}, ...],
  "stated_total_sources": number | null,
  "stated_total_uses": number | null,
  "source_location": "string (e.g. 'Excel: Sources & Uses tab', 'OM page 14')"
}

If no S&U table exists in any uploaded file, omit the sources_uses field entirely (or set to null).

=== RETURN FORMAT ===

Return ONLY a JSON object:
{
  "fields": { ...only the flat fields you found... },
  "sources_uses": { ...the verbatim S&U block, or null if no S&U table was present... },
  "notes": "1-3 sentences summarizing what was extracted, which file contributed what, any conflicts, gaps, or S&U discrepancies you noticed."
}

All percent values are the percent number (5.5 for 5.5%, NOT 0.055). All dollar values are absolute dollars without commas or symbols.`;

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

function classify(file: File): "pdf" | "docx" | "xlsx" | "pptx" | "text" | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  )
    return "docx";
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.type === "application/vnd.ms-excel" ||
    /\.xlsx?$/i.test(name)
  )
    return "xlsx";
  if (
    file.type ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    name.endsWith(".pptx")
  )
    return "pptx";
  if (file.type.startsWith("text/") || /\.(csv|txt|md)$/i.test(name)) return "text";
  return null;
}

// Crude .pptx text extraction: a .pptx is a ZIP. We can't unzip without a
// dependency, so we fall back to "treat as binary, send a note to Claude".
// For best results the user should upload the source decks as PDF.

async function buildContentForFile(
  file: File
): Promise<
  | { kind: "doc"; mediaType: "application/pdf"; data: string; sourceName: string }
  | { kind: "text"; text: string; sourceName: string }
  | { kind: "error"; message: string }
> {
  const kind = classify(file);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (kind === "pdf") {
    return {
      kind: "doc",
      mediaType: "application/pdf",
      data: buffer.toString("base64"),
      sourceName: file.name,
    };
  }
  if (kind === "docx") {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();
      if (!text) return { kind: "error", message: `${file.name}: empty Word doc.` };
      return { kind: "text", text, sourceName: file.name };
    } catch (err) {
      console.error("[extract] mammoth failed:", err);
      return {
        kind: "error",
        message: `${file.name}: could not parse Word document.`,
      };
    }
  }
  if (kind === "xlsx") {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer" });
      const sheetsText = wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        return `--- Sheet: ${name} ---\n${csv}`;
      }).join("\n\n");
      if (!sheetsText.trim())
        return { kind: "error", message: `${file.name}: empty workbook.` };
      const capped =
        sheetsText.length > 120_000
          ? sheetsText.slice(0, 120_000) + "\n\n[... truncated ...]"
          : sheetsText;
      return { kind: "text", text: capped, sourceName: file.name };
    } catch (err) {
      console.error("[extract] xlsx failed:", err);
      return {
        kind: "error",
        message: `${file.name}: could not parse Excel workbook.`,
      };
    }
  }
  if (kind === "pptx") {
    // Best-effort: extract <a:t> text nodes from the .pptx zip (no unzip
    // library required — we scan for text segments in the binary).
    const txt = buffer.toString("utf-8");
    const matches = Array.from(txt.matchAll(/<a:t>([^<]+)<\/a:t>/g))
      .map((m) => m[1])
      .filter((s) => s && s.trim().length > 0);
    if (matches.length === 0) {
      return {
        kind: "error",
        message: `${file.name}: could not extract text from .pptx — re-export as PDF.`,
      };
    }
    return {
      kind: "text",
      text: matches.join("\n"),
      sourceName: file.name,
    };
  }
  if (kind === "text") {
    const text = buffer.toString("utf-8").trim();
    if (!text) return { kind: "error", message: `${file.name}: empty file.` };
    return { kind: "text", text, sourceName: file.name };
  }
  return {
    kind: "error",
    message: `${file.name}: unsupported file type (${file.type || "unknown"}).`,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY is not configured on the server.", 500);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonError("Expected multipart/form-data with 'file' field(s).", 400);
    }

    const all = formData.getAll("file");
    const files: File[] = [];
    let totalBytes = 0;
    for (const item of all) {
      if (!(item instanceof File)) continue;
      if (item.size === 0) continue;
      if (item.size > MAX_FILE_SIZE_BYTES) {
        return jsonError(
          `${item.name} is too large (max 10MB per file).`,
          413
        );
      }
      totalBytes += item.size;
      files.push(item);
    }
    if (files.length === 0) {
      return jsonError("Provide at least one file in the 'file' form field.", 400);
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonError(
        `Total upload size exceeds ${MAX_TOTAL_BYTES / (1024 * 1024)}MB.`,
        413
      );
    }

    const errors: string[] = [];
    const userContent: Anthropic.MessageParam["content"] = [
      {
        type: "text",
        text: `Extract deal data from the following ${files.length} file(s). Combine information across files; flag conflicts in your notes.`,
      },
    ];

    for (const file of files) {
      const piece = await buildContentForFile(file);
      if (piece.kind === "error") {
        errors.push(piece.message);
        continue;
      }
      if (piece.kind === "doc") {
        userContent.push({
          type: "document",
          source: {
            type: "base64",
            media_type: piece.mediaType,
            data: piece.data,
          },
        });
        userContent.push({
          type: "text",
          text: `(Above PDF source: ${piece.sourceName})`,
        });
      } else {
        userContent.push({
          type: "text",
          text: `--- File: ${piece.sourceName} ---\n${piece.text}`,
        });
      }
    }

    if (userContent.length === 1) {
      return jsonError(
        `No usable file content. ${errors.join(" ")}`.trim(),
        400
      );
    }

    const client = new Anthropic();

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      });
    } catch (err) {
      console.error("[extract] Anthropic call failed:", err);
      if (err instanceof Anthropic.AuthenticationError) {
        return jsonError("Invalid ANTHROPIC_API_KEY.", 401);
      }
      if (err instanceof Anthropic.RateLimitError) {
        return jsonError(
          "Rate limited by Anthropic. Try again in a moment.",
          429
        );
      }
      if (err instanceof Anthropic.APIError) {
        return jsonError(
          `Anthropic API error (${err.status ?? "unknown"}): ${err.message}`,
          502
        );
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      return jsonError(`Anthropic call failed: ${message}`, 502);
    }

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    if (!rawText.trim()) {
      return jsonError(
        `The model returned no text (stop_reason: ${response.stop_reason}).`,
        502
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch {
      console.error("[extract] JSON parse failed. Raw:\n", rawText);
      return jsonError(
        "The model returned a response that wasn't valid JSON.",
        502
      );
    }

    if (!parsed || typeof parsed !== "object") {
      return jsonError("Extraction response was not an object.", 502);
    }
    const obj = parsed as {
      fields?: unknown;
      sources_uses?: unknown;
      notes?: unknown;
    };
    if (!obj.fields || typeof obj.fields !== "object") {
      return jsonError("Extraction response missing 'fields' object.", 502);
    }

    // Validate the verbatim S&U block if Claude returned one. Strict shape:
    // both arrays of {label, amount} with positive amounts, optional stated
    // totals, plus a source_location string. Anything malformed → null
    // (we don't want partial S&U leaking through and overriding good data).
    const sourcesUses = parseExtractedSourcesUses(obj.sources_uses);

    const notes =
      (typeof obj.notes === "string" ? obj.notes : "") +
      (errors.length > 0 ? `\n\nFile errors: ${errors.join("; ")}` : "");

    return NextResponse.json({
      fields: obj.fields,
      sources_uses: sourcesUses,
      notes: notes.trim(),
      filesProcessed: files.length - errors.length,
    });
  } catch (err) {
    console.error("[extract] unhandled:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(message, 500);
  }
}

type SUOut = {
  sources: { label: string; amount: number }[];
  uses: { label: string; amount: number }[];
  stated_total_sources: number | null;
  stated_total_uses: number | null;
  source_location: string;
} | null;

function parseRowList(
  v: unknown
): { label: string; amount: number }[] | null {
  if (!Array.isArray(v)) return null;
  const rows: { label: string; amount: number }[] = [];
  for (const item of v) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.label !== "string") continue;
    if (typeof o.amount !== "number" || !Number.isFinite(o.amount)) continue;
    if (o.amount <= 0) continue;
    rows.push({ label: o.label.trim(), amount: o.amount });
  }
  return rows;
}

function parseExtractedSourcesUses(v: unknown): SUOut {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const sources = parseRowList(o.sources);
  const uses = parseRowList(o.uses);
  if (!sources || !uses) return null;
  if (sources.length === 0 && uses.length === 0) return null;
  const stated_total_sources =
    typeof o.stated_total_sources === "number" &&
    Number.isFinite(o.stated_total_sources)
      ? o.stated_total_sources
      : null;
  const stated_total_uses =
    typeof o.stated_total_uses === "number" &&
    Number.isFinite(o.stated_total_uses)
      ? o.stated_total_uses
      : null;
  const source_location =
    typeof o.source_location === "string" && o.source_location.trim()
      ? o.source_location.trim()
      : "Uploaded model";
  return {
    sources,
    uses,
    stated_total_sources,
    stated_total_uses,
    source_location,
  };
}
