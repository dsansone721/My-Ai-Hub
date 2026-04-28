import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

const PROPERTY_TYPES = ["Garden Style", "Mid-Rise", "High-Rise"] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];

const TENURE_TYPES = ["For Rent", "For Sale"] as const;
type TenureType = (typeof TENURE_TYPES)[number];

const AFFORDABILITY_LEVELS = [
  "Luxury",
  "Market Rate",
  "Workforce",
  "Affordable",
] as const;
type AffordabilityLevel = (typeof AFFORDABILITY_LEVELS)[number];

const SUPPORTS_VALUES = ["yes", "qualified", "no"] as const;
type SupportsValue = (typeof SUPPORTS_VALUES)[number];

const SYSTEM_PROMPT = `You are a senior multifamily real estate analyst preparing a comparables set for a HUD financing package.

The user message specifies the subject's tenure (For Rent or For Sale), property type (Garden Style, Mid-Rise, or High-Rise), and affordability level (Luxury, Market Rate, Workforce, or Affordable). Tailor the comp set, market analysis, and underwriting commentary accordingly:

- For Rent: focus on asking/effective rents, occupancy, concessions, utilities, lease terms, HUD MAP rent supportability.
- For Sale: focus on list prices, price/SF, HOA fees, days on market, sale-to-list ratio, absorption rate, HUD-insured for-sale supportability.
- Affordability tier shapes the peer set. For Workforce (60-80% AMI) and Affordable (30-60% AMI), prefer LIHTC and bond-financed comps. For Market Rate and Luxury, prefer conventionally financed comps. AMI targeting matters: a 60% AMI deal needs comps that are also 60% AMI or close.

Use real properties from your training data when known; calibrate estimates to the submarket when not, and disclose data confidence in each comp's notes field.

Return ONLY a single JSON object matching this exact schema. No markdown fences, no preamble, no trailing commentary.

{
  "subject": {
    "location": "string",
    "property_type": "Garden Style" | "Mid-Rise" | "High-Rise",
    "tenure_type": "For Rent" | "For Sale",
    "affordability_level": "Luxury" | "Market Rate" | "Workforce" | "Affordable",
    "units": number
  },
  "comps": [
    {
      // === UNIVERSAL — REQUIRED ON EVERY COMP ===
      "name": "string",
      "address": "string (street, city, state, zip if known)",
      "year_built": number | null,
      "distance_miles": number,
      "units": number,
      "unit_sizes_sf": { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
      "management_company": "string",
      "hud_lihtc_flag": boolean,
      "affordability_tier": "Luxury" | "Market Rate" | "Workforce" | "Affordable" | "Mixed-Income",
      "ami_targeting": "string (e.g. 'Market Rate', '60-80% AMI', 'LIHTC 60% set-aside', 'Workforce 80% AMI cap')",
      "notes": "string (1-2 sentences on data confidence and why this is comparable)",

      // === TENURE-CONDITIONAL — INCLUDE ONLY THE BLOCK MATCHING tenure_type ===
      "rent_details": {                              // include if and only if tenure_type === "For Rent"
        "asking_rents":    { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
        "effective_rents": { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
        "occupancy_pct": number,
        "concessions": "string (e.g. '1 month free on 13-month lease' or 'None')",
        "utilities_included": ["string", "..."],
        "lease_terms": "string"
      },
      "sale_details": {                              // include if and only if tenure_type === "For Sale"
        "list_prices":     { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
        "price_per_sf":    { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
        "hoa_fees_monthly":{ "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
        "days_on_market_avg": number,
        "sale_to_list_ratio_pct": number,
        "absorption_rate_units_per_month": number
      },

      // === PROPERTY-TYPE-CONDITIONAL — INCLUDE ONLY THE BLOCK MATCHING property_type ===
      "garden_details": {                            // include if property_type === "Garden Style"
        "lot_coverage_pct": number|null,
        "parking_ratio": number|null,
        "parking_type": "string (Surface | Structured | Mix)"
      },
      "mid_rise_details": {                          // include if property_type === "Mid-Rise"
        "floor_count": number|null,
        "has_elevator": boolean,
        "amenities": ["string", "..."]
      },
      "high_rise_details": {                         // include if property_type === "High-Rise"
        "floor_count": number|null,
        "views_premium": "string (e.g. '$150-300/mo for water view' or 'No premium documented')",
        "has_concierge": boolean,
        "amenities": ["string", "..."]
      }
    }
  ],
  "market_summary": {
    "submarket_analysis": "string (3-5 sentences on submarket dynamics, supply pipeline, employment drivers, demographic trends)",
    "subject_positioning": "string (2-4 sentences on how the subject's proposed rents/prices and unit mix compare to the comp set and market)",
    "affordability_commentary": "string (2-4 sentences on AMI alignment, gap to market, demand depth at the affordability tier, LIHTC/bond competitive set if applicable)",
    "rent_metrics": {                                // include if tenure_type === "For Rent"
      "market_rents": { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
      "market_occupancy_pct": number,
      "rent_growth_pct_yoy": number
    },
    "sale_metrics": {                                // include if tenure_type === "For Sale"
      "market_list_prices":  { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
      "market_price_per_sf": { "studio": number|null, "one_br": number|null, "two_br": number|null, "three_br": number|null },
      "avg_days_on_market": number,
      "price_growth_pct_yoy": number,
      "absorption_rate_units_per_month": number
    }
  },
  "hud_insights": {
    "supports_proposed_metrics": "yes" | "qualified" | "no",
    "support_notes": "string (2-4 sentences applying HUD underwriting standards to rent OR price supportability as appropriate to tenure_type)",
    "vacancy_or_absorption_analysis": "string (For Rent: vacancy cushion vs HUD's 7% economic vacancy. For Sale: absorption pace vs market norms.)",
    "red_flags": ["string", "..."],
    "underwriting_summary": "string (3-5 sentences synthesizing the HUD underwriter's likely view)"
  }
}

Guidelines:
- Identify 5-8 truly comparable properties (within 3-5 miles when possible; widen as needed in tight markets)
- Match property type, vintage (within 10 years), unit count (within 50%), and affordability tier
- Monetary values in USD: rents and HOA monthly per unit; list prices total per unit; price_per_sf is $/SF
- Percentage fields (occupancy_pct, sale_to_list_ratio_pct, growth percentages) are numbers like 94.5 (not 0.945)
- distance_miles is decimal miles
- For Workforce/Affordable subjects, lean toward LIHTC/bond-financed comps and disclose AMI targeting clearly. Set hud_lihtc_flag = true on those comps.
- For Market Rate/Luxury, comps are typically conventionally financed; hud_lihtc_flag = false unless you know otherwise
- HUD MAP rent underwriting heuristics: 90-93% physical occupancy floor, 7% economic vacancy assumption, ~$50/unit rent comp variance, concession-adjusted achieved rents
- HUD-insured for-sale absorption norms (rough): 4-8 units/month for Garden, 6-12 for Mid/High-Rise depending on price tier
- Red flag candidates: subject above market; submarket occupancy <92% (rent) or absorption stalling (sale); oversupply pipeline; concession-heavy market; weak job/population trends; AMI mismatch with comp set; affordability tier saturation; high HOA load on for-sale comps
`;

