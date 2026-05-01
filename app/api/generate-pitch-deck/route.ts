import { NextRequest, NextResponse } from "next/server";
import {
  computeMetrics,
  FACG_NAVY_HEX,
  FACG_RED_HEX,
  type DealInputs,
  type UnderwritingResult,
  type WizardComparables,
} from "@/lib/deal-tracker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const NAVY = FACG_NAVY_HEX;
const RED = FACG_RED_HEX;
const WHITE = "FFFFFF";
const LIGHT = "F2F4F8";
const TEXT_DARK = "1A1A1A";

const PITCH_AUDIENCES = [
  "internal",
  "senior_debt",
  "mezzanine",
  "preferred_equity",
  "common_equity",
] as const;
type PitchAudience = (typeof PITCH_AUDIENCES)[number];

const PITCH_AUDIENCE_META: Record<
  PitchAudience,
  { filenameSlug: string; coverTag: string }
> = {
  internal: {
    filenameSlug: "Internal_Review",
    coverTag: "Internal FACG Review",
  },
  senior_debt: {
    filenameSlug: "Senior_Debt",
    coverTag: "Senior Debt Lender",
  },
  mezzanine: {
    filenameSlug: "Mezzanine",
    coverTag: "Mezzanine Lender",
  },
  preferred_equity: {
    filenameSlug: "Preferred_Equity",
    coverTag: "Preferred Equity Investor",
  },
  common_equity: {
    filenameSlug: "Common_Equity",
    coverTag: "Common Equity / JV Partner",
  },
};

function isPitchAudience(v: unknown): v is PitchAudience {
  return typeof v === "string" && (PITCH_AUDIENCES as readonly string[]).includes(v);
}

