import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  computeMetrics,
  type DealInputs,
  type UnderwritingResult,
  type WizardComparables,
  type StressTestResult,
  type QAItem,
} from "@/lib/deal-tracker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// === Constants ===

const MODEL = "claude-sonnet-4-6";

const NAVY = "#1B2B6B";
const RED = "#C8102E";
const TEXT = "#1A1A1A";
const MUTED = "#666666";
const LIGHT = "#F2F4F8";
const HAIRLINE = "#D0D5DD";
const WHITE = "#FFFFFF";

// === Narrative schema (what Claude returns) ===

type Narrative = {
  project_description: string[];
  investment_highlights: string[];
  exit_strategy: string;
  sponsor_credentials: string;
  market_thesis: string[];
  why_market_now: string;
  supply_demand: string;
  demographic_trends: string;
  competitive_positioning: string;
  site_description: string;
  asset_overview: string;
  amenities_overview: string;
  development_status: string;
  sponsor_background: string;
  key_principals: string[];
  development_team: { role: string; firm: string }[];
  prior_deals_summary: string;
  msa_overview: string;
  employment_base: string;
  housing_market: string;
  subject_positioning: string;
  hud_fmr_analysis: string;
  capital_structure_narrative: string;
  financial_analysis_narrative: string;
  returns_analysis: {
    base_case: string;
    upside_case: string;
    downside_case: string;
    waterfall: string;
  };
  risk_factors: { risk: string; mitigant: string }[];
  hud_execution: string;
  development_timeline_narrative: string;
  capital_spent_narrative: string;
  third_party_status: string;
};

const SYSTEM_PROMPT = `You are a senior capital markets writer at FACG drafting an institutional investor prospectus for a HUD multifamily deal. Write in a professional, restrained tone — no marketing fluff, no superlatives, no exclamation points. Match the voice of a top-tier investment bank prospectus.

Use the deal data provided (inputs, underwriting, comparables, stress test, sponsor Q&A) to generate narrative content for every section. Reference actual numbers from the data (NOI, DSCR, LTC, project cost, unit count, etc.). Where data is missing or ambiguous, write neutrally (e.g., "The sponsor has not yet disclosed [X]") rather than fabricating specifics.

Return ONLY this JSON object — no markdown fences, no preamble:

{
  "project_description": ["paragraph 1", "paragraph 2", "paragraph 3"],
  "investment_highlights": ["bullet 1", "bullet 2", "bullet 3", "bullet 4", "bullet 5"],
  "exit_strategy": "1 paragraph",
  "sponsor_credentials": "1 paragraph",
  "market_thesis": ["paragraph 1", "paragraph 2"],
  "why_market_now": "1 paragraph",
  "supply_demand": "1 paragraph",
  "demographic_trends": "1 paragraph",
  "competitive_positioning": "1 paragraph",
  "site_description": "1 paragraph",
  "asset_overview": "1 paragraph",
  "amenities_overview": "1 paragraph",
  "development_status": "1 paragraph",
  "sponsor_background": "1 paragraph",
  "key_principals": ["Name, Title — 2-sentence bio", "Name, Title — 2-sentence bio"],
  "development_team": [{"role": "General Contractor", "firm": "TBD"}, {"role": "Architect", "firm": "TBD"}, {"role": "Property Manager", "firm": "TBD"}, {"role": "Legal", "firm": "TBD"}],
  "prior_deals_summary": "1 paragraph",
  "msa_overview": "1 paragraph",
  "employment_base": "1 paragraph",
  "housing_market": "1 paragraph",
  "subject_positioning": "1 paragraph",
  "hud_fmr_analysis": "1 paragraph",
  "capital_structure_narrative": "1 paragraph",
  "financial_analysis_narrative": "2 paragraphs joined by \\n\\n",
  "returns_analysis": {
    "base_case": "1 paragraph (reference IRR / equity multiple if computable)",
    "upside_case": "1 paragraph",
    "downside_case": "1 paragraph",
    "waterfall": "1 paragraph"
  },
  "risk_factors": [
    {"risk": "1 sentence", "mitigant": "1-2 sentences"}
  ],
  "hud_execution": "2 paragraphs joined by \\n\\n",
  "development_timeline_narrative": "1 paragraph",
  "capital_spent_narrative": "1 paragraph",
  "third_party_status": "1 paragraph"
}

Constraints:
- "risk_factors" array has 6-8 items minimum, covering: construction risk, market risk, financing/HUD execution risk, regulatory risk, sponsor risk, lease-up risk
- Reference the HUD program (221(d)(4), 223(f), 231, 232, 223(a)(7)) by name where relevant
- Use neutral institutional language — say "The Project" or "the Property", not "this exciting opportunity"
- For monetary references, use "$X.XM" or "$X,XXX,XXX" — not "X dollars"
- Do not invent sponsor names, addresses, employer names, or comparable property names beyond what's in the data
- Write paragraphs as plain prose — no bullets, no headings, no markdown inside paragraph strings`;

// === Defensive helpers ===

