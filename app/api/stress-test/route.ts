import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const MAX_WORKBOOK_TEXT = 200_000; // chars sent to Claude

const SYSTEM_PROMPT = `You are a senior financial analyst with 20+ years of experience across investment banking, private equity, credit analysis, corporate finance, real estate, and capital markets. You have been handed a financial model to stress test and audit. Your job is to:

1. Identify the type of model (DCF, LBO, real estate proforma, credit model, operating model, merger model, budget, etc.)
2. Extract and audit every assumption across all tabs and sections
3. Stress test the model across multiple scenarios
4. Identify risks, errors, and weaknesses with institutional precision
5. Ask the hard questions that a senior banker, credit committee, or institutional investor would ask

Be direct, thorough, and unsparing regardless of asset class or model type.

Stress-test scenario selection — pick the set that fits the model type:
- Equity / DCF / LBO: revenue stress, margin compression, multiple contraction, combined downside
- Credit / debt: rate stress, coverage stress, collateral stress, combined downside
- Real estate: rent stress, vacancy stress, cost overrun, rate stress, combined
- Operating / budget: revenue miss, cost overrun, working capital stress, combined

Hard rules for the analysis:
- Every assumption must include a real institutional benchmark — never write "varies" or "context-dependent"
- Stress scenarios must show actual stressed metric values plus a PASS or FAIL flag
- Questions must be deal-specific — name the line item, sheet, or assumption you are questioning
- Flag math errors (#REF!, broken sums, hard-coded overrides in calculation cells), unit mismatches, and circular references as CRITICAL
- For real estate: flag if bridge debt is rolled into Total Project Cost or if BSPRA is included in TPC — both are CRITICAL

=== OUTPUT FORMAT ===

Return your analysis as a single GitHub-flavored MARKDOWN document. Do NOT return JSON. Do NOT wrap in code fences. Use this exact section structure and headings so the front-end can style it consistently.

# Section 1: Model Overview

**Model Type:** <one line — e.g. "HUD 221(d)(4) construction proforma">
**Sheets Analyzed:** <number>
**Quality Score:** <number 1-10>/10

**Quality Assessment:** <2-4 sentences referencing structural strengths and weaknesses>

**Key Parameters:**
- **<Parameter name>:** <value with units>
- **<Parameter name>:** <value with units>
(repeat for the most important parameters in the model — at least 4, up to 12)

# Section 2: Assumption Audit

A markdown table with one row per assumption found in the model. Use the columns shown. Rating MUST be exactly one of: Conservative, Market, Aggressive, Highly Aggressive.

| Assumption | Model Value | Benchmark | Rating | Comment |
| --- | --- | --- | --- | --- |
| <name> | <value> | <institutional benchmark> | <rating> | <1-2 sentence note> |

Audit every material assumption. Do not stop at 5 if there are 20.

# Section 3: Stress Test Scenarios

For each scenario, write the following block (no nesting under bullets — flat structure):

## <Scenario Name>

**Description:** <what is being stressed and by how much>
**Verdict:** PASS | MARGINAL | FAIL

| Metric | Stressed Value | Result |
| --- | --- | --- |
| <metric e.g. DSCR, IRR, LTV, EBITDA> | <stressed value with units> | PASS or FAIL |
(at least 3 metrics per scenario)

Repeat for every scenario you run.

# Section 4: Red Flags

List every red flag, ranked CRITICAL → HIGH → MEDIUM → LOW. Use this format with the severity in brackets at the start of the line so the renderer can color-code it:

- **[CRITICAL] <short headline>** — <1-3 sentences referencing the line item or sheet>
- **[HIGH] <short headline>** — <detail>
- **[MEDIUM] <short headline>** — <detail>
- **[LOW] <short headline>** — <detail>

# Section 5: Analyst Questions

A numbered list of the top 10 questions a credit committee, senior banker, or institutional investor would ask. Each question must reference a specific assumption, sheet, or line item from this model.

1. <question>
2. <question>
... up to 10.

# Section 6: Recommendation

**Verdict:** <one of: Proceed | Proceed with Conditions | Requires Revision | Do Not Proceed>

**Conditions:** (only if verdict is "Proceed with Conditions" or "Requires Revision" — otherwise omit this block)
- <condition>
- <condition>

**Memo Summary:** <4-8 sentence credit-memo-grade paragraph integrating the assumption audit, scenario results, and red flags into a single recommendation rationale>

Stop here. Do NOT add any extra commentary after Section 6.`;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function readWorkbook(
  file: File
): Promise<{ text: string; sheetCount: number }> {
  const XLSX = await import("xlsx");
  const buffer = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buffer, {
    type: "buffer",
    cellFormula: true,
    cellNF: true,
  });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    parts.push(`=== Sheet: ${name} ===\n${csv}`);
  }
  let combined = parts.join("\n\n");
  if (combined.length > MAX_WORKBOOK_TEXT) {
    combined =
      combined.slice(0, MAX_WORKBOOK_TEXT) +
      "\n\n[... workbook truncated for size ...]";
  }
  return { text: combined, sheetCount: wb.SheetNames.length };
}