type Body = {
  inputs?: DealInputs;
  underwriting?: UnderwritingResult | null;
  comparables?: WizardComparables | null;
  /** Audience the deck is being prepared for. Defaults to "internal". */
  audience?: PitchAudience;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function fmt$(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtPct(n: number, d = 1): string {
  return Number.isFinite(n) ? `${n.toFixed(d)}%` : "—";
}
function fmtX(n: number): string {
  return Number.isFinite(n) ? `${n.toFixed(2)}x` : "—";
}

export async function POST(req: NextRequest) {
  try {
    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    const inputs = body.inputs;
    if (!inputs) return jsonError("Missing 'inputs'.", 400);

    // Default to internal review if omitted (legacy single-button behaviour).
    const audience: PitchAudience = isPitchAudience(body.audience)
      ? body.audience
      : "internal";
    const audienceMeta = PITCH_AUDIENCE_META[audience];

    const computed = body.underwriting?.computed ?? computeMetrics(inputs);

    const PptxGenJsModule = await import("pptxgenjs");
    // pptxgenjs default export is the constructor
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const PptxGenJs: any = (PptxGenJsModule as any).default ?? PptxGenJsModule;
    const pres = new PptxGenJs();
    pres.layout = "LAYOUT_WIDE"; // 13.33 x 7.5 inches
    pres.title = `${inputs.project_name || "Deal"} — FACG Pitch Deck`;
    pres.company = "FACG";

    // ============================================================
    // SLIDE 1 — COVER
    // ============================================================
    {
      const slide = pres.addSlide();
      slide.background = { color: NAVY };

      // FACG accent stripe
      slide.addShape("rect", {
        x: 0,
        y: 6.6,
        w: 13.33,
        h: 0.15,
        fill: { color: RED },
      });

      // Audience tag — small uppercase chip top-left so the reader sees
      // immediately who the deck is for.
      slide.addText(`PREPARED FOR · ${audienceMeta.coverTag.toUpperCase()}`, {
        x: 0.6,
        y: 0.5,
        w: 12,
        h: 0.4,
        fontSize: 11,
        color: WHITE,
        bold: true,
        charSpacing: 3,
      });

      // Property name (large)
      slide.addText(inputs.project_name || "Project Name", {
        x: 0.6,
        y: 2.4,
        w: 12,
        h: 1.4,
        fontSize: 54,
        bold: true,
        color: WHITE,
        fontFace: "Calibri",
      });

      // Subtitle
      slide.addText(
        `${inputs.asset_type} · HUD ${inputs.hud_program} Financing`,
        {
          x: 0.6,
          y: 3.7,
          w: 12,
          h: 0.6,
          fontSize: 22,
          color: WHITE,
          italic: true,
        }
      );

      // Address
      slide.addText(
        [inputs.address, inputs.city_state].filter(Boolean).join(", ") ||
          "Address",
        {
          x: 0.6,
          y: 4.4,
          w: 12,
          h: 0.5,
          fontSize: 18,
          color: WHITE,
        }
      );

      // Property rendering placeholder
      slide.addShape("rect", {
        x: 8.5,
        y: 0.5,
        w: 4.3,
        h: 1.6,
        fill: { color: "0F1A45" },
        line: { color: WHITE, width: 1 },
      });
      slide.addText("Property Rendering", {
        x: 8.5,
        y: 0.5,
        w: 4.3,
        h: 1.6,
        fontSize: 12,
        color: WHITE,
        align: "center",
        valign: "middle",
        italic: true,
      });

      // FACS logo bottom-left
      slide.addText("FACS", {
        x: 0.6,
        y: 6.85,
        w: 1.5,
        h: 0.4,
        fontSize: 14,
        bold: true,
        color: WHITE,
      });
      slide.addText("First American Capital Group", {
        x: 0.6,
        y: 7.15,
        w: 6,
        h: 0.3,
        fontSize: 9,
        color: WHITE,
        italic: true,
      });

      // Date bottom-right
      slide.addText(inputs.date || new Date().toISOString().slice(0, 10), {
        x: 11,
        y: 6.85,
        w: 1.8,
        h: 0.4,
        fontSize: 11,
        color: WHITE,
        align: "right",
      });
    }

    // ============================================================
    // SLIDE 2 — DISCLAIMERS & CONFIDENTIALITY
    // ============================================================
    {
      const slide = pres.addSlide();
      slide.background = { color: NAVY };
      slide.addShape("rect", {
        x: 0,
        y: 0,
        w: 13.33,
        h: 0.6,
        fill: { color: RED },
      });
      slide.addText("DISCLAIMERS & CONFIDENTIALITY", {
        x: 0.5,
        y: 0.05,
        w: 12,
        h: 0.5,
        fontSize: 18,
        bold: true,
        color: WHITE,
      });
      slide.addText(
        [
          "This document has been prepared by First American Capital Group (FACS / FACG) for the exclusive use of the addressee. The information contained herein is confidential and proprietary.",
          "",
          "All financial information, projections, and statements regarding the proposed financing are based on assumptions believed to be reasonable but cannot be guaranteed. Actual results may differ materially.",
          "",
          "This presentation does not constitute an offer to sell or a solicitation of an offer to buy any securities. Any such offer or solicitation will be made only by means of definitive offering documents.",
          "",
          "By accepting this document, the recipient agrees to maintain the confidentiality of its contents and to use the information solely for the purpose of evaluating the proposed transaction.",
        ].join("\n"),
        {
          x: 0.8,
          y: 1.2,
          w: 11.7,
          h: 5.8,
          fontSize: 13,
          color: WHITE,
          paraSpaceAfter: 6,
          valign: "top",
        }
      );
      slide.addText("FACS · CONFIDENTIAL", {
        x: 0.6,
        y: 6.95,
        w: 6,
        h: 0.3,
        fontSize: 10,
        color: WHITE,
        italic: true,
      });
    }

    // ============================================================
    // SLIDE 3 — TABLE OF CONTENTS
    // ============================================================
    {
      const slide = pres.addSlide();
      slide.background = { color: WHITE };
      slide.addText("TABLE OF CONTENTS", {
        x: 0.6,
        y: 0.4,
        w: 12,
        h: 0.7,
        fontSize: 28,
        bold: true,
        color: NAVY,
      });
      slide.addShape("rect", {
        x: 0.6,
        y: 1.05,
        w: 1.5,
        h: 0.06,
        fill: { color: RED },
      });
      const toc = [
        ["01", "Executive Summary"],
        ["02", "Capital Spent to Date"],
        ["03", "Sources & Uses"],
        ["04", "Bridge Loan Terms"],
        ["05", "HUD Platform Overview"],
        ["06", "HUD Execution Strategy"],
        ["07", "HUD Sizing Summary"],
        ["08", "Contact"],
      ];
      let y = 1.6;
      for (const [num, title] of toc) {
        slide.addText(num, {
          x: 0.6,
          y,
          w: 1,
          h: 0.5,
          fontSize: 22,
          bold: true,
          color: RED,
        });
        slide.addText(title, {
          x: 1.6,
          y,
          w: 11,
          h: 0.5,
          fontSize: 18,
          color: NAVY,
        });
        y += 0.6;
      }
    }

    // ============================================================
    // SLIDE 4 — EXECUTIVE SUMMARY
    // ============================================================
    {
      const slide = pres.addSlide();
      addContentHeader(slide, "EXECUTIVE SUMMARY");
      const left = [
        { label: "Project", value: inputs.project_name || "—" },
        {
          label: "Location",
          value: [inputs.address, inputs.city_state].filter(Boolean).join(", ") || "—",
        },
        { label: "Asset Type", value: inputs.asset_type },
        { label: "HUD Program", value: inputs.hud_program },
        { label: "Total Units", value: String(computed.total_units_used) },
      ];
      const right = [
        { label: "Total Project Cost", value: fmt$(computed.total_project_cost) },
        { label: "HUD Loan Request", value: fmt$(inputs.hud_loan_amount) },
        { label: "LTC", value: fmtPct(computed.ltc_pct, 1) },
        { label: "Stabilized DSCR", value: fmtX(computed.dscr) },
        { label: "Yield on Cost", value: fmtPct(computed.yield_on_cost_pct, 2) },
      ];
      addKvBlock(slide, left, 0.6, 1.5, 5.8);
      addKvBlock(slide, right, 6.9, 1.5, 5.8);

      // Description box
      slide.addShape("rect", {
        x: 0.6,
        y: 5.0,
        w: 12.1,
        h: 1.8,
        fill: { color: LIGHT },
        line: { color: NAVY, width: 1 },
      });
      slide.addText("Business Plan", {
        x: 0.8,
        y: 5.1,
        w: 11.7,
        h: 0.4,
        fontSize: 13,
        bold: true,
        color: NAVY,
      });
      slide.addText(
        `${inputs.construction_months}-month construction period followed by ${inputs.stabilization_months}-month lease-up to stabilization. ` +
          `${inputs.asset_type} financed through HUD ${inputs.hud_program} for long-term, fixed-rate, non-recourse leverage. ` +
          `Sponsor contributing ${fmt$(inputs.sponsor_funds_spent + inputs.sponsor_cash_to_close)} of equity against ${fmt$(inputs.hud_loan_amount)} HUD loan.`,
        {
          x: 0.8,
          y: 5.5,
          w: 11.7,
          h: 1.2,
          fontSize: 12,
          color: TEXT_DARK,
          valign: "top",
        }
      );
    }

    // ============================================================
    // SLIDE 5 — CAPITAL SPENT TO DATE
    // ============================================================
    {
      const slide = pres.addSlide();
      addContentHeader(slide, "CAPITAL SPENT TO DATE");
      const items = [
        { label: "Sponsor Funds Spent", value: fmt$(inputs.sponsor_funds_spent) },
        { label: "Bridge Loan Drawn", value: fmt$(inputs.bridge_loan_amount) },
        {
          label: "Total Spent to Date",
          value: fmt$(inputs.sponsor_funds_spent + inputs.bridge_loan_amount),
        },
      ];
      addCenteredMetricRow(slide, items, 2.2);
      slide.addText(
        `${inputs.sponsor_cash_to_close > 0 ? `Additional ${fmt$(inputs.sponsor_cash_to_close)} sponsor cash required at close.` : "All capital sourced internally to date."}`,
        {
          x: 0.6,
          y: 5.5,
          w: 12.1,
          h: 0.6,
          fontSize: 13,
          color: TEXT_DARK,
          align: "center",
          italic: true,
        }
      );
    }

    // ============================================================
    // SLIDE 6 — SOURCES & USES
    // ============================================================
    {
      const slide = pres.addSlide();
      addContentHeader(slide, "SOURCES & USES");

      // Pull S&U directly from the underwriting result (extracted verbatim
      // from the uploaded model when present, otherwise derived once in the
      // underwriting route). NO reassembly here — this slide must match the
      // prospectus and the Excel deliverable penny for penny.
      const sources: [string, number][] =
        body.underwriting?.sources?.map((s) => [s.label, s.amount]) ?? [];
      const uses: [string, number][] =
        body.underwriting?.uses?.map((u) => [u.label, u.amount]) ?? [];
      const sourcesTotal =
        body.underwriting?.balance_check?.total_sources ??
        sources.reduce((a, [, v]) => a + v, 0);
      const usesTotal =
        body.underwriting?.balance_check?.total_uses ??
        uses.reduce((a, [, v]) => a + v, 0);

      // Sources table
      addMiniTable(
        slide,
        "Sources",
        [["Item", "Amount", "%"]],
        sources.map(([label, amt]) => [
          label,
          fmt$(amt),
          fmtPct((amt / Math.max(sourcesTotal, 1)) * 100),
        ]),
        ["Total", fmt$(sourcesTotal), "100.0%"],
        0.6,
        1.4,
        6,
        5.5
      );

      addMiniTable(
        slide,
        "Uses",
        [["Item", "Amount", "%"]],
        uses.map(([label, amt]) => [
          label,
          fmt$(amt),
          fmtPct((amt / Math.max(usesTotal, 1)) * 100),
        ]),
        ["Total", fmt$(usesTotal), "100.0%"],
        6.9,
        1.4,
        6,
        5.5
      );
    }

    // ============================================================
    // SLIDE 7 — BRIDGE LOAN TERMS (only if applicable)
    // ============================================================
    if (inputs.bridge_loan_amount > 0) {
      const slide = pres.addSlide();
      addContentHeader(slide, "BRIDGE LOAN TERMS & STRUCTURE");
      const items = [
        { label: "Loan Amount", value: fmt$(inputs.bridge_loan_amount) },
        { label: "Interest Rate", value: fmtPct(inputs.bridge_rate) },
        { label: "Term", value: `${inputs.bridge_term_months} months` },
        {
          label: "Maturity Strategy",
          value: `Take-out via HUD ${inputs.hud_program}`,
        },
      ];
      addCenteredMetricRow(slide, items, 2.5);
    }

    // ============================================================
    // SLIDE 8 — HUD PLATFORM OVERVIEW
    // ============================================================
    {
      const slide = pres.addSlide();
      addContentHeader(slide, "HUD PLATFORM OVERVIEW");
      const bullets = [
        "FACG MAP-approved HUD lender with deep multifamily underwriting bench",
        "Specialized in 221(d)(4) new construction, 223(f) refinance/acquisition, and 223(a)(7) IRR",
        "Direct relationships with HUD Multifamily Hub and Regional Center underwriters",
        "End-to-end execution: deal screening, pre-app, firm app, closing, asset management",
        "Track record of $XX billion in HUD-insured originations across XX transactions",
      ];
      addBulletBlock(slide, bullets, 0.6, 1.6, 12.1);
    }

    // ============================================================
    // SLIDE 9 — HUD EXECUTION STRATEGY
    // ============================================================
    {
      const slide = pres.addSlide();
      addContentHeader(slide, "HUD EXECUTION STRATEGY");
      const phases = [
        {
          phase: "Pre-Application",
          weeks: "0-4",
          desc: "Concept Meeting with HUD, market study commission, complete pre-app package.",
        },
        {
          phase: "Pre-Application Review",
          weeks: "4-12",
          desc: "HUD field office review and Invitation to Apply.",
        },
        {
          phase: "Firm Application",
          weeks: "12-20",
          desc: "Submit firm commitment package — third-party reports, cost certifications, sponsor financials.",
        },
        {
          phase: "HUD Underwriting",
          weeks: "20-32",
          desc: "HUD review, conditional commitment, rate lock, IPP issuance.",
        },
        {
          phase: "Closing",
          weeks: "32-40",
          desc: "Initial Endorsement closing, construction draws begin.",
        },
      ];
      let y = 1.5;
      for (const p of phases) {
        slide.addShape("rect", {
          x: 0.6,
          y,
          w: 1.6,
          h: 0.7,
          fill: { color: NAVY },
        });
        slide.addText(p.weeks, {
          x: 0.6,
          y,
          w: 1.6,
          h: 0.7,
          fontSize: 12,
          bold: true,
          color: WHITE,
          align: "center",
          valign: "middle",
        });
        slide.addText(p.phase, {
          x: 2.4,
          y,
          w: 3.2,
          h: 0.7,
          fontSize: 13,
          bold: true,
          color: NAVY,
          valign: "middle",
        });
        slide.addText(p.desc, {
          x: 5.7,
          y,
          w: 7.1,
          h: 0.7,
          fontSize: 11,
          color: TEXT_DARK,
          valign: "middle",
        });
        y += 0.85;
      }
    }

    // ============================================================
    // SLIDE 10 — HUD SIZING SUMMARY
    // ============================================================
    {
      const slide = pres.addSlide();
      addContentHeader(slide, "HUD SIZING SUMMARY");
      const items = [
        { label: "HUD Loan Amount", value: fmt$(inputs.hud_loan_amount) },
        { label: "LTC", value: fmtPct(computed.ltc_pct, 1) },
        { label: "DSCR", value: fmtX(computed.dscr) },
        { label: "Debt Yield", value: fmtPct(computed.debt_yield_pct, 2) },
      ];
      addCenteredMetricRow(slide, items, 1.7);

      const items2 = [
        { label: "Note Rate", value: fmtPct(inputs.hud_note_rate, 2) },
        {
          label: "Amortization",
          value: `${inputs.amortization_years} years`,
        },
        { label: "MIP Rate", value: fmtPct(inputs.mip_rate, 2) },
        {
          label: "Annual D/S",
          value: fmt$(computed.annual_debt_service),
        },
      ];
      addCenteredMetricRow(slide, items2, 4.2);
    }

    // ============================================================
    // SLIDE 11 — CLOSE / CONTACT
    // ============================================================
    {
      const slide = pres.addSlide();
      slide.background = { color: NAVY };
      slide.addShape("rect", {
        x: 0,
        y: 6.6,
        w: 13.33,
        h: 0.15,
        fill: { color: RED },
      });
      slide.addText("THANK YOU", {
        x: 0.6,
        y: 2.5,
        w: 12,
        h: 1,
        fontSize: 60,
        bold: true,
        color: WHITE,
      });
      slide.addText("First American Capital Group", {
        x: 0.6,
        y: 3.7,
        w: 12,
        h: 0.5,
        fontSize: 22,
        color: WHITE,
        italic: true,
      });
      slide.addText(inputs.managing_director || "Steve Kirchner", {
        x: 0.6,
        y: 5.2,
        w: 12,
        h: 0.5,
        fontSize: 18,
        bold: true,
        color: WHITE,
      });
      slide.addText("Managing Director", {
        x: 0.6,
        y: 5.7,
        w: 12,
        h: 0.4,
        fontSize: 14,
        color: WHITE,
      });
    }

    const buf = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
    const safeProject = (inputs.project_name || "Deal").replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const filename = `${safeProject}_FACG_${audienceMeta.filenameSlug}_Pitch_Deck.pptx`;

    // Cast to BodyInit at the response boundary. Node Buffer is always backed
    // by ArrayBuffer at runtime, but @types/node now types it as
    // Buffer<ArrayBufferLike>, which TypeScript refuses to widen to BodyInit's
    // Uint8Array<ArrayBuffer> overload. The runtime value is correct.
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[generate-pitch-deck] unhandled:", err);
    const m = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(m, 500);
  }
}

// === Slide helpers ===

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Slide = any;

function addContentHeader(slide: Slide, title: string) {
  slide.background = { color: WHITE };
  slide.addShape("rect", {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.7,
    fill: { color: NAVY },
  });
  slide.addText(title, {
    x: 0.6,
    y: 0.05,
    w: 12,
    h: 0.6,
    fontSize: 22,
    bold: true,
    color: WHITE,
    valign: "middle",
  });
  slide.addShape("rect", {
    x: 0,
    y: 0.7,
    w: 13.33,
    h: 0.06,
    fill: { color: RED },
  });
}

function addKvBlock(
  slide: Slide,
  items: { label: string; value: string }[],
  x: number,
  y: number,
  w: number
) {
  let curY = y;
  for (const it of items) {
    slide.addText(it.label.toUpperCase(), {
      x,
      y: curY,
      w,
      h: 0.25,
      fontSize: 9,
      bold: true,
      color: NAVY,
      charSpacing: 2,
    });
    slide.addText(it.value, {
      x,
      y: curY + 0.25,
      w,
      h: 0.45,
      fontSize: 18,
      color: TEXT_DARK,
    });
    curY += 0.78;
  }
}

function addCenteredMetricRow(
  slide: Slide,
  items: { label: string; value: string }[],
  y: number
) {
  const slideW = 13.33;
  const cardW = 2.6;
  const gap = 0.3;
  const totalW = items.length * cardW + (items.length - 1) * gap;
  let x = (slideW - totalW) / 2;
  for (const it of items) {
    slide.addShape("rect", {
      x,
      y,
      w: cardW,
      h: 1.5,
      fill: { color: NAVY },
      line: { color: RED, width: 2 },
    });
    slide.addText(it.label.toUpperCase(), {
      x,
      y: y + 0.15,
      w: cardW,
      h: 0.35,
      fontSize: 10,
      bold: true,
      color: WHITE,
      align: "center",
      charSpacing: 2,
    });
    slide.addText(it.value, {
      x,
      y: y + 0.55,
      w: cardW,
      h: 0.85,
      fontSize: 22,
      bold: true,
      color: WHITE,
      align: "center",
      valign: "middle",
    });
    x += cardW + gap;
  }
}

function addBulletBlock(
  slide: Slide,
  bullets: string[],
  x: number,
  y: number,
  w: number
) {
  slide.addText(
    bullets.map((b) => ({
      text: b,
      options: { bullet: { code: "25A0" }, color: TEXT_DARK },
    })),
    {
      x,
      y,
      w,
      h: 5,
      fontSize: 14,
      paraSpaceAfter: 10,
      valign: "top",
    }
  );
}

function addMiniTable(
  slide: Slide,
  title: string,
  headerRows: string[][],
  bodyRows: string[][],
  totalRow: string[],
  x: number,
  y: number,
  w: number,
  h: number
) {
  slide.addText(title, {
    x,
    y,
    w,
    h: 0.4,
    fontSize: 16,
    bold: true,
    color: NAVY,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows: any[][] = [
    ...headerRows.map((row) =>
      row.map((cell) => ({
        text: cell,
        options: { bold: true, color: WHITE, fill: { color: NAVY } },
      }))
    ),
    ...bodyRows.map((row) =>
      row.map((cell) => ({
        text: cell,
        options: { color: TEXT_DARK },
      }))
    ),
    totalRow.map((cell) => ({
      text: cell,
      options: { bold: true, color: TEXT_DARK, fill: { color: LIGHT } },
    })),
  ];
  slide.addTable(allRows, {
    x,
    y: y + 0.45,
    w,
    h: h - 0.45,
    fontSize: 11,
    border: { type: "solid", pt: 0.5, color: "D0D5DD" },
    colW: [w * 0.5, w * 0.3, w * 0.2],
  });
}