function safeText(v: unknown, fallback = "—"): string {
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}
function safeArray<T>(v: unknown, type: "string"): string[];
function safeArray<T>(v: unknown, type: "object"): Record<string, unknown>[];
function safeArray(v: unknown, type: "string" | "object"): unknown[] {
  if (!Array.isArray(v)) return [];
  if (type === "string") return v.filter((x) => typeof x === "string" && x.trim());
  return v.filter((x) => x && typeof x === "object");
}
function num$(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function full$(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
function pct(n: number, d = 1): string {
  return Number.isFinite(n) ? `${n.toFixed(d)}%` : "—";
}
function ratio(n: number): string {
  return Number.isFinite(n) ? `${n.toFixed(2)}x` : "—";
}

function defaultNarrative(inputs: DealInputs): Narrative {
  const name = inputs.project_name || "The Project";
  const loc = inputs.city_state || "the target market";
  return {
    project_description: [
      `${name} is a proposed ${inputs.asset_type.toLowerCase()} development located in ${loc}, comprising ${inputs.total_units || "TBD"} units across ${inputs.total_stories || "TBD"} stories.`,
    ],
    investment_highlights: [
      `Total project cost of ${num$(0)} fully sized for HUD ${inputs.hud_program} financing.`,
      "Defensible underwriting calibrated to HUD MAP standards.",
      "Sponsor with prior multifamily delivery experience.",
    ],
    exit_strategy: "Refinance into the HUD-insured permanent loan at stabilization; long-term hold or sale as market conditions warrant.",
    sponsor_credentials: "Sponsor has prior experience originating and managing multifamily assets.",
    market_thesis: ["Market thesis to be developed based on submarket research."],
    why_market_now: "Market timing analysis pending.",
    supply_demand: "Supply/demand analysis pending.",
    demographic_trends: "Demographic analysis pending.",
    competitive_positioning: "Subject expected to compete against the assembled comp set on rent and amenity basis.",
    site_description: "Site description pending finalization of survey and zoning verification.",
    asset_overview: "Asset overview pending.",
    amenities_overview: "Amenity package pending.",
    development_status: "Pre-development phase; refer to Capital Spent to Date.",
    sponsor_background: "Sponsor background information to be provided.",
    key_principals: ["Principal — Title — Bio pending."],
    development_team: [
      { role: "General Contractor", firm: "TBD" },
      { role: "Architect", firm: "TBD" },
      { role: "Property Manager", firm: "TBD" },
      { role: "Legal", firm: "TBD" },
    ],
    prior_deals_summary: "Prior transaction history pending.",
    msa_overview: "MSA overview pending.",
    employment_base: "Employment base summary pending.",
    housing_market: "Housing market summary pending.",
    subject_positioning: "Subject positioning vs market pending the rent comp study.",
    hud_fmr_analysis: "HUD FMR analysis pending.",
    capital_structure_narrative: "Capital structure as detailed in the Sources & Uses table.",
    financial_analysis_narrative: "Financial analysis as detailed in the financial section.",
    returns_analysis: {
      base_case: "Base case returns pending finalization of equity structure.",
      upside_case: "Upside case pending.",
      downside_case: "Downside case pending.",
      waterfall: "Distribution waterfall pending finalization.",
    },
    risk_factors: [
      { risk: "Construction risk.", mitigant: "Fixed-price GMP contract with reputable GC." },
      { risk: "Market lease-up risk.", mitigant: "Conservative absorption assumption supported by comp set." },
      { risk: "HUD execution risk.", mitigant: "FACG MAP lender platform with HUD field office relationships." },
      { risk: "Interest rate risk on bridge.", mitigant: "Bridge term structured to align with HUD closing." },
      { risk: "Regulatory risk.", mitigant: "Affordability covenants reviewed by legal." },
      { risk: "Sponsor execution risk.", mitigant: "Sponsor has prior multifamily delivery experience." },
    ],
    hud_execution: "FACG will execute the HUD application via standard MAP processes.",
    development_timeline_narrative: "Construction and stabilization timeline as outlined in the timeline section.",
    capital_spent_narrative: "Pre-development capital spend has retired entitlement and design risk.",
    third_party_status: "Third-party reports (appraisal, market study, ESA, PCNA) to be ordered concurrently with the firm application.",
  };
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

// === Body type ===

const PROSPECTUS_TYPES = [
  "senior_debt",
  "mezzanine",
  "preferred_equity",
  "common_equity",
] as const;
type ProspectusType = (typeof PROSPECTUS_TYPES)[number];

const PROSPECTUS_TYPE_LABELS: Record<
  ProspectusType,
  { filenameSlug: string; coverLabel: string; titleSuffix: string }
> = {
  senior_debt: {
    filenameSlug: "Senior_Debt",
    coverLabel: "Senior Debt Prospectus",
    titleSuffix: "for Senior Secured Lenders",
  },
  mezzanine: {
    filenameSlug: "Mezzanine",
    coverLabel: "Mezzanine Prospectus",
    titleSuffix: "for Mezzanine Lenders",
  },
  preferred_equity: {
    filenameSlug: "Preferred_Equity",
    coverLabel: "Preferred Equity Prospectus",
    titleSuffix: "for Preferred Equity Investors",
  },
  common_equity: {
    filenameSlug: "Common_Equity",
    coverLabel: "Common Equity / JV Prospectus",
    titleSuffix: "for Common Equity / JV Partners",
  },
};

// Audience-specific addenda appended to SYSTEM_PROMPT. Each one tells Claude
// who the reader is, what to lead with, and what to emphasize. The base
// SYSTEM_PROMPT still defines the JSON output shape (every section); the
// addenda only shift WHAT goes into each section, not the overall structure.
const PROSPECTUS_ADDENDA: Record<ProspectusType, string> = {
  senior_debt: `=== AUDIENCE: SENIOR DEBT LENDER ===

You are writing a prospectus for a senior secured lender. Emphasize: loan-to-cost, loan-to-value, debt service coverage ratio, collateral quality, sponsor equity contribution, exit strategy and loan repayment, HUD insurance (if applicable), and downside protection. Lead with credit metrics. Risk section should address collateral coverage in a distressed scenario.

Specifically:
- The investment_highlights array MUST lead with the LTC, LTV, and DSCR — quote the numbers.
- The capital_structure_narrative must spell out the senior position, the equity cushion below it, and the path to repayment at HUD permanent close (or sale).
- The returns_analysis is irrelevant here; replace it with a paragraph in waterfall describing senior debt yield, prepayment economics, and HUD insurance protection.
- The risk_factors must include at least one explicit "collateral coverage in a distressed scenario" item showing the cushion to par.
- Use the language of a credit memo — "the Loan", "the Borrower", "the Collateral" — not the language of an equity pitch.`,

  mezzanine: `=== AUDIENCE: MEZZANINE LENDER ===

You are writing a prospectus for a mezzanine lender taking a subordinate debt position. Emphasize: total debt stack, mezz position and security, preferred return and PIK structure, intercreditor dynamics, IRR to mezz position, prepayment and exit mechanics, and coverage after senior debt service. Include a waterfall showing mezz recovery in base, stress, and liquidation scenarios.

Specifically:
- The capital_structure_narrative must lay out the full debt stack (senior, mezz, equity) with dollar amounts and percentages, and describe the intercreditor relationship.
- The returns_analysis.waterfall must explicitly show mezz recovery in (a) base case full repayment, (b) stress case with senior coverage tight, and (c) liquidation. Use real numbers from the underwriting + stress data where available.
- The investment_highlights MUST lead with the mezz position size, the coupon + PIK, and the residual coverage above the mezz strike after senior debt service.
- The risk_factors must include intercreditor / standstill risk, prepayment lockout / make-whole risk, and what happens to mezz recovery if NOI declines 10-15%.
- Voice is the credit-memo voice, not the equity-pitch voice.`,

  preferred_equity: `=== AUDIENCE: PREFERRED EQUITY INVESTOR ===

You are writing a prospectus for a preferred equity investor. Emphasize: preferred return rate, cumulative vs non-cumulative structure, preferred equity position in the capital stack, common equity cushion below preferred, cash-on-cash preferred return, redemption timeline, and downside scenarios showing preferred equity recovery. Include a distribution waterfall. Lead with the preferred return and how it gets paid.

Specifically:
- The investment_highlights MUST lead with the preferred return rate (%), whether it's cumulative, and the redemption timeline.
- The capital_structure_narrative must describe the pref's position in the stack, the equity cushion below it, and the priority of distributions.
- The returns_analysis must contain (a) base_case showing how preferred return is satisfied year-by-year, (b) downside_case showing recovery if cash flow is constrained, (c) waterfall as the formal distribution priority — current pref, accrued/PIK if applicable, return of capital, then common.
- The risk_factors must include cash-flow-availability risk for the pref, structural subordination to senior debt, and PIK accrual/dilution if base case slips.
- Tone is "credit-flavored equity" — disciplined, focused on the stated coupon and recovery, not on IRR upside.`,

  common_equity: `=== AUDIENCE: COMMON EQUITY / JV PARTNER ===

You are writing a prospectus for a common equity investor or JV partner. Emphasize: total project IRR, equity multiple, cash-on-cash returns, value creation thesis, upside scenarios, co-GP structure and promote, exit strategy and timing. Lead with the return story. Include upside, base, and downside cases with full equity waterfall.

Specifically:
- The investment_highlights MUST lead with the projected IRR, equity multiple (MOIC), and the value creation thesis (e.g., development cost basis vs stabilized exit value).
- The exit_strategy must specifically address the disposition strategy (refi-and-hold vs sale at stabilization) and the JV's role in that decision.
- The returns_analysis must contain real upside_case, base_case, and downside_case paragraphs with IRR and equity multiple referenced. The waterfall paragraph must describe the full equity waterfall — pari passu, preferred return, return of capital, promote tiers / hurdles, and the catch-up if applicable.
- The capital_structure_narrative must explicitly call out the common equity check size, sponsor co-invest, and any promote / GP economics.
- The risk_factors must include market risk, exit-timing risk, and dilution/dilutive-event risk to common equity.
- Tone is the equity-pitch voice — confident on thesis, transparent on downside, never marketing-speak.`,
};

function isProspectusType(v: unknown): v is ProspectusType {
  return typeof v === "string" && (PROSPECTUS_TYPES as readonly string[]).includes(v);
}

type Body = {
  inputs?: DealInputs;
  underwriting?: UnderwritingResult | null;
  comparables?: WizardComparables | null;
  stressTest?: StressTestResult | null;
  qa?: QAItem[];
  /** Audience for the prospectus. Defaults to "senior_debt" when omitted. */
  prospectus_type?: ProspectusType;
};

// === PDF Builder ===

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PDFCtor = new (opts: any) => PDFKit.PDFDocument;

class PB {
  doc: PDFKit.PDFDocument;
  pageW = 612;
  pageH = 792;
  marginX = 54;
  marginY = 54;

  constructor(PDFDocument: PDFCtor) {
    this.doc = new PDFDocument({
      size: "LETTER",
      margins: {
        top: this.marginY,
        bottom: this.marginY + 24,
        left: this.marginX,
        right: this.marginX,
      },
      bufferPages: true,
      autoFirstPage: false,
      info: {
        Title: "FACG Investor Prospectus",
        Author: "First American Capital Group",
        Subject: "Confidential Investor Prospectus",
      },
    });
  }

  get contentW(): number {
    return this.pageW - this.marginX * 2;
  }

  // === Page chrome (applied at finalize for all pages) ===

  decorateAllPages(skipCover = true) {
    const range = this.doc.bufferedPageRange();
    const pageCount = range.count;
    for (let i = range.start; i < range.start + pageCount; i++) {
      this.doc.switchToPage(i);
      const pageNum = i - range.start + 1;
      this.doc.save();
      try {
        this.drawWatermark(pageNum === 1 && skipCover);
        if (!(skipCover && pageNum === 1)) {
          this.drawFooter(pageNum, pageCount);
        }
      } finally {
        this.doc.restore();
      }
    }
  }

  drawWatermark(skip: boolean) {
    if (skip) return;
    this.doc.save();
    this.doc.opacity(0.04);
    this.doc.fillColor("#000000");
    this.doc.font("Helvetica-Bold").fontSize(72);
    this.doc.translate(this.pageW / 2, this.pageH / 2);
    this.doc.rotate(-30);
    this.doc.text("CONFIDENTIAL", -240, -36, {
      width: 480,
      align: "center",
      lineBreak: false,
    });
    this.doc.restore();
  }

  drawFooter(pageNum: number, total: number) {
    const y = this.pageH - 32;
    this.doc.save();
    this.doc.strokeColor(RED).lineWidth(1.5);
    this.doc
      .moveTo(this.marginX, y - 8)
      .lineTo(this.pageW - this.marginX, y - 8)
      .stroke();
    this.doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    this.doc.text(
      "FACG · First American Capital Group  ·  CONFIDENTIAL — Not for distribution",
      this.marginX,
      y,
      { lineBreak: false, width: this.contentW * 0.7 }
    );
    const pageLabel = `Page ${pageNum} of ${total}`;
    const labelW = this.doc.widthOfString(pageLabel);
    this.doc.text(
      pageLabel,
      this.pageW - this.marginX - labelW,
      y,
      { lineBreak: false }
    );
    this.doc.restore();
  }

  // === Section heading (for new content pages) ===

  sectionHeader(label: string, num: string) {
    const x = this.marginX;
    const y = this.marginY;
    // FACG navy bar
    this.doc.rect(0, 0, this.pageW, 6).fill(NAVY);
    // Section number in red
    this.doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor(RED)
      .text(num, x, y, { lineBreak: false });
    // Title
    this.doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor(NAVY)
      .text(label, x + 50, y + 6, { width: this.contentW - 50 });
    // Underline rule
    this.doc.strokeColor(NAVY).lineWidth(0.5);
    this.doc
      .moveTo(x, y + 50)
      .lineTo(x + this.contentW, y + 50)
      .stroke();
    this.doc.y = y + 64;
    this.doc.x = x;
    this.doc.fillColor(TEXT).font("Helvetica").fontSize(10);
  }

  h2(text: string) {
    this.gap(8);
    this.doc.font("Helvetica-Bold").fontSize(13).fillColor(NAVY);
    this.doc.text(text, this.marginX, this.doc.y, { width: this.contentW });
    this.doc.fillColor(TEXT).font("Helvetica").fontSize(10);
    this.gap(4);
  }

  h3(text: string) {
    this.gap(6);
    this.doc.font("Helvetica-Bold").fontSize(11).fillColor(NAVY);
    this.doc.text(text, this.marginX, this.doc.y, { width: this.contentW });
    this.doc.fillColor(TEXT).font("Helvetica").fontSize(10);
    this.gap(2);
  }

  para(text: string, opts: { italic?: boolean } = {}) {
    if (!text) return;
    this.doc
      .font(opts.italic ? "Helvetica-Oblique" : "Helvetica")
      .fontSize(10)
      .fillColor(TEXT);
    this.doc.text(text, this.marginX, this.doc.y, {
      width: this.contentW,
      align: "left",
      paragraphGap: 6,
      lineGap: 1.5,
    });
    this.gap(4);
  }

  paras(items: string[]) {
    for (const p of items) this.para(p);
  }

  bullets(items: string[], indent = 0) {
    if (items.length === 0) return;
    this.doc.font("Helvetica").fontSize(10).fillColor(TEXT);
    for (const item of items) {
      const x = this.marginX + indent;
      const y = this.doc.y;
      // Red bullet square
      this.doc.rect(x, y + 4, 3, 3).fill(RED);
      this.doc.fillColor(TEXT);
      this.doc.text(item, x + 10, y, {
        width: this.contentW - 10 - indent,
        lineGap: 1.5,
      });
      this.gap(2);
    }
    this.gap(2);
  }

  gap(n = 6) {
    this.doc.y += n;
  }

  ensureSpace(needed: number) {
    if (this.doc.y + needed > this.pageH - this.marginY - 32) {
      this.doc.addPage();
      this.doc.y = this.marginY;
    }
  }

  /** Add a fresh content page (no section header). */
  addPage() {
    this.doc.addPage();
    this.doc.y = this.marginY;
    this.doc.x = this.marginX;
  }

  /** Start a new page with section heading. */
  startSection(num: string, title: string) {
    this.doc.addPage();
    this.sectionHeader(title, num);
  }

  // === Tables ===

  table(
    headers: string[],
    rows: string[][],
    colWidths: number[],
    opts: {
      headerFill?: string;
      footerRow?: string[];
      align?: ("left" | "right" | "center")[];
    } = {}
  ) {
    const padX = 6;
    const padY = 5;
    const hFill = opts.headerFill ?? NAVY;
    const x0 = this.marginX;
    const aligns = opts.align ?? headers.map((_, i) => (i === 0 ? "left" : "right"));

    // Header
    this.ensureSpace(28);
    let y = this.doc.y;
    this.doc.rect(x0, y, colWidths.reduce((a, b) => a + b, 0), 22).fill(hFill);
    this.doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE);
    {
      let cx = x0;
      for (let i = 0; i < headers.length; i++) {
        this.doc.text(headers[i], cx + padX, y + 7, {
          width: colWidths[i] - padX * 2,
          align: aligns[i],
          lineBreak: false,
        });
        cx += colWidths[i];
      }
    }
    y += 22;

    this.doc.font("Helvetica").fontSize(9.5).fillColor(TEXT);

    // Rows
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      // Compute row height by tallest cell
      let rowH = 0;
      for (let i = 0; i < row.length; i++) {
        const h = this.doc.heightOfString(row[i] ?? "", {
          width: colWidths[i] - padX * 2,
        });
        rowH = Math.max(rowH, h + padY * 2);
      }
      // Page break check
      if (y + rowH > this.pageH - this.marginY - 32) {
        this.doc.addPage();
        y = this.marginY;
        // Re-draw header on new page
        this.doc
          .rect(x0, y, colWidths.reduce((a, b) => a + b, 0), 22)
          .fill(hFill);
        this.doc.font("Helvetica-Bold").fontSize(9).fillColor(WHITE);
        let cx = x0;
        for (let i = 0; i < headers.length; i++) {
          this.doc.text(headers[i], cx + padX, y + 7, {
            width: colWidths[i] - padX * 2,
            align: aligns[i],
            lineBreak: false,
          });
          cx += colWidths[i];
        }
        y += 22;
        this.doc.font("Helvetica").fontSize(9.5).fillColor(TEXT);
      }

      // Alternating row bg
      if (r % 2 === 0) {
        this.doc.rect(x0, y, colWidths.reduce((a, b) => a + b, 0), rowH).fill(LIGHT);
        this.doc.fillColor(TEXT);
      }
      // Cell text — pass `height` so pdfkit treats each cell as a bounded
      // box and does NOT auto-paginate when doc.y would cross the margin.
      // Save/restore doc.y around the cells as a defensive measure so any
      // residual cursor drift can't cascade into the next row's render.
      const cellInnerH = Math.max(1, rowH - padY * 2);
      const savedRowY = this.doc.y;
      let cx = x0;
      for (let i = 0; i < row.length; i++) {
        this.doc.text(row[i] ?? "", cx + padX, y + padY, {
          width: colWidths[i] - padX * 2,
          height: cellInnerH,
          align: aligns[i],
        });
        cx += colWidths[i];
      }
      this.doc.y = savedRowY;
      // Bottom border
      this.doc.strokeColor(HAIRLINE).lineWidth(0.5);
      this.doc
        .moveTo(x0, y + rowH)
        .lineTo(x0 + colWidths.reduce((a, b) => a + b, 0), y + rowH)
        .stroke();
      y += rowH;
    }

    // Footer / total row
    if (opts.footerRow) {
      const row = opts.footerRow;
      let rowH = 0;
      for (let i = 0; i < row.length; i++) {
        const h = this.doc.heightOfString(row[i] ?? "", {
          width: colWidths[i] - padX * 2,
        });
        rowH = Math.max(rowH, h + padY * 2);
      }
      this.doc
        .rect(x0, y, colWidths.reduce((a, b) => a + b, 0), rowH)
        .fill(NAVY);
      this.doc.font("Helvetica-Bold").fontSize(9.5).fillColor(WHITE);
      const footerInnerH = Math.max(1, rowH - padY * 2);
      const savedFooterY = this.doc.y;
      let cx = x0;
      for (let i = 0; i < row.length; i++) {
        this.doc.text(row[i] ?? "", cx + padX, y + padY, {
          width: colWidths[i] - padX * 2,
          height: footerInnerH,
          align: aligns[i],
        });
        cx += colWidths[i];
      }
      this.doc.y = savedFooterY;
      y += rowH;
      this.doc.font("Helvetica").fontSize(10).fillColor(TEXT);
    }

    this.doc.y = y + 6;
    this.doc.x = this.marginX;
  }

  callout(label: string, body: string) {
    this.ensureSpace(48);
    const y = this.doc.y;
    const bodyH = this.doc.heightOfString(body, {
      width: this.contentW - 24,
    });
    const h = bodyH + 24;
    this.doc.rect(this.marginX, y, this.contentW, h).fill(LIGHT);
    this.doc
      .rect(this.marginX, y, 4, h)
      .fill(RED);
    this.doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY);
    this.doc.text(label.toUpperCase(), this.marginX + 12, y + 8, {
      width: this.contentW - 16,
      lineBreak: false,
    });
    this.doc.font("Helvetica").fontSize(10).fillColor(TEXT);
    // Bound the body in a height-constrained box so pdfkit does not
    // auto-paginate when the callout sits near the page bottom.
    this.doc.text(body, this.marginX + 12, y + 22, {
      width: this.contentW - 24,
      height: Math.max(1, bodyH),
    });
    this.doc.y = y + h + 6;
  }
}

