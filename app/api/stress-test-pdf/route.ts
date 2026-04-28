import { NextRequest, NextResponse } from "next/server";
import type { StressTestResponse } from "@/app/api/stress-test/route";

export const runtime = "nodejs";
export const maxDuration = 60;

const FACG_NAVY = "#1B2B6B";
const FACG_RED = "#C8102E";
const TEXT = "#0E1116";
const MUTED = "#5A5F6A";
const HAIRLINE = "#D7DBE0";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#DC2626",
  HIGH: "#F97316",
  MEDIUM: "#EAB308",
  LOW: "#3B82F6",
};
const RATING_COLORS: Record<string, string> = {
  Conservative: "#22C55E",
  Market: "#EAB308",
  Aggressive: "#F97316",
  "Highly Aggressive": "#DC2626",
};
const VERDICT_COLORS: Record<string, string> = {
  Proceed: "#22C55E",
  "Proceed with Conditions": "#EAB308",
  "Requires Revision": "#F97316",
  "Do Not Proceed": "#DC2626",
  PASS: "#22C55E",
  FAIL: "#DC2626",
  MARGINAL: "#EAB308",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

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
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }
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
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function stripBold(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1");
}

export async function POST(req: NextRequest) {
  try {
    const parsed = await req.json().catch(() => null);
    if (!parsed || typeof parsed !== "object") {
      return jsonError("Invalid JSON body.", 400);
    }
    const body = parsed as { report?: StressTestResponse };
    const report = body.report;
    if (!report?.report_markdown) {
      return jsonError("Missing 'report.report_markdown' in body.", 400);
    }

    const PDFKitMod = await import("pdfkit");
    const PDFDocument = (PDFKitMod.default ?? PDFKitMod) as unknown as new (
      opts?: Record<string, unknown>
    ) => PDFKit.PDFDocument;

    const blocks = parseBlocks(report.report_markdown);

    const buffer: Buffer = await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: "LETTER",
        margins: { top: 64, bottom: 72, left: 56, right: 56 },
        // CRITICAL: bufferPages keeps every page in memory until doc.end().
        // Without it pdfkit flushes pages as they fill — bufferedPageRange()
        // then returns only the current page (so footers all say "Page 1 of 1"),
        // and any content rendered into a flushed page is silently dropped
        // (which is why the last section was truncating mid-question).
        bufferPages: true,
        info: {
          Title: `Stress Test Report — ${report.meta?.file_name ?? "Model"}`,
          Author: "FACG",
          Subject: "Model Stress Test & Audit",
        },
      });
      const chunks: Buffer[] = [];
      doc.on("data", (c: Buffer) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      cover(doc, report);
      doc.addPage();
      for (const b of blocks) renderBlock(doc, b);
      // Decorate (footer + page numbers) only after every block has been
      // rendered, so bufferedPageRange().count reflects the true page total.
      decorateAllPages(doc);

      doc.end();
    });

    const safeName = (report.meta?.file_name ?? "model")
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `${safeName}_FACG_StressTest.pdf`;

    const pdfBytes = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );

    return new NextResponse(pdfBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[stress-test-pdf] unhandled:", err);
    const m = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(m, 500);
  }
}

function cover(doc: PDFKit.PDFDocument, r: StressTestResponse) {
  const W = doc.page.width;
  doc.save();
  doc.rect(0, 0, W, 220).fill(FACG_NAVY);
  doc.rect(0, 220, W, 6).fill(FACG_RED);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(11);
  doc.text("FIRST AMERICAN CAPITAL GROUP", 56, 56, { characterSpacing: 2 });
  doc.fontSize(28).text("Model Stress Test & Audit", 56, 96, { width: W - 112 });
  doc.font("Helvetica").fontSize(12).fillColor("#C9D0E5");
  doc.text(
    "Senior-analyst review of model assumptions, stress sensitivity, and institutional readiness.",
    56,
    156,
    { width: W - 112 }
  );
  doc.restore();

  let y = 280;
  const labelX = 56;
  const valueX = 200;
  const line = (label: string, value: string) => {
    doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(12);
    doc.text(label, labelX, y);
    doc.font("Helvetica").fillColor(MUTED);
    doc.text(value, valueX, y, { width: W - valueX - 56 });
    y = doc.y + 14;
  };
  line("Model file", r.meta?.file_name ?? "—");
  line("Sheets analyzed", String(r.meta?.sheet_count ?? "—"));
  line("Generated", new Date(r.meta?.analyzed_at ?? Date.now()).toLocaleString());
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  const bottom = doc.page.height - 72;
  if (doc.y + needed > bottom) doc.addPage();
}

