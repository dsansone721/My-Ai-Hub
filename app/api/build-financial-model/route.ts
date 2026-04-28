import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SecEdgarError, fetchAllFinancials } from "@/lib/sec-edgar";
import { fetchCurrentPrice } from "@/lib/quote";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const MODEL_TYPES = ["DCF", "LBO", "Comps"] as const;
type ModelType = (typeof MODEL_TYPES)[number];

const SYSTEM_PROMPT = `You are a senior investment analyst building a clean, defensible financial model for an equity research deliverable.

You will receive:
- The model type to build (DCF, LBO, or Comps)
- The current market price (when available)
- Real historical financials from SEC EDGAR XBRL company facts (~5 years of audited annual 10-K data: income statement, balance sheet, and cash flow). Pre-parsed into a structured year-by-year array with consistent field names.
- A current market price fetched from a separate live quote source. It will normally be a number; treat it as null only if the user message says null.

Build the model using the real numbers. Project 5 years forward with explicit assumptions. Be specific — quote real revenue, EBITDA, debt, share count, etc. from the data. If a data point is missing, say so in 'Not disclosed' rather than fabricating it.

Return ONLY a single JSON object that matches this exact shape — no markdown fences, no preamble, no trailing commentary:

{
  "ticker": "string (uppercase)",
  "company_name": "string",
  "model_type": "DCF" | "LBO" | "Comps",
  "current_price": number | null,
  "implied_value": number,
  "upside_pct": number | null,
  "summary": "2-3 sentences explaining the headline result of the model.",
  "assumptions": [
    { "label": "string", "value": "string" }
  ],
  "projections": {
    "headers": ["string", "..."],
    "rows": [
      { "cells": ["string", "..."] }
    ]
  },
  "valuation_breakdown": [
    { "label": "string", "value": "string" }
  ],
  "sensitivity": {
    "title": "string (e.g. 'Implied Share Price ($)')",
    "row_label": "string",
    "col_label": "string",
    "row_values": ["string", "..."],
    "col_values": ["string", "..."],
    "matrix": [[number, "..."], "..."]
  },
  "key_takeaways": ["string", "..."]
}

Per model type:

DCF:
- assumptions: include revenue growth, EBITDA margin, tax rate, capex % of revenue, change in NWC, WACC, terminal growth
- projections headers: ["Year", "Revenue ($M)", "Growth %", "EBITDA ($M)", "EBITDA Margin %", "Free Cash Flow ($M)"]
- projections rows: 5 forecast years
- valuation_breakdown: PV of FCFs, terminal value, PV of terminal value, enterprise value, less net debt, equity value, shares outstanding, implied share price
- sensitivity: rows = WACC (5 values, e.g. 8.0% to 12.0%), cols = terminal growth (5 values, e.g. 1.0% to 5.0%), matrix cells = implied share price

LBO:
- assumptions: purchase multiple (EV/EBITDA), total debt, equity check, interest rate, hold period (5 years), exit multiple
- projections headers: ["Year", "Revenue ($M)", "EBITDA ($M)", "Cash Interest ($M)", "FCF ($M)", "Net Debt ($M)"]
- projections rows: 5 hold years
- valuation_breakdown: entry EV, entry equity, exit EV, debt repaid, exit equity, MOIC, IRR
- sensitivity: rows = entry multiple (5 values), cols = exit multiple (5 values), matrix cells = sponsor IRR % (one decimal)

Comps:
- assumptions: peer set (3-6 named tickers), key multiples used, blended multiples, control premium if any
- projections headers: ["Peer", "EV/EBITDA (LTM)", "EV/Revenue (LTM)", "P/E (NTM)"]
- projections rows: one per peer
- valuation_breakdown: company LTM revenue, EBITDA, EPS; implied EV at chosen multiple, less net debt, equity value, shares, implied share price
- sensitivity: rows = EV/EBITDA multiple (5 values across the peer range), cols = EBITDA scenario ("LTM", "Consensus", "Bull", "Bear", "5-Yr Avg" — choose 4-5 sensible labels), matrix cells = implied share price

Constraints:
- ALL matrix values must be plain numbers (no $, no %, no commas).
- row_values and col_values are display strings (you may include % or $ formatting).
- Use USD millions for absolute dollar amounts in projections and valuation_breakdown unless stated otherwise.
- 'implied_value' is your single best implied share price (not enterprise value).
- 'upside_pct' = (implied_value / current_price - 1) * 100, rounded to 1 decimal. Set to null if current_price is null.
- 'current_price' must equal the current_price provided in the user message exactly (or null if it was null).
`;

type ProjectionRow = { cells: string[] };
type Assumption = { label: string; value: string };

type FinancialModel = {
  ticker: string;
  company_name: string;
  model_type: ModelType;
  current_price: number | null;
  implied_value: number;
  upside_pct: number | null;
  summary: string;
  assumptions: Assumption[];
  projections: { headers: string[]; rows: ProjectionRow[] };
  valuation_breakdown: Assumption[];
  sensitivity: {
    title: string;
    row_label: string;
    col_label: string;
    row_values: string[];
    col_values: string[];
    matrix: number[][];
  };
  key_takeaways: string[];
};

