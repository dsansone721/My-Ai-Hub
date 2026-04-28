"use client";

import { Fragment, useRef, useState } from "react";
import {
  Gauge,
  Upload,
  Loader2,
  FileSpreadsheet,
  Download,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";
import type { StressTestResponse } from "@/app/api/stress-test/route";

const FACG_NAVY = "#1B2B6B";
const FACG_RED = "#C8102E";

export default function StressTestModelsPage() {
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<StressTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setReport(null);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/stress-test", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error ?? `Analysis failed (${res.status}).`);
      setReport(data as StressTestResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function downloadPdf() {
    if (!report) return;
    setError(null);
    setPdfLoading(true);
    try {
      const res = await fetch("/api/stress-test-pdf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ report }),
      });
      if (!res.ok) {
        let msg = `PDF generation failed (${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* not JSON */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : "stress-test-report.pdf";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Stress Test Models"
        description="Upload any financial model and get a senior-analyst stress test, assumption audit, red-flag log, and credit-memo recommendation."
        icon={Gauge}
      />

      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: FACG_NAVY }}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-semibold text-white">
              Upload Excel Model
            </h3>
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragActive
                ? "border-accent bg-accent-soft/20"
                : "border-border bg-background/40"
            }`}
          >
            <Upload className="mx-auto h-7 w-7 text-muted" />
            <p className="mt-3 text-sm text-white">
              Drag &amp; drop an Excel model (.xlsx)
            </p>
            <p className="mt-1 text-xs text-muted">
              or{" "}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="font-medium text-accent underline-offset-2 hover:underline"
                disabled={analyzing}
              >
                browse
              </button>{" "}
              — works on any model: DCF, LBO, real estate proforma, credit,
              operating, M&amp;A. 15MB max.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
              className="hidden"
              disabled={analyzing}
            />
          </div>
          {analyzing && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Analyzing model — extracting assumptions, running scenarios,
              drafting memo…
            </div>
          )}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </CardBody>
      </Card>

      {report && (
        <Card>
          <div
            className="flex items-center justify-between gap-3 rounded-t-xl px-5 py-3"
            style={{ backgroundColor: FACG_NAVY }}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/70">
                Stress Test Report
              </p>
              <p className="truncate text-sm font-semibold text-white">
                {report.meta.file_name} ·{" "}
                <span className="text-white/70">
                  {report.meta.sheet_count} sheets
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfLoading}
              className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: FACG_RED }}
            >
              {pdfLoading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" /> Download Report (.pdf)
                </>
              )}
            </button>
          </div>
          <CardBody>
            <MarkdownReport text={report.report_markdown} />
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Markdown rendering — purpose-built for the stress-test report
// ============================================================
//
// Supported blocks (in document order):
//   - # H1 → section panel header (FACG navy)
//   - ## H2 → sub-section header
//   - ### H3 → minor heading
//   - markdown table (header row + separator row + body rows)
//   - bullet list (- or *)
//   - ordered list (1. 2. 3.)
//   - paragraph (with inline **bold**, [BRACKETED] severity tags, and
//     keyword color-coding for ratings / verdicts)
//
// Rather than pulling in a markdown library, we walk lines and group
// them into blocks, then render each block.

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "h3"; text: string }
  | { kind: "para"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  function flushPara(buf: string[]) {
    const txt = buf.join(" ").trim();
    if (txt) blocks.push({ kind: "para", text: txt });
  }

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Headings
    const h1 = trimmed.match(/^#\s+(.*)$/);
    if (h1) {
      blocks.push({ kind: "h1", text: h1[1].trim() });
      i++;
      continue;
    }
    const h2 = trimmed.match(/^##\s+(.*)$/);
    if (h2) {
      blocks.push({ kind: "h2", text: h2[1].trim() });
      i++;
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.*)$/);
    if (h3) {
      blocks.push({ kind: "h3", text: h3[1].trim() });
      i++;
      continue;
    }

    // Tables — must have a header row, a separator row of pipes/dashes, then ≥1 body row
    if (trimmed.startsWith("|") && i + 1 < lines.length) {
      const sep = lines[i + 1].trim();
      if (/^\|?[\s|:-]+\|?$/.test(sep) && sep.includes("-")) {
        const header = splitRow(trimmed);
        const rows: string[][] = [];
        let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith("|")) {
          rows.push(splitRow(lines[j].trim()));
          j++;
        }
        blocks.push({ kind: "table", header, rows });
        i = j;
        continue;
      }
    }

    // Bullet list
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    // Ordered list
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Paragraph — gather consecutive non-blank, non-special lines
    const buf: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) break;
      if (/^#{1,6}\s+/.test(t)) break;
      if (/^[-*]\s+/.test(t)) break;
      if (/^\d+\.\s+/.test(t)) break;
      if (t.startsWith("|")) break;
      buf.push(t);
      i++;
    }
    flushPara(buf);
  }

  return blocks;
}