function renderBlock(doc: PDFKit.PDFDocument, b: Block) {
  switch (b.kind) {
    case "h1":
      return renderH1(doc, b.text);
    case "h2":
      return renderH2(doc, b.text);
    case "h3":
      return renderH3(doc, b.text);
    case "para":
      return renderParagraph(doc, b.text);
    case "ul":
      return renderBulletList(doc, b.items);
    case "ol":
      return renderOrderedList(doc, b.items);
    case "table":
      return renderTable(doc, b.header, b.rows);
  }
}

function renderH1(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 48);
  const W = doc.page.width;
  const y = doc.y + 6;
  doc.save();
  doc.rect(56, y, W - 112, 28).fill(FACG_NAVY);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(11);
  doc.text(text.toUpperCase(), 68, y + 9, {
    width: W - 136,
    characterSpacing: 1.2,
    lineBreak: false,
  });
  doc.restore();
  doc.y = y + 36;
}

function renderH2(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 30);
  const W = doc.page.width;
  doc.save();
  const y = doc.y + 4;
  doc.rect(56, y, 4, 16).fill(FACG_RED);
  doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(13);
  doc.text(stripBold(text), 66, y, { width: W - 122, lineBreak: false });
  doc.restore();
  doc.y = y + 22;
}

function renderH3(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 22);
  doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(10);
  doc.text(stripBold(text).toUpperCase(), { characterSpacing: 1.2 });
  doc.moveDown(0.2);
}

function renderParagraph(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 20);
  // Color-code "**Verdict:** PASS" and similar leading labels by detecting
  // a known verdict/rating keyword inline. For simplicity here we render
  // the paragraph plain text but with bold runs honored.
  renderInlineParagraph(doc, text);
  doc.moveDown(0.4);
}

function renderInlineParagraph(doc: PDFKit.PDFDocument, text: string) {
  const W = doc.page.width;
  const segments = splitBoldSegments(text);
  doc.fillColor(TEXT).fontSize(10);
  // Use continued: true to keep on the same paragraph
  segments.forEach((seg, i) => {
    doc.font(seg.bold ? "Helvetica-Bold" : "Helvetica");
    const colored = pickKeywordColor(seg.text);
    if (colored) {
      doc.fillColor(colored.color);
    } else {
      doc.fillColor(TEXT);
    }
    doc.text(seg.text, {
      width: W - 112,
      continued: i < segments.length - 1,
    });
  });
  // Reset color
  doc.fillColor(TEXT);
}

function renderBulletList(doc: PDFKit.PDFDocument, items: string[]) {
  for (const it of items) {
    const sev = matchSeverity(it);
    if (sev) {
      renderRedFlagItem(doc, sev.label, sev.body);
    } else {
      renderBulletItem(doc, it);
    }
  }
  doc.moveDown(0.3);
}

function renderBulletItem(doc: PDFKit.PDFDocument, text: string) {
  ensureSpace(doc, 18);
  const W = doc.page.width;
  const y = doc.y;
  doc.save();
  doc.circle(64, y + 6, 1.8).fill(FACG_RED);
  doc.restore();
  doc.fillColor(TEXT).font("Helvetica").fontSize(10);
  doc.text(stripBold(text), 72, y, { width: W - 128 });
  doc.moveDown(0.2);
}