// === Page renderers ===

function renderCover(
  p: PB,
  inputs: DealInputs,
  raise: number,
  audienceLabel: string
) {
  p.doc.addPage();
  // Full navy background
  p.doc.rect(0, 0, p.pageW, p.pageH).fill(NAVY);
  // Red stripe at top + bottom
  p.doc.rect(0, 0, p.pageW, 12).fill(RED);
  p.doc.rect(0, p.pageH - 12, p.pageW, 12).fill(RED);

  // FACG identifier top
  p.doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(WHITE)
    .text("FACG · FIRST AMERICAN CAPITAL GROUP", p.marginX, 32, {
      characterSpacing: 2,
      lineBreak: false,
    });

  // Title block — the prospectus type drives the COVER LABEL so the four
  // audience-specific PDFs are immediately distinguishable side-by-side.
  const titleY = 240;
  p.doc.font("Helvetica").fontSize(11).fillColor(WHITE).opacity(0.7);
  p.doc.text(`CONFIDENTIAL · ${audienceLabel.toUpperCase()}`, p.marginX, titleY, {
    characterSpacing: 3,
  });
  p.doc.opacity(1);
  p.doc
    .font("Helvetica-Bold")
    .fontSize(40)
    .fillColor(WHITE)
    .text(safeText(inputs.project_name, "The Project"), p.marginX, titleY + 26, {
      width: p.contentW,
    });
  p.doc
    .font("Helvetica")
    .fontSize(16)
    .fillColor(WHITE)
    .text(`${inputs.asset_type} · HUD ${inputs.hud_program}`, p.marginX, p.doc.y + 4, {
      width: p.contentW,
    });
  p.doc
    .font("Helvetica")
    .fontSize(13)
    .fillColor(WHITE)
    .opacity(0.85)
    .text(
      [inputs.address, inputs.city_state].filter(Boolean).join(", ") || "Address TBD",
      p.marginX,
      p.doc.y + 6,
      { width: p.contentW }
    );
  p.doc.opacity(1);

  // Capital request block
  const reqY = 540;
  p.doc.rect(p.marginX, reqY, p.contentW, 90).fill("#0F1A45");
  p.doc.rect(p.marginX, reqY, 6, 90).fill(RED);
  p.doc.font("Helvetica").fontSize(10).fillColor(WHITE).opacity(0.7);
  p.doc.text("TOTAL CAPITAL REQUEST", p.marginX + 18, reqY + 18, {
    characterSpacing: 2,
  });
  p.doc.opacity(1);
  p.doc
    .font("Helvetica-Bold")
    .fontSize(28)
    .fillColor(WHITE)
    .text(num$(raise || 0), p.marginX + 18, reqY + 36);
  p.doc.font("Helvetica").fontSize(10).fillColor(WHITE).opacity(0.7);
  p.doc.text(
    `HUD ${inputs.hud_program} financing  ·  ${inputs.total_units || "—"} units`,
    p.marginX + 18,
    reqY + 72
  );
  p.doc.opacity(1);

  // Footer ID
  p.doc.font("Helvetica").fontSize(9).fillColor(WHITE).opacity(0.7);
  p.doc.text(
    inputs.date || new Date().toISOString().slice(0, 10),
    p.marginX,
    p.pageH - 36,
    { width: p.contentW * 0.5, lineBreak: false }
  );
  p.doc.text(
    "DRAFT · DO NOT DISTRIBUTE",
    p.marginX,
    p.pageH - 36,
    { width: p.contentW, align: "right", lineBreak: false }
  );
  p.doc.opacity(1);
}