function splitRow(line: string): string[] {
  const inner = line.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => c.trim());
}

function MarkdownReport({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-4">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.kind) {
    case "h1":
      return (
        <div
          className="-mx-5 mt-2 flex items-center gap-2 px-5 py-3"
          style={{ backgroundColor: FACG_NAVY }}
        >
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: FACG_RED }}
          />
          <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-white">
            {block.text}
          </h2>
        </div>
      );
    case "h2":
      return (
        <h3 className="mt-3 border-l-4 pl-3 text-base font-semibold text-white"
          style={{ borderLeftColor: FACG_RED }}
        >
          {block.text}
        </h3>
      );
    case "h3":
      return (
        <h4 className="mt-2 text-sm font-semibold uppercase tracking-wide text-white/80">
          {block.text}
        </h4>
      );
    case "para":
      return (
        <p className="text-sm leading-relaxed text-white/90">
          <Inline text={block.text} />
        </p>
      );
    case "ul":
      return (
        <ul className="space-y-1.5">
          {block.items.map((item, i) => (
            <BulletItem key={i} text={item} />
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="space-y-2">
          {block.items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
            >
              <span
                className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ backgroundColor: FACG_NAVY }}
              >
                {i + 1}
              </span>
              <p className="text-sm leading-relaxed text-white/90">
                <Inline text={item} />
              </p>
            </li>
          ))}
        </ol>
      );
    case "table":
      return <TableView header={block.header} rows={block.rows} />;
  }
}

// Bullet items get extra love: if the line starts with [SEVERITY] we render
// it as a tinted "red flag" row with severity chip + headline + detail.
function BulletItem({ text }: { text: string }) {
  const sev = matchSeverity(text);
  if (sev) {
    return (
      <li
        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 ${sev.styles.border} ${sev.styles.bg}`}
      >
        <span
          className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${sev.styles.chip}`}
        >
          {sev.label}
        </span>
        <p className={`flex-1 text-sm leading-relaxed ${sev.styles.text}`}>
          <Inline text={sev.body} />
        </p>
      </li>
    );
  }
  return (
    <li className="flex items-start gap-2 text-sm leading-relaxed text-white/90">
      <span
        className="mt-2 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full"
        style={{ backgroundColor: FACG_RED }}
      />
      <span>
        <Inline text={text} />
      </span>
    </li>
  );
}

const SEVERITY_STYLES = {
  CRITICAL: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    text: "text-red-100",
    chip: "bg-red-500 text-white",
  },
  HIGH: {
    border: "border-orange-500/40",
    bg: "bg-orange-500/10",
    text: "text-orange-100",
    chip: "bg-orange-500 text-white",
  },
  MEDIUM: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-100",
    chip: "bg-amber-500 text-black",
  },
  LOW: {
    border: "border-blue-500/40",
    bg: "bg-blue-500/10",
    text: "text-blue-100",
    chip: "bg-blue-500 text-white",
  },
} as const;
type SeverityKey = keyof typeof SEVERITY_STYLES;

function matchSeverity(text: string): {
  label: SeverityKey;
  body: string;
  styles: (typeof SEVERITY_STYLES)[SeverityKey];
} | null {
  // Match optional **, then [SEVERITY], then optional ** wrapping it
  const m = text.match(/^\**\s*\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s*\**\s*(.*)$/i);
  if (!m) return null;
  const label = m[1].toUpperCase() as SeverityKey;
  // Strip a trailing closing ** if it pairs with the opening one
  let body = m[2].trim().replace(/^\**\s*/, "");
  // If body starts with "** ... ** —" (the title was inside its own bold),
  // leave it — Inline will render the bold properly.
  body = body.replace(/^—\s*/, "");
  return { label, body, styles: SEVERITY_STYLES[label] };
}

