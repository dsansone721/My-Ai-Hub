import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedSourcesUses, IntakeReport } from "@/lib/deal-tracker/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL = "claude-sonnet-4-6";
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
const MAX_TOTAL_BYTES = 40 * 1024 * 1024; // 40 MB across all files
const MAX_TEXT_PASTE = 30_000; // chars per pasted text field
const MAX_XLSX_TEXT = 80_000; // chars per workbook after CSV-conversion

const SYSTEM_PROMPT = `You are a senior real estate financial analyst and deal intake specialist at First American Capital Group. You have been handed a collection of documents, emails, and notes about a potential deal. Your job is to:

1. Read and synthesize everything provided across all documents simultaneously
2. Extract every deal parameter you can identify
3. Cross-reference documents — if the Excel says one thing and the email says another, flag the conflict explicitly
4. Identify exactly what information is missing
5. Generate a precise list of questions for the analyst to answer before proceeding
6. Assign a confidence score to each extracted field: HIGH (extracted directly from source), MEDIUM (inferred or estimated), LOW (missing or conflicting)

Be thorough. A missed assumption at intake costs weeks of rework downstream.

=== EXTRACTION SCHEMA (canonical DealInputs keys) ===

Project overview:
  project_name, address, city_state,
  asset_type (one of: "Workforce Multifamily", "Market Rate", "Affordable", "Senior Housing", "Student Housing"),
  hud_program (one of: "221(d)(4)", "223(f)", "231", "232", "223(a)(7)"),
  total_units, total_stories, total_acres, parking_spaces,
  construction_months, stabilization_months

Unit mix (per type — studio / one_br / two_br / three_br):
  <type>_count, <type>_sf, <type>_rent (monthly $)

Capital structure:
  hud_loan_amount, hud_note_rate (% as decimal e.g. 5.5),
  amortization_years, mip_rate (% as decimal),
  land_value, hard_costs, soft_costs_fees, financing_carrying_costs,
  bspra_amount, working_capital_escrow, iod_escrow,
  sponsor_funds_spent, sponsor_cash_to_close,
  bridge_loan_amount, bridge_rate (% as decimal), bridge_term_months

Operating assumptions:
  vacancy_collection_pct, property_mgmt_pct,
  rm_turnover, common_area_utilities, gna, payroll, operations, insurance,
  replacement_reserves, ancillary_income,
  rent_growth_pct, exit_cap_rate,
  property_tax (annual $), tax_abatement_pct

AMI rent limits:
  ami_market, ami_source,
  ami_1br_80, ami_1br_100, ami_1br_120,
  ami_2br_80, ami_2br_100, ami_2br_120

Model oversight:
  managing_director, analyst_name, date (YYYY-MM-DD)

All percent values are the percent number (5.5 for 5.5%, NOT 0.055). All dollar values are absolute dollars without commas or symbols.

=== SOURCES & USES (HIGHEST PRIORITY) ===

If anything in the upload contains a Sources & Uses table (typical Excel "Sources & Uses" / "S&U" / "Capital Structure" sheet, or OM/term-sheet pages), extract it EXACTLY AS SHOWN.

Rules:
- Capture EVERY line item visible in the Sources section and EVERY line item in the Uses section
- Use the labels VERBATIM from the spreadsheet (do not normalize, rename, or merge)
- Use the dollar amounts EXACTLY as stated (no rounding, no recalculation)
- If the spreadsheet shows a "Total Sources" or "Total Uses" line, capture those numbers in the stated_total_* fields. Do NOT recompute them.
- Do NOT fabricate an S&U from individual cost fields. Only return this block if you actually saw an S&U table.
- Note where it came from (sheet name, page, file name) in source_location.

Schema for sources_uses:
{
  "sources": [{"label": "string (verbatim)", "amount": number}, ...],
  "uses":    [{"label": "string (verbatim)", "amount": number}, ...],
  "stated_total_sources": number | null,
  "stated_total_uses": number | null,
  "source_location": "string"
}

If no S&U table exists, set sources_uses to null.

=== CONFLICT DETECTION ===

When two source documents disagree on the same parameter (e.g. Excel says 212 units, email says 218), do NOT pick one — surface the conflict and ask the analyst to confirm. Each conflict gets its own entry in report.conflicts with both candidate values and their sources.

=== QUESTION GENERATION ===

For every parameter you cannot extract with HIGH confidence (and is NOT already a conflict), generate a specific question for the analyst. Each question should:
- Reference the deal directly ("What is the current 2BR market rent?" not "What is rent?")
- Include a 1-line 'why' explaining why the answer matters downstream
- Be marked required:true if the field is critical to underwriting (project_name, city_state, hud_program, total_units, hud_loan_amount, hud_note_rate, hard_costs, the rents/counts of unit types that are present)

=== OUTPUT FORMAT ===

Return ONLY a single JSON object (no markdown fences, no preamble):

{
  "fields": {
    "project_name": "string",
    "total_units": 212,
    ...
    // Only include keys you found. Omit anything you didn't extract.
  },
  "sources_uses": { ... } | null,
  "report": {
    "summary": "1-2 sentence top-level synopsis of what this deal looks like",
    "found": [
      {
        "label": "Project Name",
        "value": "Whitfield Apartments",
        "source": "OM page 1; MD email subject line",
        "confidence": "HIGH",
        "inputs_key": "project_name"
      }
    ],
    "conflicts": [
      {
        "id": "c1",
        "label": "Total Units",
        "options": [
          { "value": "212", "source": "MD email body" },
          { "value": "218", "source": "Excel: Project Summary, cell B4" }
        ],
        "recommendation": "Excel typically more authoritative for unit counts.",
        "inputs_key": "total_units"
      }
    ],
    "questions": [
      {
        "id": "q1",
        "question": "What is the targeted construction-loan close date?",
        "why": "Drives interest reserve sizing and absorption schedule.",
        "required": true,
        "inputs_key": null
      }
    ]
  },
  "notes": "1-3 sentence summary of files processed and any document-quality flags"
}

Stable ids: number conflicts c1, c2, ... and questions q1, q2, ... so the front-end can persist answers by id.`;

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