function renderDisclaimers(p: PB) {
  p.doc.addPage();
  p.sectionHeader("Disclaimers & Confidentiality", "01");
  p.para(
    "This document (the \"Prospectus\") has been prepared by First American Capital Group (\"FACG\" or \"FACS\") for the exclusive and confidential use of the addressee. By accepting this Prospectus, the recipient agrees to maintain the strict confidentiality of its contents and to use the information contained herein solely for the purpose of evaluating the proposed transaction described."
  );
  p.para(
    "All financial information, projections, forecasts, and statements regarding the proposed financing and investment are based on assumptions believed by FACG to be reasonable as of the date of this Prospectus, but no representation or warranty, express or implied, is made as to the accuracy or completeness of any such information. Actual results may differ materially from the projections set forth herein."
  );
  p.para(
    "The information contained in this Prospectus is summary in nature and does not purport to be all-inclusive or to contain all of the information that a prospective investor may desire. Each recipient is solely responsible for conducting its own independent investigation and analysis of the proposed transaction, the property, the sponsor, the market, and the financial projections, and should consult its own legal, tax, accounting, and investment advisors before making any investment decision."
  );
  p.para(
    "This Prospectus does not constitute an offer to sell or a solicitation of an offer to buy any securities. Any such offer or solicitation will be made only by means of definitive offering documents that contain a complete description of the terms of the proposed investment. Past performance of the sponsor or FACG is not indicative of future results."
  );
  p.para(
    "All trademarks, service marks, and logos referenced herein are the property of their respective owners. The HUD multifamily mortgage insurance programs referenced (including 221(d)(4), 223(f), 231, 232, and 223(a)(7)) are administered by the U.S. Department of Housing and Urban Development; FACG is a HUD-approved Multifamily Accelerated Processing (MAP) lender."
  );
  p.callout(
    "Confidentiality",
    "By accepting this document, the recipient agrees not to reproduce, distribute, or disclose its contents to any third party without the prior written consent of FACG. All copies must be returned to FACG upon request."
  );
}

type TocEntry = { num: string; title: string; page: number };

function renderToc(p: PB, entries: TocEntry[]) {
  p.doc.addPage();
  p.sectionHeader("Table of Contents", "02");
  p.gap(6);
  for (const e of entries) {
    const startY = p.doc.y;
    p.doc.font("Helvetica-Bold").fontSize(11).fillColor(RED);
    p.doc.text(e.num, p.marginX, startY, { width: 36, lineBreak: false });
    p.doc.font("Helvetica").fontSize(11).fillColor(NAVY);
    p.doc.text(e.title, p.marginX + 38, startY, {
      width: p.contentW - 70,
      lineBreak: false,
    });
    p.doc.font("Helvetica").fontSize(11).fillColor(MUTED);
    p.doc.text(String(e.page), p.marginX, startY, {
      width: p.contentW,
      align: "right",
      lineBreak: false,
    });
    // Dotted leader line
    p.doc.strokeColor(HAIRLINE).lineWidth(0.5).dash(1, { space: 2 });
    p.doc
      .moveTo(p.marginX + 38 + p.doc.widthOfString(e.title) + 4, startY + 9)
      .lineTo(p.pageW - p.marginX - 18, startY + 9)
      .stroke();
    p.doc.undash();
    p.doc.fillColor(TEXT).font("Helvetica").fontSize(10);
    p.doc.y = startY + 18;
  }
}