function isAssumptionList(v: unknown): v is Assumption[] {
  return (
    Array.isArray(v) &&
    v.every(
      (x) =>
        x &&
        typeof x === "object" &&
        typeof (x as Assumption).label === "string" &&
        typeof (x as Assumption).value === "string"
    )
  );
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function isNumberMatrix(v: unknown): v is number[][] {
  return (
    Array.isArray(v) &&
    v.every(
      (row) => Array.isArray(row) && row.every((n) => typeof n === "number")
    )
  );
}

function isValidModel(obj: unknown): obj is FinancialModel {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const proj = o.projections as
    | { headers?: unknown; rows?: unknown }
    | undefined;
  const sens = o.sensitivity as Record<string, unknown> | undefined;
  return (
    typeof o.ticker === "string" &&
    typeof o.company_name === "string" &&
    typeof o.model_type === "string" &&
    MODEL_TYPES.includes(o.model_type as ModelType) &&
    (typeof o.current_price === "number" || o.current_price === null) &&
    typeof o.implied_value === "number" &&
    (typeof o.upside_pct === "number" || o.upside_pct === null) &&
    typeof o.summary === "string" &&
    isAssumptionList(o.assumptions) &&
    !!proj &&
    isStringArray(proj.headers) &&
    Array.isArray(proj.rows) &&
    proj.rows.every(
      (r) => r && typeof r === "object" && isStringArray((r as ProjectionRow).cells)
    ) &&
    isAssumptionList(o.valuation_breakdown) &&
    !!sens &&
    typeof sens.title === "string" &&
    typeof sens.row_label === "string" &&
    typeof sens.col_label === "string" &&
    isStringArray(sens.row_values) &&
    isStringArray(sens.col_values) &&
    isNumberMatrix(sens.matrix) &&
    isStringArray(o.key_takeaways)
  );
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

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY is not configured on the server.", 500);
    }
    let body: { ticker?: unknown; modelType?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const ticker =
      typeof body.ticker === "string" ? body.ticker.trim().toUpperCase() : "";
    if (!ticker || !TICKER_RE.test(ticker)) {
      return jsonError(
        "Provide a valid ticker symbol (1-10 letters, e.g. AAPL).",
        400
      );
    }

    const modelType =
      typeof body.modelType === "string" ? (body.modelType as ModelType) : "DCF";
    if (!MODEL_TYPES.includes(modelType)) {
      return jsonError(
        `modelType must be one of: ${MODEL_TYPES.join(", ")}.`,
        400
      );
    }

    // Fetch in parallel — fetchCurrentPrice never throws.
    const pricePromise = fetchCurrentPrice(ticker);

    let financials;
    try {
      financials = await fetchAllFinancials(ticker, 5);
    } catch (err) {
      if (err instanceof SecEdgarError) {
        console.error("[build-financial-model] SEC EDGAR:", err.message);
        return jsonError(err.message, err.status);
      }
      throw err;
    }

    if (financials.years.length === 0) {
      return jsonError(
        `SEC EDGAR returned no annual (10-K) financial facts for '${ticker}'. The company may file under a different CIK or use non-standard XBRL tags.`,
        404
      );
    }

    const currentPrice = await pricePromise;

    const userPrompt = [
      `Build a ${modelType} model for ticker ${ticker}.`,
      `Company: ${financials.entityName} (CIK ${financials.cik})`,
      `Current market price: ${currentPrice !== null ? `$${currentPrice}` : "null"}`,
      ``,
      `Data source: SEC EDGAR XBRL company facts. Annual data only (10-K, fiscal-year filings), most recent ~5 years. Per-share values are in USD/share; share counts are raw share counts; all other monetary values are in USD.`,
      ``,
      `Free cash flow has been pre-computed as (operatingCashFlow - |capex|) where both inputs were available; treat it as an input, not a derivation step.`,
      ``,
      `Year-by-year financials, sorted by reporting period end date descending. The FIRST entry in the array is the most recent fiscal year — use it as the BASE YEAR for revenue, EBITDA, and cash flow projections.`,
      JSON.stringify(financials.years, null, 2),
      ``,
      `For context, the SEC reported ${financials.availableUsGaapTags.length} distinct us-gaap tags for this company. Stick to the structured data above — do not assume access to tags not represented there.`,
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
      console.error("[build-financial-model] Anthropic call failed:", err);
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
        "[build-financial-model] empty model response. stop_reason:",
        response.stop_reason
      );
      return jsonError(
        `The model returned no text (stop_reason: ${response.stop_reason}).`,
        502
      );
    }

    const jsonText = extractJson(rawText);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      console.error(
        "[build-financial-model] JSON parse failed. Raw output:\n",
        rawText
      );
      return jsonError(
        "The model returned a response that wasn't valid JSON. Try a different ticker or model type.",
        502
      );
    }

    if (!isValidModel(parsed)) {
      console.error(
        "[build-financial-model] response did not match expected shape:",
        parsed
      );
      return jsonError(
        "The model's response did not match the expected schema.",
        502
      );
    }

    // Authoritative override: stamp the server-fetched current price and
    // recompute upside_pct so the displayed numbers are always consistent
    // regardless of what Claude returned.
    parsed.current_price = currentPrice;
    if (
      currentPrice !== null &&
      currentPrice > 0 &&
      Number.isFinite(parsed.implied_value)
    ) {
      parsed.upside_pct =
        Math.round(
          ((parsed.implied_value - currentPrice) / currentPrice) * 1000
        ) / 10;
    } else {
      parsed.upside_pct = null;
    }

    return NextResponse.json({ model: parsed });
  } catch (err) {
    console.error("[build-financial-model] unhandled:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(message, 500);
  }
}
