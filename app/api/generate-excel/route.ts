import { NextRequest, NextResponse } from "next/server";
import {
  computeMetrics,
  computeProForma,
  FACG_NAVY_HEX,
  type DealInputs,
  type WizardComparables,
  type UnderwritingResult,
} from "@/lib/deal-tracker/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type Body = {
  inputs?: DealInputs;
  underwriting?: UnderwritingResult | null;
  comparables?: WizardComparables | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

const NAVY = `FF${FACG_NAVY_HEX}`;
const RED = "FFC8102E";
const LIGHT_GRAY = "FFF2F4F8";

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

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "FACG Deal Tracker";
    wb.created = new Date();

    const computed = body.underwriting?.computed ?? computeMetrics(inputs);
    const proForma =
      body.underwriting?.pro_forma ?? computeProForma(inputs, computed, 5);

    // ============================================================
    // SHEET 1 — DEAL SUMMARY
    // ============================================================
    {
      const s = wb.addWorksheet("Deal Summary");
      s.columns = [{ width: 38 }, { width: 24 }];
      header(s, "DEAL SUMMARY", 1);

      sectionHeader(s, "Project Overview");
      kv(s, "Project Name", inputs.project_name);
      kv(s, "Address", inputs.address);
      kv(s, "City, State", inputs.city_state);
      kv(s, "Asset Type", inputs.asset_type);
      kv(s, "HUD Program", inputs.hud_program);
      kv(s, "Total Units", inputs.total_units, "0");
      kv(s, "Total Stories", inputs.total_stories, "0");
      kv(s, "Total Acres", inputs.total_acres, "0.00");
      kv(s, "Parking Spaces", inputs.parking_spaces, "0");
      kv(s, "Construction Period (mo)", inputs.construction_months, "0");
      kv(s, "Stabilization Period (mo)", inputs.stabilization_months, "0");

      blank(s);
      sectionHeader(s, "Capital Structure");
      kv(s, "HUD Loan Amount", inputs.hud_loan_amount, "$#,##0");
      kv(s, "HUD Note Rate", inputs.hud_note_rate / 100, "0.00%");
      kv(s, "Amortization (years)", inputs.amortization_years, "0");
      kv(s, "MIP Rate", inputs.mip_rate / 100, "0.00%");
      kv(s, "Total Project Cost", computed.total_project_cost, "$#,##0");
      kv(s, "Cost per Unit", computed.cost_per_unit, "$#,##0");
      kv(s, "LTC", computed.ltc_pct / 100, "0.0%");
      kv(s, "LTV (vs exit value)", computed.ltv_pct / 100, "0.0%");

      blank(s);
      sectionHeader(s, "Stabilized Operations");
      kv(s, "Gross Potential Rent", computed.gross_potential_rent_annual, "$#,##0");
      kv(s, "Effective Gross Income", computed.effective_gross_income, "$#,##0");
      kv(s, "Operating Expenses", computed.operating_expenses, "$#,##0");
      kv(s, "Net Operating Income", computed.noi_stabilized, "$#,##0");
      kv(s, "Annual Debt Service", computed.annual_debt_service, "$#,##0");
      kv(s, "DSCR", computed.dscr, "0.00\"x\"");
      kv(s, "Yield on Cost", computed.yield_on_cost_pct / 100, "0.00%");
      kv(s, "Debt Yield", computed.debt_yield_pct / 100, "0.00%");
      kv(s, "Breakeven Occupancy", computed.breakeven_occupancy_pct / 100, "0.0%");
      kv(s, "Exit Value", computed.exit_value, "$#,##0");
      kv(s, "Value Creation", computed.value_creation, "$#,##0");

      if (inputs.bridge_loan_amount > 0) {
        blank(s);
        sectionHeader(s, "Bridge Loan Summary");
        kv(s, "Bridge Loan Amount", inputs.bridge_loan_amount, "$#,##0");
        kv(s, "Bridge Rate", inputs.bridge_rate / 100, "0.00%");
        kv(s, "Bridge Term (mo)", inputs.bridge_term_months, "0");
      }

      blank(s);
      sectionHeader(s, "Model Oversight");
      kv(s, "Managing Director", inputs.managing_director);
      kv(s, "Analyst", inputs.analyst_name);
      kv(s, "Date", inputs.date);
    }

    // ============================================================
    // SHEET 2 — ASSUMPTIONS
    // ============================================================
    {
      const s = wb.addWorksheet("Assumptions");
      s.columns = [{ width: 38 }, { width: 18 }, { width: 14 }, { width: 36 }];
      header(s, "ASSUMPTIONS", 1);
      tableHeader(s, ["Item", "Value", "Units", "Source / Notes"]);

      const a = (
        item: string,
        value: number | string,
        units: string,
        notes: string,
        fmt?: string
      ) => {
        const row = s.addRow([item, value, units, notes]);
        if (fmt) row.getCell(2).numFmt = fmt;
        row.eachCell((c) => {
          c.border = thinBorder();
        });
      };

      a("Project Name", inputs.project_name, "—", "Sponsor input");
      a("HUD Program", inputs.hud_program, "—", "Sponsor input");
      a("Total Units", inputs.total_units, "units", "Site plan", "0");
      a("Construction Period", inputs.construction_months, "months", "GC schedule", "0");
      a("Stabilization Period", inputs.stabilization_months, "months", "Sponsor", "0");
      a("HUD Loan", inputs.hud_loan_amount, "USD", "MAP submission", "$#,##0");
      a("HUD Note Rate", inputs.hud_note_rate / 100, "%", "Lender quote", "0.00%");
      a("Amortization", inputs.amortization_years, "years", "Standard 221(d)(4)", "0");
      a("MIP Rate", inputs.mip_rate / 100, "%", "HUD published", "0.00%");
      a("Vacancy & Coll. Loss", inputs.vacancy_collection_pct / 100, "%", "Underwriting std", "0.00%");
      a("Property Mgmt", inputs.property_mgmt_pct / 100, "%", "Mgmt agreement", "0.00%");
      a("Rent Growth", inputs.rent_growth_pct / 100, "%/yr", "Market study", "0.00%");
      a("Exit Cap Rate", inputs.exit_cap_rate / 100, "%", "Comp set", "0.00%");
      a("Property Tax (full)", inputs.property_tax, "USD/yr", "County", "$#,##0");
      a("Tax Abatement", inputs.tax_abatement_pct / 100, "%", "Local program", "0.00%");
      a("Replacement Reserves", inputs.replacement_reserves, "USD/yr", "HUD min $250-$450/unit", "$#,##0");
      a("Insurance", inputs.insurance, "USD/yr", "Quote", "$#,##0");
      a("R&M / Turnover", inputs.rm_turnover, "USD/yr", "Operating budget", "$#,##0");
      a("G&A", inputs.gna, "USD/yr", "Operating budget", "$#,##0");
      a("Payroll", inputs.payroll, "USD/yr", "Staffing plan", "$#,##0");
      a("Operations", inputs.operations, "USD/yr", "Operating budget", "$#,##0");
      a("Common Area Utilities", inputs.common_area_utilities, "USD/yr", "Operating budget", "$#,##0");
      a("Ancillary Income", inputs.ancillary_income, "USD/yr", "Sponsor proj.", "$#,##0");
    }

    // ============================================================
    // SHEET 3 — SOURCES & USES
    // ============================================================
    {
      const s = wb.addWorksheet("Sources & Uses");
      s.columns = [{ width: 38 }, { width: 18 }, { width: 14 }];
      header(s, "SOURCES & USES", 1);

      // Render the S&U exactly as it lives in the underwriting result —
      // either pulled verbatim from the uploaded model or derived once
      // (in the underwriting route) from Step 1 inputs. NO reassembly here.
      const origin = body.underwriting?.sources_uses_origin;
      if (origin?.source === "extracted" && origin.location) {
        const provRow = s.addRow([
          `Source: ${origin.location} — extracted verbatim`,
        ]);
        provRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF666666" } };
        s.mergeCells(provRow.number, 1, provRow.number, 3);
        blank(s);
      }

      sectionHeader(s, "Sources");
      tableHeader(s, ["Source", "Amount", "% of Total"]);
      const sources = body.underwriting?.sources ?? [];
      const sourcesStartRow = s.rowCount + 1;
      sources.forEach((src) => addUsesRow(s, src.label, src.amount, sourcesStartRow));
      totalsRow(s, "Total Sources", sources.length, sourcesStartRow);

      blank(s);
      sectionHeader(s, "Uses");
      tableHeader(s, ["Use", "Amount", "% of Total"]);
      const uses = body.underwriting?.uses ?? [];
      const usesStartRow = s.rowCount + 1;
      uses.forEach((u) => addUsesRow(s, u.label, u.amount, usesStartRow));
      totalsRow(s, "Total Uses", uses.length, usesStartRow);

      // Cost per unit
      blank(s);
      sectionHeader(s, "Per-Unit Metrics");
      const cpuRow = s.addRow(["Cost per Unit", computed.cost_per_unit]);
      cpuRow.getCell(2).numFmt = "$#,##0";
      cpuRow.eachCell((c) => (c.border = thinBorder()));

      if (inputs.bridge_loan_amount > 0) {
        blank(s);
        sectionHeader(s, "Bridge Loan");
        tableHeader(s, ["Item", "Amount", ""]);
        const r1 = s.addRow(["Bridge Loan Amount", inputs.bridge_loan_amount, ""]);
        r1.getCell(2).numFmt = "$#,##0";
        const r2 = s.addRow(["Bridge Rate", inputs.bridge_rate / 100, ""]);
        r2.getCell(2).numFmt = "0.00%";
        s.addRow(["Bridge Term (months)", inputs.bridge_term_months, ""]);
      }
    }

    // ============================================================
    // SHEET 4 — PRO FORMA
    // ============================================================
    {
      const s = wb.addWorksheet("Pro Forma");
      const colCount = 1 + proForma.length + 1;
      s.columns = Array.from({ length: colCount }, (_, i) =>
        i === 0 ? { width: 32 } : { width: 16 }
      );
      header(s, "5-YEAR PRO FORMA", 1, colCount);
      const yearHeaders = [
        "Item",
        ...proForma.map((p) => `Year ${p.year}`),
      ];
      tableHeader(s, yearHeaders);

      const addRow = (
        label: string,
        values: number[],
        fmt = "$#,##0"
      ) => {
        const row = s.addRow([label, ...values]);
        for (let i = 2; i <= row.cellCount; i++) {
          const c = row.getCell(i);
          c.numFmt = fmt;
          c.border = thinBorder();
        }
        row.getCell(1).border = thinBorder();
        row.getCell(1).font = { bold: true };
      };

      addRow(
        "Gross Potential Revenue",
        proForma.map((p) => p.revenue)
      );
      addRow(
        "(Vacancy & Coll. Loss)",
        proForma.map((p) => -p.vacancy_loss)
      );
      addRow(
        "Effective Gross Income",
        proForma.map((p) => p.effective_gross_income)
      );
      addRow(
        "(Operating Expenses)",
        proForma.map((p) => -p.operating_expenses)
      );
      addRow(
        "Net Operating Income",
        proForma.map((p) => p.noi)
      );
      addRow(
        "(Debt Service)",
        proForma.map((p) => -p.debt_service)
      );
      addRow(
        "Cash Flow After D/S",
        proForma.map((p) => p.cash_flow)
      );
      addRow(
        "DSCR",
        proForma.map((p) => p.dscr),
        '0.00"x"'
      );

      blank(s);
      sectionHeader(s, "Valuation");
      const exitVal = computed.exit_value;
      const v1 = s.addRow(["Stabilized NOI (Yr 1)", computed.noi_stabilized]);
      v1.getCell(2).numFmt = "$#,##0";
      const v2 = s.addRow(["Exit Cap Rate", inputs.exit_cap_rate / 100]);
      v2.getCell(2).numFmt = "0.00%";
      const v3 = s.addRow(["Implied Exit Value", { formula: `B${v1.number}/B${v2.number}` }]);
      v3.getCell(2).numFmt = "$#,##0";
      const v4 = s.addRow(["Total Project Cost", computed.total_project_cost]);
      v4.getCell(2).numFmt = "$#,##0";
      const v5 = s.addRow([
        "Value Creation",
        { formula: `B${v3.number}-B${v4.number}` },
      ]);
      v5.getCell(2).numFmt = "$#,##0";
      void exitVal;
    }

    // ============================================================
    // SHEET 5 — UNIT MIX
    // ============================================================
    {
      const s = wb.addWorksheet("Unit Mix");
      s.columns = [
        { width: 14 },
        { width: 10 },
        { width: 12 },
        { width: 14 },
        { width: 16 },
        { width: 12 },
      ];
      header(s, "UNIT MIX", 1, 6);
      tableHeader(s, [
        "Type",
        "Count",
        "Avg SF",
        "Monthly Rent",
        "Annual Rent",
        "% of Total",
      ]);
      const tableStart = s.rowCount + 1;
      const mix = [
        { type: "Studio", count: inputs.studio_count, sf: inputs.studio_sf, rent: inputs.studio_rent },
        { type: "1BR", count: inputs.one_br_count, sf: inputs.one_br_sf, rent: inputs.one_br_rent },
        { type: "2BR", count: inputs.two_br_count, sf: inputs.two_br_sf, rent: inputs.two_br_rent },
        { type: "3BR", count: inputs.three_br_count, sf: inputs.three_br_sf, rent: inputs.three_br_rent },
      ].filter((r) => r.count > 0);

      const totalCount = mix.reduce((a, b) => a + b.count, 0) || 1;
      mix.forEach((r) => {
        const row = s.addRow([
          r.type,
          r.count,
          r.sf,
          r.rent,
          r.count * r.rent * 12,
          r.count / totalCount,
        ]);
        row.getCell(2).numFmt = "0";
        row.getCell(3).numFmt = "0";
        row.getCell(4).numFmt = "$#,##0";
        row.getCell(5).numFmt = "$#,##0";
        row.getCell(6).numFmt = "0.0%";
        row.eachCell((c) => (c.border = thinBorder()));
      });

      // Totals row with formulas
      const totalsRowNum = s.rowCount + 1;
      const startRow = tableStart;
      const endRow = totalsRowNum - 1;
      const tot = s.addRow([
        "Total",
        { formula: `SUM(B${startRow}:B${endRow})` },
        "",
        "",
        { formula: `SUM(E${startRow}:E${endRow})` },
        { formula: `SUM(F${startRow}:F${endRow})` },
      ]);
      tot.font = { bold: true };
      tot.getCell(2).numFmt = "0";
      tot.getCell(5).numFmt = "$#,##0";
      tot.getCell(6).numFmt = "0.0%";
      tot.eachCell((c) => {
        c.border = thinBorder();
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: LIGHT_GRAY },
        };
      });

      blank(s);
      sectionHeader(s, "AMI Rent Limits");
      tableHeader(s, [
        "Bedroom",
        "Subject",
        "80% AMI",
        "100% AMI",
        "120% AMI",
        "% of 120%",
      ]);
      const amiRow = (
        bed: string,
        subject: number,
        a80: number,
        a100: number,
        a120: number
      ) => {
        const pct = a120 > 0 ? subject / a120 : 0;
        const r = s.addRow([bed, subject, a80, a100, a120, pct]);
        for (let i = 2; i <= 5; i++) r.getCell(i).numFmt = "$#,##0";
        r.getCell(6).numFmt = "0.0%";
        r.eachCell((c) => (c.border = thinBorder()));
      };
      amiRow(
        "1BR",
        inputs.one_br_rent,
        inputs.ami_1br_80,
        inputs.ami_1br_100,
        inputs.ami_1br_120
      );
      amiRow(
        "2BR",
        inputs.two_br_rent,
        inputs.ami_2br_80,
        inputs.ami_2br_100,
        inputs.ami_2br_120
      );
      blank(s);
      const note = s.addRow([`Source: ${inputs.ami_source || "—"}`]);
      note.getCell(1).font = { italic: true, color: { argb: "FF666666" } };
    }

    // ============================================================
    // SHEET 6 — RENT COMPS
    // ============================================================
    {
      const s = wb.addWorksheet("Rent Comps");
      s.columns = [
        { width: 28 },
        { width: 18 },
        { width: 8 },
        { width: 8 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 10 },
        { width: 8 },
      ];
      header(s, "RENT COMPS", 1, 10);
      tableHeader(s, [
        "Property",
        "Location",
        "Year",
        "Units",
        "Studio $",
        "1BR $",
        "2BR $",
        "3BR $",
        "Occ %",
        "Dist mi",
      ]);

      const subjectRow = s.addRow([
        `SUBJECT — ${inputs.project_name || "(Unnamed)"}`,
        inputs.city_state,
        "TBD",
        inputs.total_units,
        inputs.studio_rent,
        inputs.one_br_rent,
        inputs.two_br_rent,
        inputs.three_br_rent,
        100 - inputs.vacancy_collection_pct,
        0,
      ]);
      subjectRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      subjectRow.eachCell((c) => {
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: NAVY },
        };
        c.border = thinBorder();
      });
      for (let i = 5; i <= 8; i++) subjectRow.getCell(i).numFmt = "$#,##0";
      subjectRow.getCell(9).numFmt = "0.0";
      subjectRow.getCell(10).numFmt = "0.0";

      const comps = body.comparables?.comps ?? [];
      comps.forEach((c) => {
        const row = s.addRow([
          c.name,
          c.location,
          c.year_built ?? "",
          c.units,
          c.rents.studio ?? "",
          c.rents.one_br ?? "",
          c.rents.two_br ?? "",
          c.rents.three_br ?? "",
          c.occupancy_pct,
          c.distance_miles,
        ]);
        for (let i = 5; i <= 8; i++) row.getCell(i).numFmt = "$#,##0";
        row.getCell(9).numFmt = "0.0";
        row.getCell(10).numFmt = "0.0";
        row.eachCell((cell) => (cell.border = thinBorder()));
      });

      const ms = body.comparables?.market_summary;
      if (ms) {
        const mr = ms.market_rents;
        const mktRow = s.addRow([
          "MARKET AVG",
          "",
          "",
          "",
          mr.studio ?? "",
          mr.one_br ?? "",
          mr.two_br ?? "",
          mr.three_br ?? "",
          ms.market_occupancy_pct,
          "",
        ]);
        mktRow.font = { bold: true };
        mktRow.eachCell((c) => {
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: LIGHT_GRAY },
          };
          c.border = thinBorder();
        });
        for (let i = 5; i <= 8; i++) mktRow.getCell(i).numFmt = "$#,##0";
        mktRow.getCell(9).numFmt = "0.0";

        blank(s);
        sectionHeader(s, "Market Observations");
        const r1 = s.addRow([`Subject vs Market: ${ms.subject_vs_market}`]);
        s.mergeCells(r1.number, 1, r1.number, 10);
        r1.getCell(1).alignment = { wrapText: true };
        const r2 = s.addRow([`Subject vs HUD FMR: ${ms.subject_vs_fmr}`]);
        s.mergeCells(r2.number, 1, r2.number, 10);
        r2.getCell(1).alignment = { wrapText: true };
        const r3 = s.addRow([
          `Rent Supportability: ${ms.rent_supportability.toUpperCase()}`,
        ]);
        r3.font = {
          bold: true,
          color: {
            argb:
              ms.rent_supportability === "supports"
                ? "FF1B7F3D"
                : ms.rent_supportability === "qualified"
                  ? "FFB45309"
                  : "FF991B1B",
          },
        };
        s.mergeCells(r3.number, 1, r3.number, 10);
        const r4 = s.addRow([ms.commentary]);
        s.mergeCells(r4.number, 1, r4.number, 10);
        r4.getCell(1).alignment = { wrapText: true };
        r4.height = 60;
      }
    }

    const buf = await wb.xlsx.writeBuffer();
    const filename = `${(inputs.project_name || "Deal").replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    )}_FACG_Model.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[generate-excel] unhandled:", err);
    const m = err instanceof Error ? err.message : "Unknown server error";
    return jsonError(m, 500);
  }
}

// === Style helpers ===
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WS = any;

function header(s: WS, title: string, row: number, cols = 2) {
  const r = s.getRow(row);
  r.getCell(1).value = title;
  r.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  r.height = 28;
  s.mergeCells(row, 1, row, cols);
  r.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  r.getCell(1).alignment = { vertical: "middle" };
}

function sectionHeader(s: WS, title: string) {
  const r = s.addRow([title]);
  r.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  s.mergeCells(r.number, 1, r.number, s.columnCount || 2);
  r.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: NAVY },
  };
  r.getCell(1).alignment = { vertical: "middle" };
  r.height = 22;
}

function tableHeader(s: WS, labels: string[]) {
  const r = s.addRow(labels);
  r.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
  r.eachCell((c: WS) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: NAVY },
    };
    c.border = thinBorder();
    c.alignment = { vertical: "middle" };
  });
  r.height = 20;
}

function kv(s: WS, label: string, value: string | number, numFmt?: string) {
  const r = s.addRow([label, value]);
  r.getCell(1).font = { bold: true };
  if (numFmt && typeof value === "number") r.getCell(2).numFmt = numFmt;
  r.eachCell((c: WS) => (c.border = thinBorder()));
}

function blank(s: WS) {
  s.addRow([]);
}

function addUsesRow(s: WS, label: string, amount: number, startRow: number) {
  const r = s.addRow([label, amount, null]);
  r.getCell(2).numFmt = "$#,##0";
  // % of total — leave the formula blank for now; we'll fill totals row reference at end
  r.eachCell((c: WS) => (c.border = thinBorder()));
  void startRow;
}

function totalsRow(
  s: WS,
  label: string,
  itemCount: number,
  startRow: number
): number {
  const endRow = startRow + itemCount - 1;
  const r = s.addRow([label, { formula: `SUM(B${startRow}:B${endRow})` }, ""]);
  r.font = { bold: true };
  r.getCell(2).numFmt = "$#,##0";
  r.eachCell((c: WS) => {
    c.border = thinBorder();
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: LIGHT_GRAY },
    };
  });
  return r.number;
}

function thinBorder() {
  const side = { style: "thin" as const, color: { argb: "FFD0D5DD" } };
  return { top: side, bottom: side, left: side, right: side };
}

// Suppress "RED unused" lint by referencing it (used in inline styles above).
void RED;