type ByBedroom = {
  studio: number | null;
  one_br: number | null;
  two_br: number | null;
  three_br: number | null;
};

type RentDetails = {
  asking_rents: ByBedroom;
  effective_rents: ByBedroom;
  occupancy_pct: number;
  concessions: string;
  utilities_included: string[];
  lease_terms: string;
};
type SaleDetails = {
  list_prices: ByBedroom;
  price_per_sf: ByBedroom;
  hoa_fees_monthly: ByBedroom;
  days_on_market_avg: number;
  sale_to_list_ratio_pct: number;
  absorption_rate_units_per_month: number;
};
type GardenDetails = {
  lot_coverage_pct: number | null;
  parking_ratio: number | null;
  parking_type: string;
};
type MidRiseDetails = {
  floor_count: number | null;
  has_elevator: boolean;
  amenities: string[];
};
type HighRiseDetails = {
  floor_count: number | null;
  views_premium: string;
  has_concierge: boolean;
  amenities: string[];
};

type Comp = {
  name: string;
  address: string;
  year_built: number | null;
  distance_miles: number;
  units: number;
  unit_sizes_sf: ByBedroom;
  management_company: string;
  hud_lihtc_flag: boolean;
  affordability_tier: string;
  ami_targeting: string;
  notes: string;
  rent_details?: RentDetails;
  sale_details?: SaleDetails;
  garden_details?: GardenDetails;
  mid_rise_details?: MidRiseDetails;
  high_rise_details?: HighRiseDetails;
};