function renderRedFlagItem(
  doc: PDFKit.PDFDocument,
  label: string,
  body: string
) {
  const W = doc.page.width;
  const innerW = W - 112 - 16; // padding inside the box
  doc.fontSize(10).font("Helvetica");
  const bodyHeight = doc.heightOfString(stripBold(body), { width: innerW });
  const rowH = bodyHeight + 28;
  ensureSpace(doc, rowH + 4);
  const y = doc.y;
  const color = SEVERITY_COLORS[label] ?? MUTED;
  doc.save();
  doc.rect(56, y, W - 112, rowH).fill("#FAFAFB");
  doc.rect(56, y, 4, rowH).fill(color);
  // Severity chip
  doc.fillColor(color).font("Helvetica-Bold").fontSize(8);
  doc.text(label, 68, y + 8, { characterSpacing: 1.4, lineBreak: false });
  // Body text
  doc.fillColor(TEXT).font("Helvetica").fontSize(10);
  doc.text(stripBold(body), 68, y + 22, { width: innerW });
  doc.restore();
  doc.y = y + rowH + 4;
}

function renderOrderedList(doc: PDFKit.PDFDocument, items: string[]) {
  items.forEach((it, idx) => {
    const W = doc.page.width;
    const innerW = W - 56 - 92 - 12; // text starts at x=92, right margin at W-56, with 12pt right padding
    const text = stripBold(it);

    // Measure first so we can reserve enough vertical space and decide
    // whether to break to a new page BEFORE we draw anything.
    doc.fontSize(10).font("Helvetica");
    const measuredH = doc.heightOfString(text, { width: innerW });
    // Generous padding: heightOfString rounds down per-line and we want a
    // visual breathing room around the text inside the row background.
    const rowH = Math.max(measuredH + 18, 30);
    ensureSpace(doc, rowH + 6);

    const y = doc.y;
    // Background + number bubble first…
    doc.save();
    doc.rect(56, y, W - 112, rowH).fill("#F4F6FB");
    doc.circle(74, y + 18, 9).fill(FACG_NAVY);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9);
    doc.text(String(idx + 1), 70, y + 14, {
      width: 12,
      align: "center",
      lineBreak: false,
    });
    doc.restore();

    // …then the question text on top, in flow mode (no `height` cap so
    // pdfkit can never clip the tail of the last question).
    doc.save();
    doc.fillColor(TEXT).font("Helvetica").fontSize(10);
    doc.text(text, 92, y + 9, { width: innerW });
    doc.restore();

    // Advance to the bottom of whichever is taller — the measured
    // background or where pdfkit's text cursor actually ended up. This
    // protects against the rare case where the measurement underestimates.
    const renderedBottom = Math.max(y + rowH, doc.y);
    doc.y = renderedBottom + 4;
  });
  doc.moveDown(0.3);
}