function renderExecSummary(
  p: PB,
  inputs: DealInputs,
  n: Narrative,
  uw: UnderwritingResult | null,
  m: ReturnType<typeof computeMetrics>
) {
  p.startSection("03", "Executive Summary");
  p.h3("Project Description");
  p.paras(n.project_description);

  p.h3("Investment Highlights");
  p.bullets(n.investment_highlights);

  // Capital request totals must match the authoritative S&U (extracted or
  // derived in the underwriting route). Pull totals from balance_check so
  // this mini-table never disagrees with the full Sources & Uses on Section 8.
  const totalCapital =
    uw?.balance_check?.total_sources ?? m.total_project_cost;
  p.h3("Capital Request & Structure");
  p.table(
    ["Item", "Amount"],
    [
      ["HUD Loan Request", full$(inputs.hud_loan_amount)],
      ["Total Capitalization", full$(totalCapital)],
      ["LTC", pct(m.ltc_pct, 1)],
      ["Sponsor Equity", full$(inputs.sponsor_funds_spent + inputs.sponsor_cash_to_close)],
      ["Bridge Loan (if applicable)", full$(inputs.bridge_loan_amount)],
    ],
    [220, 280]
  );

  // Use of Proceeds renders directly from the authoritative uses array — no
  // input reassembly. Falls back to a derived view only if no underwriting
  // result reached this point (defensive only; the wizard always provides one).
  p.h3("Use of Proceeds");
  const usesRows =
    uw?.uses && uw.uses.length > 0
      ? uw.uses.map((u) => [u.label, full$(u.amount)] as [string, string])
      : [
          ["Land Acquisition", full$(inputs.land_value)],
          ["Hard Construction Costs", full$(inputs.hard_costs)],
          ["Soft Costs & Professional Fees", full$(inputs.soft_costs_fees)],
          ["Financing & Carrying Costs", full$(inputs.financing_carrying_costs)],
          ["BSPRA", full$(inputs.bspra_amount)],
          ["Working Capital Escrow", full$(inputs.working_capital_escrow)],
          ["Initial Operating Deficit Escrow", full$(inputs.iod_escrow)],
        ].filter((r) => r[1] !== full$(0)) as [string, string][];
  p.table(["Use", "Amount"], usesRows, [320, 180]);

  p.h3("Exit Strategy");
  p.para(n.exit_strategy);

  p.h3("Key Sponsor Credentials");
  p.para(n.sponsor_credentials);
}

function renderOpportunity(p: PB, n: Narrative) {
  p.startSection("04", "The Opportunity");
  p.h3("Market Thesis");
  p.paras(n.market_thesis);
  p.h3("Why This Market, Why Now");
  p.para(n.why_market_now);
  p.h3("Supply & Demand Dynamics");
  p.para(n.supply_demand);
  p.h3("Demographic Trends");
  p.para(n.demographic_trends);
  p.h3("Competitive Positioning");
  p.para(n.competitive_positioning);
}

function renderProjectDescription(
  p: PB,
  inputs: DealInputs,
  n: Narrative,
  m: ReturnType<typeof computeMetrics>
) {
  p.startSection("05", "Project Description");
  p.h3("Site & Location");
  p.para(n.site_description);
  p.h3("Asset Overview");
  p.para(n.asset_overview);
  p.h3("Unit Mix");
  const mixRows: string[][] = [];
  const pushMix = (type: string, count: number, sf: number, rent: number) => {
    if (count > 0)
      mixRows.push([
        type,
        String(count),
        sf > 0 ? sf.toLocaleString() : "—",
        full$(rent),
        full$(rent * count * 12),
      ]);
  };
  pushMix("Studio", inputs.studio_count, inputs.studio_sf, inputs.studio_rent);
  pushMix("1 BR", inputs.one_br_count, inputs.one_br_sf, inputs.one_br_rent);
  pushMix("2 BR", inputs.two_br_count, inputs.two_br_sf, inputs.two_br_rent);
  pushMix("3 BR", inputs.three_br_count, inputs.three_br_sf, inputs.three_br_rent);
  if (mixRows.length === 0) mixRows.push(["—", "—", "—", "—", "—"]);
  p.table(["Type", "Count", "SF", "Monthly Rent", "Annual Rent"], mixRows, [80, 70, 90, 130, 130]);

  p.h3("Amenities");
  p.para(n.amenities_overview);

  p.h3("Development Timeline");
  p.para(
    `Construction is anticipated over ${
      inputs.construction_months || "TBD"
    } months, followed by a ${
      inputs.stabilization_months || "TBD"
    }-month lease-up period to stabilization.`
  );

  p.h3("Current Status");
  p.para(n.development_status);
  void m;
}

function renderSponsorTeam(p: PB, n: Narrative) {
  p.startSection("06", "Sponsor & Development Team");
  p.h3("Sponsor Background");
  p.para(n.sponsor_background);
  p.h3("Key Principals");
  p.bullets(n.key_principals);
  p.h3("Development Team");
  const teamRows = n.development_team.map((t) => [t.role, t.firm]);
  if (teamRows.length === 0) teamRows.push(["TBD", "TBD"]);
  p.table(["Role", "Firm"], teamRows, [240, 260], { align: ["left", "left"] });
  p.h3("Prior Deals & Experience");
  p.para(n.prior_deals_summary);
}

function renderMarket(
  p: PB,
  n: Narrative,
  comps: WizardComparables | null
) {
  p.startSection("07", "Market Analysis");
  p.h3("MSA Overview");
  p.para(n.msa_overview);
  p.h3("Employment Base");
  p.para(n.employment_base);
  p.h3("Housing Market Dynamics");
  p.para(n.housing_market);

  p.h3("Comparable Properties");
  if (comps && comps.comps.length > 0) {
    const rows = comps.comps.map((c) => [
      c.name,
      c.location,
      c.year_built ? String(c.year_built) : "—",
      String(c.units),
      c.rents.one_br !== null ? full$(c.rents.one_br) : "—",
      c.rents.two_br !== null ? full$(c.rents.two_br) : "—",
      pct(c.occupancy_pct, 1),
    ]);
    p.table(
      ["Property", "Location", "Year", "Units", "1 BR Rent", "2 BR Rent", "Occ %"],
      rows,
      [110, 100, 50, 50, 70, 70, 54]
    );
  } else {
    p.para("Comparable property data not available — refer to the rent comp study.", { italic: true });
  }

  p.h3("Subject Positioning");
  p.para(n.subject_positioning);

  p.h3("HUD FMR Analysis");
  p.para(n.hud_fmr_analysis);
}