type ComparablesResult = {
  subject: {
    location: string;
    property_type: PropertyType;
    tenure_type: TenureType;
    affordability_level: AffordabilityLevel;
    units: number;
  };
  comps: Comp[];
  market_summary: {
    submarket_analysis: string;
    subject_positioning: string;
    affordability_commentary: string;
    rent_metrics?: {
      market_rents: ByBedroom;
      market_occupancy_pct: number;
      rent_growth_pct_yoy: number;
    };
    sale_metrics?: {
      market_list_prices: ByBedroom;
      market_price_per_sf: ByBedroom;
      avg_days_on_market: number;
      price_growth_pct_yoy: number;
      absorption_rate_units_per_month: number;
    };
  };
  hud_insights: {
    supports_proposed_metrics: SupportsValue;
    support_notes: string;
    vacancy_or_absorption_analysis: string;
    red_flags: string[];
    underwriting_summary: string;
  };
};

// === Validators ===

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
function isByBedroom(v: unknown): v is ByBedroom {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (["studio", "one_br", "two_br", "three_br"] as const).every(
    (k) => o[k] === null || (typeof o[k] === "number" && Number.isFinite(o[k]))
  );
}
function isRentDetails(v: unknown): v is RentDetails {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isByBedroom(o.asking_rents) &&
    isByBedroom(o.effective_rents) &&
    typeof o.occupancy_pct === "number" &&
    typeof o.concessions === "string" &&
    isStringArray(o.utilities_included) &&
    typeof o.lease_terms === "string"
  );
}
function isSaleDetails(v: unknown): v is SaleDetails {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    isByBedroom(o.list_prices) &&
    isByBedroom(o.price_per_sf) &&
    isByBedroom(o.hoa_fees_monthly) &&
    typeof o.days_on_market_avg === "number" &&
    typeof o.sale_to_list_ratio_pct === "number" &&
    typeof o.absorption_rate_units_per_month === "number"
  );
}
function isGardenDetails(v: unknown): v is GardenDetails {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (typeof o.lot_coverage_pct === "number" || o.lot_coverage_pct === null) &&
    (typeof o.parking_ratio === "number" || o.parking_ratio === null) &&
    typeof o.parking_type === "string"
  );
}
function isMidRiseDetails(v: unknown): v is MidRiseDetails {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (typeof o.floor_count === "number" || o.floor_count === null) &&
    typeof o.has_elevator === "boolean" &&
    isStringArray(o.amenities)
  );
}
function isHighRiseDetails(v: unknown): v is HighRiseDetails {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    (typeof o.floor_count === "number" || o.floor_count === null) &&
    typeof o.views_premium === "string" &&
    typeof o.has_concierge === "boolean" &&
    isStringArray(o.amenities)
  );
}