function renderTable(
  doc: PDFKit.PDFDocument,
  header: string[],
  rows: string[][]
) {
  const W = doc.page.width;
  const tableW = W - 112;
  const cols = header.length;
  if (cols === 0) return;
  // Column widths: distribute proportionally with first column wider
  const colW: number[] = [];
  if (cols === 1) {
    colW.push(tableW);
  } else {
    const first = Math.round(tableW * 0.28);
    const rest = Math.floor((tableW - first) / (cols - 1));
    colW.push(first);
    for (let k = 1; k < cols - 1; k++) colW.push(rest);
    colW.push(tableW - first - rest * (cols - 2));
  }

  ensureSpace(doc, 30);
  // Header row
  let y = doc.y;
  doc.save();
  doc.rect(56, y, tableW, 20).fill("#EEF1F7");
  let x = 56;
  doc.fillColor(TEXT).font("Helvetica-Bold").fontSize(9);
  for (let i = 0; i < cols; i++) {
    doc.text(header[i] ?? "", x + 6, y + 6, {
      width: colW[i] - 12,
      lineBreak: false,
    });
    x += colW[i];
  }
  doc.restore();
  y += 22;
  doc.y = y;

  for (const row of rows) {
    // Compute row height from tallest cell
    let maxH = 0;
    const cellHeights: number[] = [];
    doc.fontSize(9).font("Helvetica");
    for (let i = 0; i < cols; i++) {
      const cell = stripBold(row[i] ?? "");
      const h = doc.heightOfString(cell, { width: colW[i] - 12 });
      cellHeights.push(h);
      if (h > maxH) maxH = h;
    }
    const rowH = Math.max(maxH, 12) + 8;
    ensureSpace(doc, rowH + 2);
    const yr = doc.y;
    let xr = 56;
    for (let i = 0; i < cols; i++) {
      const cell = (row[i] ?? "").trim();
      const colored = pickKeywordColor(cell);
      doc.save();
      if (colored) {
        // Draw chip background for the cell
        const tw = doc.font("Helvetica-Bold").fontSize(9).widthOfString(cell);
        const chipW = Math.min(tw + 10, colW[i] - 12);
        doc.rect(xr + 6, yr + 2, chipW, 14).fill(colored.color + "30");
        doc.fillColor(colored.color).font("Helvetica-Bold").fontSize(9);
        doc.text(cell, xr + 11, yr + 4, {
          width: colW[i] - 12,
          lineBreak: false,
        });
      } else {
        doc.fillColor(TEXT).font("Helvetica").fontSize(9);
        doc.text(stripBold(cell), xr + 6, yr + 4, { width: colW[i] - 12 });
      }
      doc.restore();
      xr += colW[i];
    }
    // Underline
    doc.save();
    doc
      .moveTo(56, yr + rowH)
      .lineTo(56 + tableW, yr + rowH)
      .strokeColor(HAIRLINE)
      .lineWidth(0.5)
      .stroke();
    doc.restore();
    doc.y = yr + rowH;
  }
  doc.moveDown(0.4);
}

function matchSeverity(
  text: string
): { label: keyof typeof SEVERITY_COLORS; body: string } | null {
  const m = text.match(/^\**\s*\[(CRITICAL|HIGH|MEDIUM|LOW)\]\s*\**\s*(.*)$/i);
  if (!m) return null;
  const label = m[1].toUpperCase() as keyof typeof SEVERITY_COLORS;
  const body = m[2].trim().replace(/^—\s*/, "");
  return { label, body };
}

function pickKeywordColor(
  raw: string
): { color: string; word: string } | null {
  const t = raw.trim();
  if (RATING_COLORS[t]) return { color: RATING_COLORS[t], word: t };
  if (VERDICT_COLORS[t]) return { color: VERDICT_COLORS[t], word: t };
  return null;
}

function splitBoldSegments(
  text: string
): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ text: text.slice(last, m.index), bold: false });
    }
    out.push({ text: m[1], bold: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

function decorateAllPages(doc: PDFKit.PDFDocument) {
  const range = doc.bufferedPageRange();
  const pageCount = range.count;
  for (let i = range.start; i < range.start + pageCount; i++) {
    doc.switchToPage(i);
    doc.save();
    const W = doc.page.width;
    const H = doc.page.height;
    const fy = H - 40;
    doc
      .strokeColor(HAIRLINE)
      .lineWidth(0.5)
      .moveTo(56, fy - 6)
      .lineTo(W - 56, fy - 6)
      .stroke();
    doc.fillColor(MUTED).font("Helvetica").fontSize(8);
    doc.text("First American Capital Group · Confidential", 56, fy, {
      lineBreak: false,
    });
    const pageStr = `Page ${i - range.start + 1} of ${pageCount}`;
    const pageStrW = doc.widthOfString(pageStr);
    doc.text(pageStr, W - 56 - pageStrW, fy, { lineBreak: false });
    doc.restore();
  }
}