export type StressTestResponse = {
  report_markdown: string;
  meta: {
    file_name: string;
    sheet_count: number;
    analyzed_at: string;
  };
};

/**
 * Strip a single set of leading/trailing markdown code fences if Claude
 * accidentally wraps the document despite the instruction not to.
 */
function unwrapFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:[a-zA-Z0-9_-]*)\s*\n([\s\S]*?)\n```$/;
  const m = trimmed.match(fence);
  return m ? m[1].trim() : trimmed;
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
      return jsonError("Expected multipart/form-data with a 'file' field.", 400);
    }

    const item = formData.get("file");
    if (!(item instanceof File) || item.size === 0) {
      return jsonError("Upload an .xlsx file in the 'file' field.", 400);
    }
    if (item.size > MAX_FILE_SIZE_BYTES) {
      return jsonError(
        `File too large (${(item.size / 1024 / 1024).toFixed(1)} MB). Max ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
        413
      );
    }

    const name = item.name.toLowerCase();
    if (!/\.xlsx?$/i.test(name)) {
      return jsonError("Only Excel (.xlsx, .xls) workbooks are supported.", 400);
    }

    let workbookText: string;
    let sheetCount: number;
    try {
      const parsed = await readWorkbook(item);
      workbookText = parsed.text;
      sheetCount = parsed.sheetCount;
    } catch (err) {
      console.error("[stress-test] xlsx parse failed:", err);
      return jsonError(
        "Could not parse the workbook. Save as .xlsx (Excel 2007+) and try again.",
        400
      );
    }

    if (!workbookText.trim()) {
      return jsonError("The workbook appears to be empty.", 400);
    }

    const userPrompt = [
      `## Source workbook`,
      `File: ${item.name}`,
      `Sheets: ${sheetCount}`,
      ``,
      `## Workbook contents (CSV per sheet, formulas preserved where readable)`,
      workbookText,
      ``,
      `Stress test, audit, and write the markdown report following the exact section structure in your instructions.`,
    ].join("\n");

    const client = new Anthropic();
    let response;
    try {
      response = await client.messages.create({
        model: MODEL,
        // A full 6-section report (assumption table, multiple stress scenarios,
        // ranked red flags, 10 deep analyst questions, memo summary) regularly
        // runs 5-12k tokens. 8192 was clipping the tail of Section 5 mid-question.
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (err) {
      console.error("[stress-test] Anthropic call failed:", err);
      if (err instanceof Anthropic.AuthenticationError) {
        return jsonError("Invalid ANTHROPIC_API_KEY.", 401);
      }
      if (err instanceof Anthropic.RateLimitError) {
        return jsonError("Rate limited by Anthropic. Try again in a moment.", 429);
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

    // If Claude actually ran out of room (stop_reason === "max_tokens"),
    // log it so we know to bump the cap further. The PDF will still render
    // whatever was returned — this is a warning, not a failure.
    if (response.stop_reason === "max_tokens") {
      console.warn(
        "[stress-test] Claude hit max_tokens cap — report likely truncated. Increase max_tokens."
      );
    }

    const result: StressTestResponse = {
      report_markdown: unwrapFences(rawText),
      meta: {
        file_name: item.name,
        sheet_count: sheetCount,
        analyzed_at: new Date().toISOString(),
      },
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[stress-test] unhandled:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(message, 500);
  }
}