function renderCapitalStructure(
  p: PB,
  inputs: DealInputs,
  n: Narrative,
  uw: UnderwritingResult | null,
  m: ReturnType<typeof computeMetrics>
) {
  p.startSection("08", "Capital Structure & Sources & Uses");
  p.para(n.capital_structure_narrative);

  // S&U is rendered directly from the underwriting result, which is itself
  // either pulled verbatim from the uploaded model or derived from Step 1
  // inputs. NO reassembly here — what the analyst saw on screen in Step 3
  // is exactly what prints. Totals come from balance_check (which respects
  // the spreadsheet's stated totals when available).
  const sources = uw?.sources ?? [];
  const uses = uw?.uses ?? [];
  const totalSources = uw?.balance_check?.total_sources ?? 0;
  const totalUses = uw?.balance_check?.total_uses ?? 0;
  const origin = uw?.sources_uses_origin;

  if (origin?.source === "extracted" && origin.location) {
    p.para(`Source: ${origin.location} (extracted verbatim).`);
  }

  p.h3("Sources");
  if (sources.length === 0) {
    p.para("No source line items provided in the underwriting model.");
  } else {
    p.table(
      ["Source", "Amount", "% of Total"],
      sources.map((s) => [
        s.label,
        full$(s.amount),
        pct(totalSources > 0 ? (s.amount / totalSources) * 100 : 0, 1),
      ]),
      [260, 130, 110],
      { footerRow: ["Total Sources", full$(totalSources), "100.0%"] }
    );
  }

  p.h3("Uses");
  if (uses.length === 0) {
    p.para("No use line items provided in the underwriting model.");
  } else {
    p.table(
      ["Use", "Amount", "% of Total"],
      uses.map((u) => [
        u.label,
        full$(u.amount),
        pct(totalUses > 0 ? (u.amount / totalUses) * 100 : 0, 1),
      ]),
      [260, 130, 110],
      { footerRow: ["Total Uses", full$(totalUses), "100.0%"] }
    );
  }

  if (uw?.balance_check && !uw.balance_check.is_balanced) {
    p.callout(
      "Balance Discrepancy",
      `Sources ${full$(uw.balance_check.total_sources)} do not reconcile with Uses ${full$(uw.balance_check.total_uses)} (Δ ${full$(uw.balance_check.delta)} = ${uw.balance_check.delta_pct.toFixed(2)}%). ${origin?.source === "extracted" ? "Discrepancy is present in the uploaded model — correct in Excel and re-upload." : "Resolution required prior to firm application."}`
    );
  }

  // Surface stated-total vs line-item-sum mismatches inside the extracted
  // S&U (possible when the spreadsheet's "Total" cell doesn't match the
  // arithmetic sum of its rows due to rounding or a stale formula).
  if (uw?.balance_check) {
    const bc = uw.balance_check;
    const mismatches: string[] = [];
    if (
      bc.sources_sum_vs_stated !== null &&
      Math.abs(bc.sources_sum_vs_stated) > 1
    ) {
      mismatches.push(
        `Sources line items sum to ${full$(
          (bc.stated_total_sources ?? 0) + bc.sources_sum_vs_stated
        )} but the spreadsheet states ${full$(bc.stated_total_sources ?? 0)} (Δ ${full$(bc.sources_sum_vs_stated)}).`
      );
    }
    if (
      bc.uses_sum_vs_stated !== null &&
      Math.abs(bc.uses_sum_vs_stated) > 1
    ) {
      mismatches.push(
        `Uses line items sum to ${full$(
          (bc.stated_total_uses ?? 0) + bc.uses_sum_vs_stated
        )} but the spreadsheet states ${full$(bc.stated_total_uses ?? 0)} (Δ ${full$(bc.uses_sum_vs_stated)}).`
      );
    }
    if (mismatches.length > 0) {
      p.callout("Model Internal Inconsistency", mismatches.join(" "));
    }
  }

  if (inputs.bridge_loan_amount > 0) {
    p.h3("Bridge Loan Terms");
    p.table(
      ["Item", "Value"],
      [
        ["Bridge Loan Amount", full$(inputs.bridge_loan_amount)],
        ["Interest Rate", pct(inputs.bridge_rate, 2)],
        ["Term", `${inputs.bridge_term_months} months`],
        ["Take-Out", `HUD ${inputs.hud_program}`],
      ],
      [240, 260]
    );
  }

  p.h3("HUD Loan Terms");
  p.table(
    ["Item", "Value"],
    [
      ["Loan Amount", full$(inputs.hud_loan_amount)],
      ["Note Rate", pct(inputs.hud_note_rate, 2)],
      ["Amortization", `${inputs.amortization_years} years`],
      ["MIP Rate", pct(inputs.mip_rate, 2)],
      ["LTC", pct(m.ltc_pct, 1)],
      ["LTV (vs exit value)", pct(m.ltv_pct, 1)],
      ["Stabilized DSCR", ratio(m.dscr)],
    ],
    [240, 260]
  );
}

function renderFinancials(
  p: PB,
  inputs: DealInputs,
  n: Narrative,
  uw: UnderwritingResult | null,
  m: ReturnType<typeof computeMetrics>
) {
  p.startSection("09", "Financial Analysis");
  p.para(n.financial_analysis_narrative);

  p.h3("Unit Mix & Rent Schedule");
  const mix: string[][] = [];
  const addMix = (t: string, c: number, sf: number, r: number) => {
    if (c > 0) mix.push([t, String(c), sf > 0 ? sf.toLocaleString() : "—", full$(r), full$(r * c * 12)]);
  };
  addMix("Studio", inputs.studio_count, inputs.studio_sf, inputs.studio_rent);
  addMix("1 BR", inputs.one_br_count, inputs.one_br_sf, inputs.one_br_rent);
  addMix("2 BR", inputs.two_br_count, inputs.two_br_sf, inputs.two_br_rent);
  addMix("3 BR", inputs.three_br_count, inputs.three_br_sf, inputs.three_br_rent);
  if (mix.length === 0) mix.push(["—", "—", "—", "—", "—"]);
  p.table(["Type", "Count", "SF", "Monthly Rent", "Annual Rent"], mix, [80, 70, 90, 130, 130]);

  p.h3("5-Year Pro Forma");
  if (uw?.pro_forma && uw.pro_forma.length > 0) {
    const headers = ["Item", ...uw.pro_forma.map((y) => `Year ${y.year}`)];
    const widths = [
      150,
      ...uw.pro_forma.map(() => Math.floor((p.contentW - 150) / uw.pro_forma.length)),
    ];
    const rows = [
      ["Gross Revenue", ...uw.pro_forma.map((y) => num$(y.revenue))],
      ["Effective Gross Income", ...uw.pro_forma.map((y) => num$(y.effective_gross_income))],
      ["Operating Expenses", ...uw.pro_forma.map((y) => `(${num$(y.operating_expenses)})`)],
      ["NOI", ...uw.pro_forma.map((y) => num$(y.noi))],
      ["Debt Service", ...uw.pro_forma.map((y) => `(${num$(y.debt_service)})`)],
      ["Cash Flow", ...uw.pro_forma.map((y) => num$(y.cash_flow))],
      ["DSCR", ...uw.pro_forma.map((y) => ratio(y.dscr))],
    ];
    p.table(headers, rows, widths);
  } else {
    p.para("Pro forma not available.", { italic: true });
  }

  p.h3("Key Metrics");
  p.table(
    ["Metric", "Value"],
    [
      ["DSCR (Stabilized)", ratio(m.dscr)],
      ["LTC", pct(m.ltc_pct, 1)],
      ["LTV (vs exit value)", pct(m.ltv_pct, 1)],
      ["Yield on Cost", pct(m.yield_on_cost_pct, 2)],
      ["Debt Yield", pct(m.debt_yield_pct, 2)],
      ["Stabilized NOI", full$(m.noi_stabilized)],
      ["Annual Debt Service", full$(m.annual_debt_service)],
      ["Breakeven Occupancy", pct(m.breakeven_occupancy_pct, 1)],
    ],
    [320, 180]
  );

  if (inputs.ami_1br_120 > 0 || inputs.ami_2br_120 > 0) {
    p.h3("AMI Rent Compliance");
    const amiRows: string[][] = [];
    const pushAmi = (
      bed: string,
      subj: number,
      a80: number,
      a100: number,
      a120: number
    ) => {
      const compliancePct = a120 > 0 ? (subj / a120) * 100 : 0;
      amiRows.push([
        bed,
        full$(subj),
        full$(a80),
        full$(a100),
        full$(a120),
        pct(compliancePct, 1),
      ]);
    };
    pushAmi(
      "1 BR",
      inputs.one_br_rent,
      inputs.ami_1br_80,
      inputs.ami_1br_100,
      inputs.ami_1br_120
    );
    pushAmi(
      "2 BR",
      inputs.two_br_rent,
      inputs.ami_2br_80,
      inputs.ami_2br_100,
      inputs.ami_2br_120
    );
    p.table(
      ["Bedroom", "Subject", "80% AMI", "100% AMI", "120% AMI", "% of 120%"],
      amiRows,
      [70, 80, 80, 80, 80, 110]
    );
  }
}

function renderReturns(p: PB, n: Narrative) {
  p.startSection("10", "Investment Returns");
  p.h3("Base Case");
  p.para(n.returns_analysis.base_case);
  p.h3("Upside Case");
  p.para(n.returns_analysis.upside_case);
  p.h3("Downside Case");
  p.para(n.returns_analysis.downside_case);
  p.h3("Distribution Waterfall");
  p.para(n.returns_analysis.waterfall);
}

function renderRisks(
  p: PB,
  n: Narrative,
  st: StressTestResult | null
) {
  p.startSection("11", "Risk Factors & Mitigants");
  if (n.risk_factors.length > 0) {
    const rows = n.risk_factors.map((r) => [r.risk, r.mitigant]);
    p.table(["Risk", "Mitigant"], rows, [240, 260], { align: ["left", "left"] });
  }
  if (st?.scenarios && st.scenarios.length > 0) {
    p.h3("Stress Test Results");
    const rows = st.scenarios.map((s) => [
      s.name,
      num$(s.noi),
      num$(s.cash_flow),
      ratio(s.dscr),
      pct(s.ltc_pct, 1),
    ]);
    p.table(
      ["Scenario", "NOI", "Cash Flow", "DSCR", "LTC"],
      rows,
      [180, 80, 80, 80, 80]
    );
  }
}