type FileKind = "pdf" | "docx" | "xlsx" | "pptx" | "image" | "text";

function classify(file: File): FileKind | null {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  )
    return "docx";
  if (
    type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    type === "application/vnd.ms-excel" ||
    /\.xlsx?$/i.test(name)
  )
    return "xlsx";
  if (
    type === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    name.endsWith(".pptx")
  )
    return "pptx";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("text/") || /\.(csv|txt|md)$/i.test(name)) return "text";
  return null;
}

type FileBlock =
  | {
      kind: "pdf";
      mediaType: "application/pdf";
      data: string;
      sourceName: string;
    }
  | {
      kind: "image";
      mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
      data: string;
      sourceName: string;
    }
  | { kind: "text"; text: string; sourceName: string }
  | { kind: "error"; message: string };

type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function imageMediaType(file: File): ImageMediaType {
  // Map browser MIME to the four formats Claude vision accepts.
  const t = file.type.toLowerCase();
  if (t === "image/png") return "image/png";
  if (t === "image/gif") return "image/gif";
  if (t === "image/webp") return "image/webp";
  return "image/jpeg";
}

async function buildContentForFile(file: File): Promise<FileBlock> {
  const kind = classify(file);
  if (!kind) {
    return {
      kind: "error",
      message: `${file.name}: unsupported file type (${file.type || "unknown"}).`,
    };
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  if (kind === "pdf") {
    return {
      kind: "pdf",
      mediaType: "application/pdf",
      data: buffer.toString("base64"),
      sourceName: file.name,
    };
  }
  if (kind === "image") {
    return {
      kind: "image",
      mediaType: imageMediaType(file),
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
      console.error("[intake] mammoth failed:", err);
      return { kind: "error", message: `${file.name}: could not parse Word document.` };
    }
  }
  if (kind === "xlsx") {
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer", cellFormula: true, cellNF: true });
      const sheetsText = wb.SheetNames.map((name) => {
        const sheet = wb.Sheets[name];
        if (!sheet) return "";
        const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
        return `--- Sheet: ${name} ---\n${csv}`;
      })
        .filter(Boolean)
        .join("\n\n");
      if (!sheetsText.trim())
        return { kind: "error", message: `${file.name}: empty workbook.` };
      const capped =
        sheetsText.length > MAX_XLSX_TEXT
          ? sheetsText.slice(0, MAX_XLSX_TEXT) + "\n\n[... workbook truncated ...]"
          : sheetsText;
      return { kind: "text", text: capped, sourceName: file.name };
    } catch (err) {
      console.error("[intake] xlsx failed:", err);
      return { kind: "error", message: `${file.name}: could not parse Excel workbook.` };
    }
  }
  if (kind === "pptx") {
    // .pptx is a ZIP. Without an unzip dep, scrape <a:t> text spans from the
    // raw bytes — works well enough for analyst prose, slide titles, table cells.
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
    return { kind: "text", text: matches.join("\n"), sourceName: file.name };
  }
  if (kind === "text") {
    const text = buffer.toString("utf-8").trim();
    if (!text) return { kind: "error", message: `${file.name}: empty file.` };
    return { kind: "text", text, sourceName: file.name };
  }
  return {
    kind: "error",
    message: `${file.name}: unsupported file type.`,
  };
}

// =====================================================================
// Validators (defensive — Claude is told the schema but we don't trust it)
// =====================================================================

