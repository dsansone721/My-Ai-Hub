import { NextRequest, NextResponse } from "next/server";
import { SecEdgarError, fetchAllFinancials } from "@/lib/sec-edgar";

export const runtime = "nodejs";
export const maxDuration = 60;

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  try {
    let body: { ticker?: unknown };
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

    try {
      const financials = await fetchAllFinancials(ticker);
      return NextResponse.json({ financials });
    } catch (err) {
      if (err instanceof SecEdgarError) {
        console.error("[fetch-financials] SEC EDGAR error:", err.message);
        return jsonError(err.message, err.status);
      }
      throw err;
    }
  } catch (err) {
    console.error("[fetch-financials] unhandled:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(message, 500);
  }
}