function renderHudExecution(p: PB, inputs: DealInputs, n: Narrative) {
  p.startSection("12", "HUD Execution Strategy");
  p.h3(`Program: ${inputs.hud_program}`);
  p.para(n.hud_execution);
  p.h3("Indicative Timeline");
  p.table(
    ["Phase", "Duration"],
    [
      ["Pre-Application", "0-4 weeks"],
      ["HUD Pre-App Review", "4-12 weeks"],
      ["Firm Application", "12-20 weeks"],
      ["HUD Underwriting & Commitment", "20-32 weeks"],
      ["Initial Endorsement / Closing", "32-40 weeks"],
    ],
    [320, 180]
  );
  p.h3("FACG Platform");
  p.para(
    "FACG is a HUD-approved MAP lender with deep relationships across HUD field offices and the Multifamily Hub. Our underwriting bench specializes in 221(d)(4) new construction, 223(f) refinance/acquisition, and 223(a)(7) interest rate reduction transactions."
  );
  p.h3("Third Party Reports");
  p.para(n.third_party_status);
}

function renderTimeline(p: PB, inputs: DealInputs, n: Narrative) {
  p.startSection("13", "Development Timeline");
  p.para(n.development_timeline_narrative);
  p.h3("Milestones");
  const cMonths = inputs.construction_months || 24;
  const sMonths = inputs.stabilization_months || 18;
  p.table(
    ["Milestone", "Target"],
    [
      ["Pre-Development Complete", "Achieved"],
      ["HUD Initial Endorsement", "Month 0"],
      ["Construction Start", "Month 1"],
      ["Construction Complete", `Month ${1 + cMonths}`],
      ["Lease-Up Begins", `Month ${1 + cMonths}`],
      ["Stabilization", `Month ${1 + cMonths + sMonths}`],
      ["Final Endorsement", `Month ${2 + cMonths + sMonths}`],
    ],
    [320, 180]
  );
}

function renderCapitalSpent(p: PB, inputs: DealInputs, n: Narrative) {
  p.startSection("14", "Capital Spent to Date");
  p.para(n.capital_spent_narrative);
  p.h3("Spend Detail");
  const totalSpent = inputs.sponsor_funds_spent + inputs.bridge_loan_amount;
  p.table(
    ["Category", "Amount"],
    [
      ["Sponsor Funds Spent", full$(inputs.sponsor_funds_spent)],
      ["Bridge Loan Drawn", full$(inputs.bridge_loan_amount)],
      ["Total Spent to Date", full$(totalSpent)],
    ],
    [320, 180]
  );
  p.h3("Risk Retired");
  p.bullets([
    "Site control achieved.",
    "Entitlements and zoning approvals obtained.",
    "Architectural and engineering documents at construction-document level.",
    "Initial third-party reports underway (appraisal, PCNA, environmental).",
    "GC selected and pricing nearly finalized.",
  ]);
}

function renderAppendix(
  p: PB,
  inputs: DealInputs,
  m: ReturnType<typeof computeMetrics>,
  qa: QAItem[]
) {
  p.startSection("15", "Appendix");
  p.h3("HUD Sizing Summary");
  p.table(
    ["Item", "Value"],
    [
      ["HUD Program", inputs.hud_program],
      ["Loan Amount", full$(inputs.hud_loan_amount)],
      ["Note Rate", pct(inputs.hud_note_rate, 2)],
      ["MIP", pct(inputs.mip_rate, 2)],
      ["Amortization", `${inputs.amortization_years} years`],
      ["DSCR", ratio(m.dscr)],
      ["Debt Yield", pct(m.debt_yield_pct, 2)],
      ["LTC", pct(m.ltc_pct, 1)],
    ],
    [240, 260]
  );

  p.h3("Third Party Report Status");
  p.table(
    ["Report", "Status"],
    [
      ["Appraisal", "To be ordered"],
      ["Market Study", "To be ordered"],
      ["PCNA", "To be ordered"],
      ["Environmental (Phase I)", "To be ordered"],
      ["Architectural Cost Review", "To be ordered"],
    ],
    [320, 180]
  );

  p.h3("Site Maps");
  p.callout(
    "Photography & Site Maps",
    "Renderings, site plans, and aerial imagery to be inserted in the final production version of this Prospectus prior to investor distribution."
  );

  if (qa.length > 0) {
    p.h3("Sponsor Q&A");
    for (const item of qa) {
      if (!item.answer) continue;
      p.doc.font("Helvetica-Bold").fontSize(10).fillColor(NAVY);
      p.doc.text(`Q. ${item.question}`, p.marginX, p.doc.y, {
        width: p.contentW,
      });
      p.doc.font("Helvetica").fontSize(10).fillColor(TEXT);
      p.doc.text(`A. ${item.answer}`, p.marginX, p.doc.y + 4, {
        width: p.contentW,
        paragraphGap: 8,
      });
      p.gap(8);
    }
  }
}

function renderClose(p: PB, inputs: DealInputs) {
  p.doc.addPage();
  p.doc.rect(0, 0, p.pageW, p.pageH).fill(NAVY);
  p.doc.rect(0, 0, p.pageW, 12).fill(RED);
  p.doc.rect(0, p.pageH - 12, p.pageW, 12).fill(RED);

  p.doc.font("Helvetica-Bold").fontSize(48).fillColor(WHITE);
  p.doc.text("THANK YOU", p.marginX, 220, { width: p.contentW });

  p.doc.font("Helvetica").fontSize(14).fillColor(WHITE).opacity(0.85);
  p.doc.text("First American Capital Group", p.marginX, 290, {
    width: p.contentW,
  });
  p.doc.opacity(1);

  // Contact block
  const cy = 400;
  p.doc.rect(p.marginX, cy, p.contentW, 160).fill("#0F1A45");
  p.doc.rect(p.marginX, cy, 6, 160).fill(RED);

  p.doc.font("Helvetica").fontSize(10).fillColor(WHITE).opacity(0.7);
  p.doc.text("PRIMARY CONTACT", p.marginX + 18, cy + 18, { characterSpacing: 2 });
  p.doc.opacity(1);
  p.doc
    .font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(WHITE)
    .text(safeText(inputs.managing_director, "Steve Kirchner"), p.marginX + 18, cy + 36);
  p.doc.font("Helvetica").fontSize(11).fillColor(WHITE).opacity(0.85);
  p.doc.text("Managing Director  ·  FACG", p.marginX + 18, cy + 60);

  p.doc.opacity(0.7).fontSize(10);
  p.doc.text("ANALYST CONTACT", p.marginX + 18, cy + 96, { characterSpacing: 2 });
  p.doc.opacity(1);
  p.doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(WHITE)
    .text(safeText(inputs.analyst_name, "TBD"), p.marginX + 18, cy + 114);
  p.doc.font("Helvetica").fontSize(11).fillColor(WHITE).opacity(0.85);
  p.doc.text("Analyst  ·  FACG", p.marginX + 18, cy + 134);
  p.doc.opacity(1);

  p.doc.font("Helvetica-Oblique").fontSize(9).fillColor(WHITE).opacity(0.7);
  p.doc.text(
    "CONFIDENTIAL — This document and its contents are proprietary to FACG and may not be reproduced or distributed without prior written consent.",
    p.marginX,
    p.pageH - 70,
    { width: p.contentW, align: "center", lineBreak: false }
  );
  p.doc.opacity(1);
}

// === POST handler ===