const CONFIDENCES = new Set(["HIGH", "MEDIUM", "LOW"]);

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

function parseSourcesUses(v: unknown): ExtractedSourcesUses | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const parseList = (x: unknown): { label: string; amount: number }[] | null => {
    if (!Array.isArray(x)) return null;
    const rows: { label: string; amount: number }[] = [];
    for (const item of x) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      if (typeof r.label !== "string") continue;
      if (typeof r.amount !== "number" || !Number.isFinite(r.amount)) continue;
      if (r.amount <= 0) continue;
      rows.push({ label: r.label.trim(), amount: r.amount });
    }
    return rows;
  };
  const sources = parseList(o.sources);
  const uses = parseList(o.uses);
  if (!sources || !uses) return null;
  if (sources.length === 0 && uses.length === 0) return null;
  return {
    sources,
    uses,
    stated_total_sources:
      typeof o.stated_total_sources === "number" && Number.isFinite(o.stated_total_sources)
        ? o.stated_total_sources
        : null,
    stated_total_uses:
      typeof o.stated_total_uses === "number" && Number.isFinite(o.stated_total_uses)
        ? o.stated_total_uses
        : null,
    source_location: asString(o.source_location, "Uploaded model"),
  };
}

function validateReport(v: unknown, filesProcessed: string[]): IntakeReport {
  const o = (v ?? {}) as Record<string, unknown>;

  const found: IntakeReport["found"] = [];
  if (Array.isArray(o.found)) {
    o.found.forEach((raw, i) => {
      const f = raw as Record<string, unknown>;
      if (typeof f?.label !== "string") return;
      const conf = asString(f.confidence).toUpperCase();
      found.push({
        label: f.label,
        value: asString(f.value, "—"),
        source: asString(f.source, "—"),
        confidence: (CONFIDENCES.has(conf) ? conf : "MEDIUM") as
          | "HIGH"
          | "MEDIUM"
          | "LOW",
        inputs_key:
          typeof f.inputs_key === "string" && f.inputs_key
            ? (f.inputs_key as IntakeReport["found"][number]["inputs_key"])
            : undefined,
      });
      void i;
    });
  }

  const conflicts: IntakeReport["conflicts"] = [];
  if (Array.isArray(o.conflicts)) {
    o.conflicts.forEach((raw, i) => {
      const c = raw as Record<string, unknown>;
      if (typeof c?.label !== "string") return;
      if (!Array.isArray(c.options)) return;
      const options: { value: string; source: string }[] = [];
      for (const opt of c.options) {
        const r = opt as Record<string, unknown>;
        if (typeof r?.value !== "string") continue;
        options.push({
          value: r.value,
          source: asString(r.source, "—"),
        });
      }
      if (options.length < 2) return; // not really a conflict
      conflicts.push({
        id: asString(c.id, `c${i + 1}`),
        label: c.label,
        options,
        recommendation:
          typeof c.recommendation === "string" && c.recommendation.trim()
            ? c.recommendation
            : undefined,
        inputs_key:
          typeof c.inputs_key === "string" && c.inputs_key
            ? (c.inputs_key as IntakeReport["conflicts"][number]["inputs_key"])
            : undefined,
      });
    });
  }

  const questions: IntakeReport["questions"] = [];
  if (Array.isArray(o.questions)) {
    o.questions.forEach((raw, i) => {
      const q = raw as Record<string, unknown>;
      if (typeof q?.question !== "string") return;
      questions.push({
        id: asString(q.id, `q${i + 1}`),
        question: q.question,
        why:
          typeof q.why === "string" && q.why.trim() ? q.why.trim() : undefined,
        required: q.required === true,
        inputs_key:
          typeof q.inputs_key === "string" && q.inputs_key
            ? (q.inputs_key as IntakeReport["questions"][number]["inputs_key"])
            : undefined,
      });
    });
  }

  return {
    summary: asString(o.summary, ""),
    found,
    conflicts,
    questions,
    files_processed: filesProcessed,
  };
}

export type IntakeResponse = {
  fields: Record<string, unknown>;
  sources_uses: ExtractedSourcesUses | null;
  report: IntakeReport;
  notes: string;
  filesProcessed: number;
};