function TableView({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-elevated/60">
          <tr>
            {header.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-3 py-2 align-top text-left text-sm text-white/90"
                >
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// Inline rendering: **bold**, color keywords, and severity tags
// ============================================================

const KEYWORD_STYLES: { match: RegExp; className: string }[] = [
  // Verdicts (recommendation)
  {
    match: /^Do Not Proceed$/i,
    className:
      "rounded-md border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 font-bold text-red-200",
  },
  {
    match: /^Requires Revision$/i,
    className:
      "rounded-md border border-orange-500/40 bg-orange-500/15 px-1.5 py-0.5 font-bold text-orange-200",
  },
  {
    match: /^Proceed with Conditions$/i,
    className:
      "rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-bold text-amber-200",
  },
  {
    match: /^Proceed$/i,
    className:
      "rounded-md border border-emerald-500/40 bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-200",
  },
  // Ratings (assumptions)
  {
    match: /^Highly Aggressive$/i,
    className:
      "rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-semibold text-red-200",
  },
  {
    match: /^Aggressive$/i,
    className:
      "rounded-md border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 font-semibold text-orange-200",
  },
  {
    match: /^Market$/i,
    className:
      "rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-200",
  },
  {
    match: /^Conservative$/i,
    className:
      "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-200",
  },
  // Scenario verdicts
  {
    match: /^PASS$/i,
    className:
      "rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-bold text-emerald-300",
  },
  {
    match: /^FAIL$/i,
    className:
      "rounded-md bg-red-500/20 px-1.5 py-0.5 text-[11px] font-bold text-red-300",
  },
  {
    match: /^MARGINAL$/i,
    className:
      "rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-300",
  },
];

function Inline({ text }: { text: string }) {
  // Standalone-cell color-coding: if the entire trimmed text matches a
  // keyword, render the chip alone (used heavily inside table cells).
  const t = text.trim();
  for (const k of KEYWORD_STYLES) {
    if (k.match.test(t)) {
      return <span className={k.className}>{t}</span>;
    }
  }

  // Otherwise: split on **bold** and inline keywords.
  const parts = splitInline(text);
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "bold") {
          return (
            <strong key={i} className="font-semibold text-white">
              <KeywordHighlight text={p.text} />
            </strong>
          );
        }
        return (
          <Fragment key={i}>
            <KeywordHighlight text={p.text} />
          </Fragment>
        );
      })}
    </>
  );
}

function KeywordHighlight({ text }: { text: string }) {
  // Highlight inline occurrences of rating/severity/verdict keywords
  // wherever they appear (e.g. "Verdict: PASS").
  const tokens: { match: string; className: string }[] = [
    {
      match: "Do Not Proceed",
      className:
        "rounded-md border border-red-500/40 bg-red-500/15 px-1.5 py-0.5 font-bold text-red-200",
    },
    {
      match: "Requires Revision",
      className:
        "rounded-md border border-orange-500/40 bg-orange-500/15 px-1.5 py-0.5 font-bold text-orange-200",
    },
    {
      match: "Proceed with Conditions",
      className:
        "rounded-md border border-amber-500/40 bg-amber-500/15 px-1.5 py-0.5 font-bold text-amber-200",
    },
    {
      match: "Highly Aggressive",
      className:
        "rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 font-semibold text-red-200",
    },
    {
      match: "Aggressive",
      className:
        "rounded-md border border-orange-500/40 bg-orange-500/10 px-1.5 py-0.5 font-semibold text-orange-200",
    },
    {
      match: "Conservative",
      className:
        "rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-200",
    },
    {
      match: "PASS",
      className:
        "rounded-md bg-emerald-500/20 px-1.5 py-0.5 text-[11px] font-bold text-emerald-300",
    },
    {
      match: "FAIL",
      className:
        "rounded-md bg-red-500/20 px-1.5 py-0.5 text-[11px] font-bold text-red-300",
    },
    {
      match: "MARGINAL",
      className:
        "rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[11px] font-bold text-amber-300",
    },
  ];

  // Build a single regex from token matches (longest first, escape pieces)
  const escaped = tokens
    .map((t) => t.match.replace(/[.*+?^${}()|[\]\\]/g, "\\$1"))
    .map((m) => `(?:${m})`);
  const pattern = new RegExp(`\\b(${escaped.join("|")})\\b`, "g");

  const out: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      out.push(text.slice(last, match.index));
    }
    const word = match[1];
    const tone = tokens.find((t) => t.match === word);
    out.push(
      <span key={match.index} className={tone?.className ?? ""}>
        {word}
      </span>
    );
    last = match.index + word.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return (
    <>
      {out.map((piece, i) => (
        <Fragment key={i}>{piece}</Fragment>
      ))}
    </>
  );
}

type InlinePart = { kind: "text" | "bold"; text: string };

function splitInline(text: string): InlinePart[] {
  // Split on **bold** preserving order
  const parts: InlinePart[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ kind: "text", text: text.slice(last, m.index) });
    parts.push({ kind: "bold", text: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