function isComp(
  v: unknown,
  tenure: TenureType,
  propType: PropertyType
): v is Comp {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.name !== "string") return false;
  if (typeof o.address !== "string") return false;
  if (!(typeof o.year_built === "number" || o.year_built === null)) return false;
  if (typeof o.distance_miles !== "number") return false;
  if (typeof o.units !== "number") return false;
  if (!isByBedroom(o.unit_sizes_sf)) return false;
  if (typeof o.management_company !== "string") return false;
  if (typeof o.hud_lihtc_flag !== "boolean") return false;
  if (typeof o.affordability_tier !== "string") return false;
  if (typeof o.ami_targeting !== "string") return false;
  if (typeof o.notes !== "string") return false;
  if (tenure === "For Rent" && !isRentDetails(o.rent_details)) return false;
  if (tenure === "For Sale" && !isSaleDetails(o.sale_details)) return false;
  if (propType === "Garden Style" && !isGardenDetails(o.garden_details))
    return false;
  if (propType === "Mid-Rise" && !isMidRiseDetails(o.mid_rise_details))
    return false;
  if (propType === "High-Rise" && !isHighRiseDetails(o.high_rise_details))
    return false;
  return true;
}

function isValidResult(
  v: unknown,
  tenure: TenureType,
  propType: PropertyType
): v is ComparablesResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  const subject = o.subject as Record<string, unknown> | undefined;
  const market = o.market_summary as Record<string, unknown> | undefined;
  const hud = o.hud_insights as Record<string, unknown> | undefined;
  if (!subject || typeof subject.location !== "string") return false;
  if (typeof subject.property_type !== "string") return false;
  if (typeof subject.tenure_type !== "string") return false;
  if (typeof subject.affordability_level !== "string") return false;
  if (typeof subject.units !== "number") return false;
  if (!Array.isArray(o.comps) || o.comps.length === 0) return false;
  if (!o.comps.every((c) => isComp(c, tenure, propType))) return false;
  if (!market) return false;
  if (typeof market.submarket_analysis !== "string") return false;
  if (typeof market.subject_positioning !== "string") return false;
  if (typeof market.affordability_commentary !== "string") return false;
  if (tenure === "For Rent") {
    const rm = market.rent_metrics as Record<string, unknown> | undefined;
    if (
      !rm ||
      !isByBedroom(rm.market_rents) ||
      typeof rm.market_occupancy_pct !== "number" ||
      typeof rm.rent_growth_pct_yoy !== "number"
    )
      return false;
  } else {
    const sm = market.sale_metrics as Record<string, unknown> | undefined;
    if (
      !sm ||
      !isByBedroom(sm.market_list_prices) ||
      !isByBedroom(sm.market_price_per_sf) ||
      typeof sm.avg_days_on_market !== "number" ||
      typeof sm.price_growth_pct_yoy !== "number" ||
      typeof sm.absorption_rate_units_per_month !== "number"
    )
      return false;
  }
  if (!hud) return false;
  if (
    typeof hud.supports_proposed_metrics !== "string" ||
    !SUPPORTS_VALUES.includes(hud.supports_proposed_metrics as SupportsValue)
  )
    return false;
  if (typeof hud.support_notes !== "string") return false;
  if (typeof hud.vacancy_or_absorption_analysis !== "string") return false;
  if (!isStringArray(hud.red_flags)) return false;
  if (typeof hud.underwriting_summary !== "string") return false;
  return true;
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

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

