import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = `You are a senior equity research analyst. Read the source material the user provides — it may be an earnings transcript, press release, 10-Q/10-K excerpt, or news article — and produce a structured summary.

Return ONLY a single JSON object that strictly matches this shape (no markdown fences, no preamble, no trailing commentary):

{
  "company_overview": "1-2 sentences identifying the company, ticker if known, the reporting period, and the headline result.",
  "key_financial_metrics": {
    "revenue": "Reported revenue with units and any reported growth or beat/miss vs consensus. Use 'Not disclosed' if absent.",
    "eps": "GAAP and/or non-GAAP EPS with surprise vs consensus. Use 'Not disclosed' if absent.",
    "margins": "Gross / operating / net margin commentary, with directional change. Use 'Not disclosed' if absent.",
    "yoy_growth": "Headline year-over-year growth percentages for revenue, earnings, and any other key segment metrics. Use 'Not disclosed' if absent."
  },
  "key_takeaways": [
    "3 to 6 short bullet strings — the most important facts a portfolio manager needs to know.",
    "Each bullet should be a complete, specific sentence."
  ],
  "management_outlook": "2-4 sentences on guidance, forward commentary, and any updated targets. State 'No forward guidance provided.' if absent.",
  "bull_vs_bear": {
    "bull": ["3 to 4 short bullet strings articulating the bull case."],
    "bear": ["3 to 4 short bullet strings articulating the bear case."]
  }
}

Be specific. Quote numbers from the source whenever possible. Do not fabricate metrics that are not in the source — write 'Not disclosed' instead.`;

type EarningsSummary = {
  company_overview: string;
  key_financial_metrics: {
    revenue: string;
    eps: string;
    margins: string;
    yoy_growth: string;
  };
  key_takeaways: string[];
  management_outlook: string;
  bull_vs_bear: {
    bull: string[];
    bear: string[];
  };
};

function isValidSummary(obj: unknown): obj is EarningsSummary {
  if (!obj || typeof obj !== "object") return false;
  const o = obj as Record<string, unknown>;
  const m = o.key_financial_metrics as Record<string, unknown> | undefined;
  const bb = o.bull_vs_bear as Record<string, unknown> | undefined;
  return (
    typeof o.company_overview === "string" &&
    !!m &&
    typeof m.revenue === "string" &&
    typeof m.eps === "string" &&
    typeof m.margins === "string" &&
    typeof m.yoy_growth === "string" &&
    Array.isArray(o.key_takeaways) &&
    o.key_takeaways.every((t) => typeof t === "string") &&
    typeof o.management_outlook === "string" &&
    !!bb &&
    Array.isArray(bb.bull) &&
    bb.bull.every((t) => typeof t === "string") &&
    Array.isArray(bb.bear) &&
    bb.bear.every((t) => typeof t === "string")
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

    let body: { text?: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text) {
      return jsonError(
        "Provide a non-empty 'text' field with the earnings material.",
        400
      );
    }
    if (text.length > 200_000) {
      return jsonError(
        "Input is too long. Trim it to under ~200,000 characters.",
        413
      );
    }

    const client = new Anthropic();

    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Source material:\n\n${text}`,
          },
        ],
      });
    } catch (error) {
      console.error("[summarize-earnings] Anthropic call failed:", error);
      if (error instanceof Anthropic.AuthenticationError) {
        return jsonError("Invalid ANTHROPIC_API_KEY.", 401);
      }
      if (error instanceof Anthropic.RateLimitError) {
        return jsonError("Rate limited by Anthropic. Try again in a moment.", 429);
      }
      if (error instanceof Anthropic.NotFoundError) {
        return jsonError(
          `Model '${MODEL}' was not found by the API. Update the model ID.`,
          404
        );
      }
      if (error instanceof Anthropic.BadRequestError) {
        return jsonError(`Bad request to Anthropic: ${error.message}`, 400);
      }
      if (error instanceof Anthropic.APIError) {
        return jsonError(
          `Anthropic API error (${error.status ?? "unknown"}): ${error.message}`,
          502
        );
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      return jsonError(`Anthropic call failed: ${message}`, 502);
    }

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("");

    if (!rawText.trim()) {
      console.error(
        "[summarize-earnings] empty model response. stop_reason:",
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
    } catch (parseError) {
      console.error(
        "[summarize-earnings] JSON parse failed. Raw output:\n",
        rawText
      );
      return jsonError(
        "The model returned a response that wasn't valid JSON. Try again or shorten the input.",
        502
      );
    }

    if (!isValidSummary(parsed)) {
      console.error(
        "[summarize-earnings] response did not match expected shape:",
        parsed
      );
      return jsonError(
        "The model's response did not match the expected summary shape.",
        502
      );
    }

    return NextResponse.json({ summary: parsed });
  } catch (error) {
    console.error("[summarize-earnings] unhandled error:", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    return jsonError(message, 500);
  }
}
