import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  computeMetrics,
  type DealInputs,
  type StressScenario,
  type StressTestResult,
  type UnderwritingResult,
  type WizardComparables,
} from "@/lib/deal-tracker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a senior HUD MAP deal analyst at FACG. The user has supplied:
1. Deal inputs and a base-case underwriting model
2. A market comp set
3. Three pre-computed stress scenarios (rents -10%, vacancy +500bps, costs +15%)

Your job is to write the qualitative analyst commentary. Return ONLY a JSON object matching this schema:

{
  "critical": ["string", "..."],     // RED: deal breakers, HUD non-starters. 0-5 items.
  "concerns": ["string", "..."],     // YELLOW: needs explanation/mitigation. 2-6 items.
  "observations": ["string", "..."], // BLUE: market context, informational. 2-6 items.
  "questions": ["string", "..."]     // Top 5-10 questions a HUD underwriter would ask.
}

Specifically address: rent supportability vs market and AMI; LTC and leverage relative to HUD maximums; DSCR cushion and breakeven; per-unit cost reasonableness; sponsor experience and equity contribution; demand and absorption risk; timeline feasibility; missing information for HUD submission.

CRITICAL CHECKS — flag any of the following as RED items in "critical":
- The model includes the bridge loan amount inside Total Project Cost. Bridge debt is a pre-development timing instrument that is repaid at HUD construction closing — including it inflates TPC, deflates LTC, and misrepresents leverage to HUD. If you see TPC ≈ Land + Hard + Soft + Financing + Escrows + Bridge (rather than excluding Bridge), call it out by name.
- The Sources side of S&U includes Bridge Loan Proceeds while the Uses side simultaneously includes the line items the bridge funded (i.e., the bridge is being counted twice — once as the loan and once as the costs it paid for).
- Total Project Cost includes BSPRA. BSPRA is a sponsor profit credit, not a cash development cost; including it inflates the basis.

Be specific to THIS deal — name the metrics and reference real numbers. Do not produce generic advice.`;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function buildScenarios(inputs: DealInputs): StressScenario[] {
  const base = computeMetrics(inputs);

  // Stress 1: rents -10%
  const lowRents: DealInputs = {
    ...inputs,
    studio_rent: inputs.studio_rent * 0.9,
    one_br_rent: inputs.one_br_rent * 0.9,
    two_br_rent: inputs.two_br_rent * 0.9,
    three_br_rent: inputs.three_br_rent * 0.9,
  };
  const stress1 = computeMetrics(lowRents);

  // Stress 2: vacancy +500bps
  const highVac: DealInputs = {
    ...inputs,
    vacancy_collection_pct: inputs.vacancy_collection_pct + 5,
  };
  const stress2 = computeMetrics(highVac);

  // Stress 3: hard + soft costs +15%
  const overBudget: DealInputs = {
    ...inputs,
    hard_costs: inputs.hard_costs * 1.15,
    soft_costs_fees: inputs.soft_costs_fees * 1.15,
  };
  const stress3 = computeMetrics(overBudget);

  const cf = (m: ReturnType<typeof computeMetrics>) =>
    m.noi_stabilized - m.annual_debt_service;

  return [
    {
      name: "Base Case",
      description: "As underwritten",
      noi: base.noi_stabilized,
      cash_flow: cf(base),
      dscr: base.dscr,
      ltc_pct: base.ltc_pct,
    },
    {
      name: "Stress 1: Rents -10%",
      description: "Asking rents underperform underwriting by 10%",
      noi: stress1.noi_stabilized,
      cash_flow: cf(stress1),
      dscr: stress1.dscr,
      ltc_pct: stress1.ltc_pct,
    },
    {
      name: "Stress 2: Vacancy +500bps",
      description: "Submarket vacancy 500bps above underwritten",
      noi: stress2.noi_stabilized,
      cash_flow: cf(stress2),
      dscr: stress2.dscr,
      ltc_pct: stress2.ltc_pct,
    },
    {
      name: "Stress 3: Costs +15%",
      description: "Hard + soft costs 15% over budget",
      noi: stress3.noi_stabilized,
      cash_flow: cf(stress3),
      dscr: stress3.dscr,
      ltc_pct: stress3.ltc_pct,
    },
  ];
}

type Body = {
  inputs?: DealInputs;
  underwriting?: UnderwritingResult | null;
  comparables?: WizardComparables | null;
};

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY is not configured on the server.", 500);
    }
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

    const scenarios = buildScenarios(inputs);

    const client = new Anthropic();
    const userPrompt = [
      `## Deal Inputs`,
      JSON.stringify(inputs, null, 2),
      ``,
      `## Underwriting Model (computed)`,
      JSON.stringify(body.underwriting ?? null, null, 2),
      ``,
      `## Market Comparables`,
      JSON.stringify(body.comparables ?? null, null, 2),
      ``,
      `## Stress Scenarios (computed)`,
      JSON.stringify(scenarios, null, 2),
      ``,
      `Provide your analyst commentary.`,
    ].join("\n");

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 6144,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (err) {
      console.error("[stress-test] Anthropic call failed:", err);
      if (err instanceof Anthropic.AuthenticationError)
        return jsonError("Invalid ANTHROPIC_API_KEY.", 401);
      if (err instanceof Anthropic.RateLimitError)
        return jsonError("Rate limited by Anthropic. Try again.", 429);
      if (err instanceof Anthropic.APIError)
        return jsonError(`Anthropic API error: ${err.message}`, 502);
      const m = err instanceof Error ? err.message : "Unknown error";
      return jsonError(`Anthropic call failed: ${m}`, 502);
    }

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");
    if (!rawText.trim()) {
      return jsonError(
        `Empty model response (stop_reason: ${response.stop_reason}).`,
        502
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch {
      return jsonError("Model returned invalid JSON.", 502);
    }
    if (!parsed || typeof parsed !== "object") {
      return jsonError("Bad shape.", 502);
    }
    const o = parsed as Record<string, unknown>;
    if (
      !isStringArray(o.critical) ||
      !isStringArray(o.concerns) ||
      !isStringArray(o.observations) ||
      !isStringArray(o.questions)
    ) {
      return jsonError("Stress test response failed schema validation.", 502);
    }

    const result: StressTestResult = {
      scenarios,
      critical: o.critical,
      concerns: o.concerns,
      observations: o.observations,
      questions: o.questions,
    };

    return NextResponse.json({ stressTest: result });
  } catch (err) {
    console.error("[stress-test] unhandled:", err);
    const m = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(m, 500);
  }
}
