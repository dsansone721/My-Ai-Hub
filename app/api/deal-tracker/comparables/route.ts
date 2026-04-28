import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { DealInputs, WizardComparables } from "@/lib/deal-tracker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a senior multifamily analyst building a market rent comp set for a HUD MAP financing package.

You will receive the subject property: location, asset type (Workforce / Market Rate / Affordable / Senior / Student), proposed unit mix and rents, and the relevant HUD program. Identify 5-8 comparable properties in or near the submarket. Use real properties from your training-data knowledge when known; calibrate plausible estimates when not, and disclose data confidence.

Return ONLY a JSON object matching this exact schema:

{
  "comps": [
    {
      "name": "string",
      "location": "string (city, state)",
      "year_built": number | null,
      "units": number,
      "unit_mix": { "studio": number, "one_br": number, "two_br": number, "three_br": number },
      "unit_sizes": { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
      "rents":      { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
      "occupancy_pct": number,
      "utilities_included": ["string", "..."],
      "hud_lihtc_flag": boolean,
      "distance_miles": number
    }
  ],
  "market_summary": {
    "market_rents":  { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
    "market_occupancy_pct": number,
    "hud_fmr":       { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
    "subject_vs_market": "string (1-2 sentences quantifying spread)",
    "subject_vs_fmr": "string (1-2 sentences vs HUD Fair Market Rents)",
    "rent_supportability": "supports" | "qualified" | "below",
    "commentary": "string (3-5 sentences of HUD MAP underwriting commentary on rent supportability, including comp depth, vacancy, and any red flags)"
  }
}

Constraints:
- Identify 5-8 comps. Match property type, vintage (within 10 years), unit count (within 50%), affordability tier when feasible.
- Rents are average asking monthly rents per unit, in current dollars.
- occupancy_pct is a percent number (94.5 for 94.5%).
- distance_miles is decimal miles.
- HUD FMR values: use your knowledge of the relevant HUD-published Fair Market Rent for the subject's metro/county. If you don't know the current values, leave that bedroom slot null and explain in commentary.
- For Workforce/Affordable subjects, prefer LIHTC/bond comps and set hud_lihtc_flag=true on those.`;

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
function isByBedroom(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (["studio", "one_br", "two_br", "three_br"] as const).every(
    (k) => o[k] === null || (typeof o[k] === "number" && Number.isFinite(o[k]))
  );
}
function isUnitMix(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (["studio", "one_br", "two_br", "three_br"] as const).every(
    (k) => typeof o[k] === "number"
  );
}
function isComp(v: unknown): boolean {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.location === "string" &&
    (typeof o.year_built === "number" || o.year_built === null) &&
    typeof o.units === "number" &&
    isUnitMix(o.unit_mix) &&
    isByBedroom(o.unit_sizes) &&
    isByBedroom(o.rents) &&
    typeof o.occupancy_pct === "number" &&
    isStringArray(o.utilities_included) &&
    typeof o.hud_lihtc_flag === "boolean" &&
    typeof o.distance_miles === "number"
  );
}
function isValidResult(v: unknown): v is WizardComparables {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.comps) || o.comps.length === 0) return false;
  if (!o.comps.every(isComp)) return false;
  const m = o.market_summary as Record<string, unknown> | undefined;
  if (!m) return false;
  if (!isByBedroom(m.market_rents)) return false;
  if (typeof m.market_occupancy_pct !== "number") return false;
  if (!isByBedroom(m.hud_fmr)) return false;
  if (typeof m.subject_vs_market !== "string") return false;
  if (typeof m.subject_vs_fmr !== "string") return false;
  if (
    typeof m.rent_supportability !== "string" ||
    !["supports", "qualified", "below"].includes(m.rent_supportability)
  )
    return false;
  if (typeof m.commentary !== "string") return false;
  return true;
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY is not configured on the server.", 500);
    }
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    const inputs = body as Partial<DealInputs>;
    if (!inputs.city_state) {
      return jsonError("city_state is required to pull comps.", 400);
    }

    const userPrompt = [
      `Build a HUD multifamily comp set for the subject property below.`,
      ``,
      `Location: ${inputs.city_state}`,
      `Address: ${inputs.address ?? "—"}`,
      `Asset type: ${inputs.asset_type ?? "—"}`,
      `HUD program: ${inputs.hud_program ?? "—"}`,
      `Total units: ${inputs.total_units ?? 0}`,
      ``,
      `Proposed unit mix and rents:`,
      `  Studio: ${inputs.studio_count ?? 0} units @ $${inputs.studio_rent ?? 0}/mo (${inputs.studio_sf ?? 0} SF)`,
      `  1BR:    ${inputs.one_br_count ?? 0} units @ $${inputs.one_br_rent ?? 0}/mo (${inputs.one_br_sf ?? 0} SF)`,
      `  2BR:    ${inputs.two_br_count ?? 0} units @ $${inputs.two_br_rent ?? 0}/mo (${inputs.two_br_sf ?? 0} SF)`,
      `  3BR:    ${inputs.three_br_count ?? 0} units @ $${inputs.three_br_rent ?? 0}/mo (${inputs.three_br_sf ?? 0} SF)`,
      ``,
      `AMI context (if provided): market=${inputs.ami_market ?? "—"}, 1BR 80/100/120% AMI = $${inputs.ami_1br_80 ?? 0}/$${inputs.ami_1br_100 ?? 0}/$${inputs.ami_1br_120 ?? 0}, 2BR 80/100/120% AMI = $${inputs.ami_2br_80 ?? 0}/$${inputs.ami_2br_100 ?? 0}/$${inputs.ami_2br_120 ?? 0}`,
    ].join("\n");

    const client = new Anthropic();
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (err) {
      console.error("[comparables] Anthropic call failed:", err);
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
      console.error("[comparables] JSON parse failed. Raw:\n", rawText);
      return jsonError("Model returned invalid JSON.", 502);
    }
    if (!isValidResult(parsed)) {
      console.error("[comparables] schema mismatch:", parsed);
      return jsonError("Model response did not match expected schema.", 502);
    }
    return NextResponse.json({ comparables: parsed });
  } catch (err) {
    console.error("[comparables] unhandled:", err);
    const m = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(m, 500);
  }
}