// =====================================================================
// Handler
// =====================================================================

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return jsonError("ANTHROPIC_API_KEY is not configured on the server.", 500);
    }

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return jsonError("Expected multipart/form-data.", 400);
    }

    // --- Files ---
    const fileItems = formData.getAll("file");
    const files: File[] = [];
    let totalBytes = 0;
    for (const item of fileItems) {
      if (!(item instanceof File)) continue;
      if (item.size === 0) continue;
      if (item.size > MAX_FILE_SIZE_BYTES) {
        return jsonError(
          `${item.name} is too large (max ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB per file).`,
          413
        );
      }
      totalBytes += item.size;
      files.push(item);
    }
    if (totalBytes > MAX_TOTAL_BYTES) {
      return jsonError(
        `Total upload size exceeds ${MAX_TOTAL_BYTES / 1024 / 1024}MB.`,
        413
      );
    }

    // --- Pasted text fields ---
    const emailRaw = formData.get("email");
    const blurbRaw = formData.get("blurb");
    const email =
      typeof emailRaw === "string" ? emailRaw.trim().slice(0, MAX_TEXT_PASTE) : "";
    const blurb =
      typeof blurbRaw === "string" ? blurbRaw.trim().slice(0, MAX_TEXT_PASTE) : "";

    if (files.length === 0 && !email && !blurb) {
      return jsonError(
        "Provide at least one file, an email paste, or a deal description.",
        400
      );
    }

    // --- Build the user-content blocks for Claude ---
    const errors: string[] = [];
    const filesProcessed: string[] = [];
    const userContent: Anthropic.MessageParam["content"] = [
      {
        type: "text",
        text: `Intake package for analysis. Synthesize across all of the items below into a single triage report.`,
      },
    ];

    if (blurb) {
      userContent.push({
        type: "text",
        text: `=== DEAL DESCRIPTION (analyst's words) ===\n${blurb}`,
      });
    }
    if (email) {
      userContent.push({
        type: "text",
        text: `=== EMAIL FROM MD ===\n${email}`,
      });
    }

    for (const file of files) {
      const piece = await buildContentForFile(file);
      if (piece.kind === "error") {
        errors.push(piece.message);
        continue;
      }
      if (piece.kind === "pdf") {
        userContent.push({
          type: "document",
          source: { type: "base64", media_type: piece.mediaType, data: piece.data },
        });
        userContent.push({
          type: "text",
          text: `(PDF source: ${piece.sourceName})`,
        });
        filesProcessed.push(piece.sourceName);
      } else if (piece.kind === "image") {
        userContent.push({
          type: "image",
          source: { type: "base64", media_type: piece.mediaType, data: piece.data },
        });
        userContent.push({
          type: "text",
          text: `(Image source: ${piece.sourceName} — extract any visible text/data)`,
        });
        filesProcessed.push(piece.sourceName);
      } else {
        userContent.push({
          type: "text",
          text: `=== FILE: ${piece.sourceName} ===\n${piece.text}`,
        });
        filesProcessed.push(piece.sourceName);
      }
    }

    // userContent length 1 = only the seed instruction; need real content too.
    if (userContent.length === 1) {
      return jsonError(
        `No usable file content to analyze. ${errors.join(" ")}`.trim(),
        400
      );
    }

    // --- Run Claude ---
    const client = new Anthropic();
    let response;
    try {
      response = await client.messages.create(
        {
          model: MODEL,
          // Intake reports run long: full found-table + multi-conflict block +
          // 5-15 gap questions can hit 4-6k output tokens.
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userContent }],
        },
        // Hard request timeout — fail clearly before Vercel's hard kill.
        { timeout: 90_000 }
      );
    } catch (err) {
      console.error("[intake] Anthropic call failed:", err);
      if (err instanceof Anthropic.AuthenticationError) {
        return jsonError("Invalid ANTHROPIC_API_KEY.", 401);
      }
      if (err instanceof Anthropic.RateLimitError) {
        return jsonError("Rate limited by Anthropic. Try again in a moment.", 429);
      }
      if (err instanceof Anthropic.APIConnectionTimeoutError) {
        return jsonError(
          "Anthropic took too long to respond. Try again — intake usually returns in under 60 seconds.",
          504
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
      console.error("[intake] JSON parse failed. Raw:\n", rawText.slice(0, 2000));
      return jsonError("The model returned a response that wasn't valid JSON.", 502);
    }
    if (!parsed || typeof parsed !== "object") {
      return jsonError("Intake response was not an object.", 502);
    }
    const obj = parsed as {
      fields?: unknown;
      sources_uses?: unknown;
      report?: unknown;
      notes?: unknown;
    };

    const fields =
      obj.fields && typeof obj.fields === "object"
        ? (obj.fields as Record<string, unknown>)
        : {};
    const sources_uses = parseSourcesUses(obj.sources_uses);
    const report = validateReport(obj.report, filesProcessed);

    const notes =
      (typeof obj.notes === "string" ? obj.notes : "") +
      (errors.length > 0 ? `\n\nFile errors: ${errors.join("; ")}` : "");

    const result: IntakeResponse = {
      fields,
      sources_uses,
      report,
      notes: notes.trim(),
      filesProcessed: filesProcessed.length,
    };
    return NextResponse.json(result);
  } catch (err) {
    console.error("[intake] unhandled:", err);
    const message = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(message, 500);
  }
}