type Body = {
  location?: unknown;
  propertyType?: unknown;
  tenureType?: unknown;
  affordabilityLevel?: unknown;
  units?: unknown;
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

    const location =
      typeof body.location === "string" ? body.location.trim() : "";
    if (!location) {
      return jsonError("Provide a project location (address, city, or market).", 400);
    }
    if (location.length > 200) {
      return jsonError("Location is too long (max 200 chars).", 400);
    }

    const propertyType =
      typeof body.propertyType === "string"
        ? (body.propertyType as PropertyType)
        : "Garden Style";
    if (!PROPERTY_TYPES.includes(propertyType)) {
      return jsonError(
        `propertyType must be one of: ${PROPERTY_TYPES.join(", ")}.`,
        400
      );
    }

    const tenureType =
      typeof body.tenureType === "string"
        ? (body.tenureType as TenureType)
        : "For Rent";
    if (!TENURE_TYPES.includes(tenureType)) {
      return jsonError(
        `tenureType must be one of: ${TENURE_TYPES.join(", ")}.`,
        400
      );
    }

    const affordabilityLevel =
      typeof body.affordabilityLevel === "string"
        ? (body.affordabilityLevel as AffordabilityLevel)
        : "Market Rate";
    if (!AFFORDABILITY_LEVELS.includes(affordabilityLevel)) {
      return jsonError(
        `affordabilityLevel must be one of: ${AFFORDABILITY_LEVELS.join(", ")}.`,
        400
      );
    }

    const units = Number(body.units);
    if (!Number.isFinite(units) || units <= 0 || units > 5000) {
      return jsonError("units must be a positive number (max 5000).", 400);
    }

    const affordabilityWithDescriptor: Record<AffordabilityLevel, string> = {
      Luxury: "Luxury (top-of-market, no AMI restrictions)",
      "Market Rate": "Market Rate (no income restrictions)",
      Workforce: "Workforce (60-80% AMI targeting)",
      Affordable: "Affordable (30-60% AMI targeting, typically LIHTC)",
    };

    const userPrompt = [
      `Build a HUD multifamily comp analysis for the following subject:`,
      ``,
      `Location: ${location}`,
      `Property type: ${propertyType}`,
      `Tenure type: ${tenureType}`,
      `Affordability level: ${affordabilityWithDescriptor[affordabilityLevel]}`,
      `Total units: ${Math.round(units)}`,
      ``,
      `Note: the borrower has not yet specified a proposed unit mix — infer a reasonable mix for this property type, tenure, and affordability tier when describing the subject and selecting comps.`,
      ``,
      `Required conditional blocks for every comp:`,
      `  - tenure: ${tenureType === "For Rent" ? "rent_details" : "sale_details"}`,
      `  - property type: ${
        propertyType === "Garden Style"
          ? "garden_details"
          : propertyType === "Mid-Rise"
            ? "mid_rise_details"
            : "high_rise_details"
      }`,
      `  - market_summary requires ${tenureType === "For Rent" ? "rent_metrics" : "sale_metrics"}`,
      ``,
      `Identify a defensible 5-8 property comp set, calibrate market metrics, and surface HUD underwriting red flags appropriate to the tenure type and affordability tier.`,
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
      console.error("[property-comparables] Anthropic call failed:", err);
      if (err instanceof Anthropic.AuthenticationError) {
        return jsonError("Invalid ANTHROPIC_API_KEY.", 401);
      }
      if (err instanceof Anthropic.RateLimitError) {
        return jsonError("Rate limited by Anthropic. Try again in a moment.", 429);
      }
      if (err instanceof Anthropic.NotFoundError) {
        return jsonError(`Model '${MODEL}' was not found.`, 404);
      }
      if (err instanceof Anthropic.BadRequestError) {
        return jsonError(`Bad request to Anthropic: ${err.message}`, 400);
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
      console.error(
        "[property-comparables] empty model response. stop_reason:",
        response.stop_reason
      );
      return jsonError(
        `The model returned no text (stop_reason: ${response.stop_reason}).`,
        502
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch {
      console.error(
        "[property-comparables] JSON parse failed. Raw output:\n",
        rawText
      );
      return jsonError(
        "The model returned a response that wasn't valid JSON. Try again.",
        502
      );
    }

    if (!isValidResult(parsed, tenureType, propertyType)) {
      console.error(
        "[property-comparables] response did not match expected shape for",
        tenureType,
        propertyType,
        ":",
        parsed
      );
      return jsonError(
        "The model's response did not match the expected schema for the chosen tenure and property type.",
        502
      );
    }

    return NextResponse.json({ result: parsed });
  } catch (err) {
    console.error("[property-comparables] unhandled:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(message, 500);
  }
}