export async function POST(req: NextRequest) {
  try {
    const parsed = await req.json().catch(() => null);
    if (!parsed || typeof parsed !== "object") {
      return jsonError("Invalid JSON body.", 400);
    }
    const body = parsed as Body;
    const inputs = body.inputs;
    if (!inputs) return jsonError("Missing 'inputs'.", 400);

    // Default to senior_debt when omitted — that's the legacy single-button
    // behavior, and senior debt is the most common first-touch audience.
    const prospectusType: ProspectusType = isProspectusType(body.prospectus_type)
      ? body.prospectus_type
      : "senior_debt";
    const typeLabels = PROSPECTUS_TYPE_LABELS[prospectusType];
    const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n${PROSPECTUS_ADDENDA[prospectusType]}`;

    const computed = body.underwriting?.computed ?? computeMetrics(inputs);
    // Total capital raise = authoritative S&U sources total (extracted or
    // derived in the underwriting route). No reassembly here — the
    // underwriting result IS the source of truth.
    const raise =
      body.underwriting?.balance_check?.total_sources ||
      computed.total_project_cost;

    // === Generate narrative via Claude (with fallback) ===
    let narrative: Narrative = defaultNarrative(inputs);
    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const client = new Anthropic();
        const userPrompt = [
          `## Audience`,
          typeLabels.coverLabel,
          ``,
          `## Deal Inputs`,
          JSON.stringify(inputs, null, 2),
          ``,
          `## Underwriting Result`,
          JSON.stringify(body.underwriting ?? null, null, 2),
          ``,
          `## Comparables`,
          JSON.stringify(body.comparables ?? null, null, 2),
          ``,
          `## Stress Test`,
          JSON.stringify(body.stressTest ?? null, null, 2),
          ``,
          `## Sponsor Q&A`,
          JSON.stringify(body.qa ?? [], null, 2),
          ``,
          `Generate the prospectus narrative JSON for the ${typeLabels.coverLabel.toLowerCase()} audience.`,
        ].join("\n");
        const response = await client.messages.create({
          model: MODEL,
          max_tokens: 8192,
          system: fullSystemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        });
        const rawText = response.content
          .filter((b) => b.type === "text")
          .map((b) => (b as { type: "text"; text: string }).text)
          .join("");
        if (rawText.trim()) {
          try {
            const parsed = JSON.parse(extractJson(rawText)) as Partial<Narrative>;
            narrative = mergeNarrative(defaultNarrative(inputs), parsed);
          } catch (parseErr) {
            console.error(
              "[generate-prospectus] Claude JSON parse failed; using default narrative:",
              parseErr
            );
          }
        }
      } catch (claudeErr) {
        console.error(
          "[generate-prospectus] Claude failed; using default narrative:",
          claudeErr
        );
      }
    }

    // === Build PDF ===
    // Dynamic import keeps pdfkit out of webpack's bundle so its .afm font
    // files load correctly from node_modules at runtime. Combined with
    // serverComponentsExternalPackages: ['pdfkit'] in next.config.js.
    const pdfkitModule = await import("pdfkit");
    const PDFDocument = (pdfkitModule.default ?? pdfkitModule) as PDFCtor;

    const safeProject = (inputs.project_name || "Deal").replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const filename = `${safeProject}_FACG_${typeLabels.filenameSlug}_Prospectus.pdf`;

    // === Stream the PDF binary directly to the client ===
    // We don't accumulate the full PDF in a Node Buffer anymore. As soon as
    // pdfkit's underlying writable starts emitting chunks (during end()'s
    // flushPages pass), they're enqueued onto the response stream and the
    // browser's "Save As" dialog pops as soon as the first byte lands.
    //
    // Note: with bufferPages: true (which we need for cross-page footer
    // numbering), pdfkit holds bytes until end() — so streaming here gives
    // memory and first-byte-latency wins, NOT a Vercel-timeout fix.
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const p = new PB(PDFDocument);

        p.doc.on("data", (chunk: Buffer) => {
          // Convert Buffer view into a fresh Uint8Array<ArrayBuffer> the
          // ReadableStream controller will accept. The .slice() copy is
          // unavoidable: pdfkit reuses its internal buffer between writes.
          controller.enqueue(
            new Uint8Array(
              chunk.buffer.slice(
                chunk.byteOffset,
                chunk.byteOffset + chunk.byteLength
              ) as ArrayBuffer
            )
          );
        });
        p.doc.on("end", () => controller.close());
        p.doc.on("error", (err: Error) => {
          console.error("[generate-prospectus] pdfkit error:", err);
          controller.error(err);
        });

        try {
          // === Pages ===
          renderCover(p, inputs, raise, typeLabels.coverLabel);
          renderDisclaimers(p);

          // We'll re-emit TOC at the end with real page numbers; for now leave a placeholder
          // Simpler approach: build TOC entries first with hardcoded section start pages.
          const toc: TocEntry[] = [
            { num: "01", title: "Disclaimers & Confidentiality", page: 2 },
            { num: "02", title: "Table of Contents", page: 3 },
            { num: "03", title: "Executive Summary", page: 4 },
            { num: "04", title: "The Opportunity", page: 6 },
            { num: "05", title: "Project Description", page: 8 },
            { num: "06", title: "Sponsor & Development Team", page: 10 },
            { num: "07", title: "Market Analysis", page: 12 },
            { num: "08", title: "Capital Structure & Sources & Uses", page: 14 },
            { num: "09", title: "Financial Analysis", page: 16 },
            { num: "10", title: "Investment Returns", page: 18 },
            { num: "11", title: "Risk Factors & Mitigants", page: 20 },
            { num: "12", title: "HUD Execution Strategy", page: 22 },
            { num: "13", title: "Development Timeline", page: 24 },
            { num: "14", title: "Capital Spent to Date", page: 26 },
            { num: "15", title: "Appendix", page: 27 },
            { num: "—", title: "Contact & Close", page: 29 },
          ];
          renderToc(p, toc);

          renderExecSummary(p, inputs, narrative, body.underwriting ?? null, computed);
          renderOpportunity(p, narrative);
          renderProjectDescription(p, inputs, narrative, computed);
          renderSponsorTeam(p, narrative);
          renderMarket(p, narrative, body.comparables ?? null);
          renderCapitalStructure(p, inputs, narrative, body.underwriting ?? null, computed);
          renderFinancials(p, inputs, narrative, body.underwriting ?? null, computed);
          renderReturns(p, narrative);
          renderRisks(p, narrative, body.stressTest ?? null);
          renderHudExecution(p, inputs, narrative);
          renderTimeline(p, inputs, narrative);
          renderCapitalSpent(p, inputs, narrative);
          renderAppendix(p, inputs, computed, body.qa ?? []);
          renderClose(p, inputs);

          // Decorate (footer + watermark) on every page
          p.decorateAllPages(true);

          // Triggers the data → end event chain that drives the stream.
          p.doc.end();
        } catch (err) {
          console.error("[generate-prospectus] render failed:", err);
          controller.error(err);
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Content-Length is intentionally omitted — we don't know the final
        // byte count up front when streaming. Browsers handle this fine and
        // show progress as bytes arrive.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[generate-prospectus] unhandled:", err);
    const m = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(m, 500);
  }
}

function mergeNarrative(base: Narrative, partial: Partial<Narrative>): Narrative {
  const merged: Narrative = { ...base };
  // Strings
  const stringKeys = [
    "exit_strategy",
    "sponsor_credentials",
    "why_market_now",
    "supply_demand",
    "demographic_trends",
    "competitive_positioning",
    "site_description",
    "asset_overview",
    "amenities_overview",
    "development_status",
    "sponsor_background",
    "prior_deals_summary",
    "msa_overview",
    "employment_base",
    "housing_market",
    "subject_positioning",
    "hud_fmr_analysis",
    "capital_structure_narrative",
    "financial_analysis_narrative",
    "hud_execution",
    "development_timeline_narrative",
    "capital_spent_narrative",
    "third_party_status",
  ] as const;
  for (const k of stringKeys) {
    const v = (partial as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[k] = v;
    }
  }
  // String arrays
  const strArrKeys = ["project_description", "investment_highlights", "market_thesis", "key_principals"] as const;
  for (const k of strArrKeys) {
    const arr = safeArray((partial as Record<string, unknown>)[k], "string");
    if (arr.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (merged as any)[k] = arr;
    }
  }
  // Development team
  if (Array.isArray(partial.development_team)) {
    const team = partial.development_team
      .filter(
        (t): t is { role: string; firm: string } =>
          !!t &&
          typeof (t as Record<string, unknown>).role === "string" &&
          typeof (t as Record<string, unknown>).firm === "string"
      )
      .filter((t) => t.role.trim() || t.firm.trim());
    if (team.length > 0) merged.development_team = team;
  }
  // Risk factors
  if (Array.isArray(partial.risk_factors)) {
    const risks = partial.risk_factors
      .filter(
        (r): r is { risk: string; mitigant: string } =>
          !!r &&
          typeof (r as Record<string, unknown>).risk === "string" &&
          typeof (r as Record<string, unknown>).mitigant === "string"
      )
      .filter((r) => r.risk.trim());
    if (risks.length > 0) merged.risk_factors = risks;
  }
  // Returns analysis
  if (partial.returns_analysis && typeof partial.returns_analysis === "object") {
    const r = partial.returns_analysis as Partial<Narrative["returns_analysis"]>;
    merged.returns_analysis = {
      base_case: typeof r.base_case === "string" && r.base_case.trim() ? r.base_case : merged.returns_analysis.base_case,
      upside_case: typeof r.upside_case === "string" && r.upside_case.trim() ? r.upside_case : merged.returns_analysis.upside_case,
      downside_case: typeof r.downside_case === "string" && r.downside_case.trim() ? r.downside_case : merged.returns_analysis.downside_case,
      waterfall: typeof r.waterfall === "string" && r.waterfall.trim() ? r.waterfall : merged.returns_analysis.waterfall,
    };
  }
  return merged;
}
