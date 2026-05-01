export const ASSET_TYPES = [
  "Workforce Multifamily",
  "Market Rate",
  "Affordable",
  "Senior Housing",
  "Student Housing",
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const HUD_PROGRAMS = [
  "221(d)(4)",
  "223(f)",
  "231",
  "232",
  "223(a)(7)",
] as const;
export type HudProgram = (typeof HUD_PROGRAMS)[number];

export const FACG_NAVY_HEX = "1B2B6B";
export const FACG_RED_HEX = "C8102E";

export type DealInputs = {
  // Section 1 — Project Overview
  project_name: string;
  address: string;
  city_state: string;
  asset_type: AssetType;
  hud_program: HudProgram;
  total_units: number;
  total_stories: number;
  total_acres: number;
  parking_spaces: number;
  construction_months: number;
  stabilization_months: number;

  // Section 2 — Unit Mix
  studio_count: number;
  studio_sf: number;
  studio_rent: number;
  one_br_count: number;
  one_br_sf: number;
  one_br_rent: number;
  two_br_count: number;
  two_br_sf: number;
  two_br_rent: number;
  three_br_count: number;
  three_br_sf: number;
  three_br_rent: number;

  // Section 3 — Capital Structure
  hud_loan_amount: number;
  hud_note_rate: number; // %
  amortization_years: number;
  mip_rate: number; // %
  land_value: number;
  hard_costs: number;
  soft_costs_fees: number;
  financing_carrying_costs: number;
  bspra_amount: number;
  working_capital_escrow: number;
  iod_escrow: number;
  sponsor_funds_spent: number;
  sponsor_cash_to_close: number;
  bridge_loan_amount: number;
  bridge_rate: number; // %
  bridge_term_months: number;

  // Section 4 — Operating Assumptions
  vacancy_collection_pct: number; // %
  property_mgmt_pct: number; // %
  rm_turnover: number;
  common_area_utilities: number;
  gna: number;
  payroll: number;
  operations: number;
  insurance: number;
  replacement_reserves: number;
  ancillary_income: number;
  rent_growth_pct: number; // %
  exit_cap_rate: number; // %
  property_tax: number;
  tax_abatement_pct: number; // %

  // Section 5 — AMI Rent Limits
  ami_market: string;
  ami_1br_80: number;
  ami_1br_100: number;
  ami_1br_120: number;
  ami_2br_80: number;
  ami_2br_100: number;
  ami_2br_120: number;
  ami_source: string;

  // Section 6 — Model Oversight
  managing_director: string;
  analyst_name: string;
  date: string;
};

export const DEFAULT_INPUTS: DealInputs = {
  project_name: "",
  address: "",
  city_state: "",
  asset_type: "Workforce Multifamily",
  hud_program: "221(d)(4)",
  total_units: 0,
  total_stories: 0,
  total_acres: 0,
  parking_spaces: 0,
  construction_months: 0,
  stabilization_months: 0,
  studio_count: 0,
  studio_sf: 0,
  studio_rent: 0,
  one_br_count: 0,
  one_br_sf: 0,
  one_br_rent: 0,
  two_br_count: 0,
  two_br_sf: 0,
  two_br_rent: 0,
  three_br_count: 0,
  three_br_sf: 0,
  three_br_rent: 0,
  hud_loan_amount: 0,
  hud_note_rate: 0,
  amortization_years: 40,
  mip_rate: 0.25,
  land_value: 0,
  hard_costs: 0,
  soft_costs_fees: 0,
  financing_carrying_costs: 0,
  bspra_amount: 0,
  working_capital_escrow: 0,
  iod_escrow: 0,
  sponsor_funds_spent: 0,
  sponsor_cash_to_close: 0,
  bridge_loan_amount: 0,
  bridge_rate: 0,
  bridge_term_months: 0,
  vacancy_collection_pct: 7.7,
  property_mgmt_pct: 3.8,
  rm_turnover: 0,
  common_area_utilities: 0,
  gna: 0,
  payroll: 0,
  operations: 0,
  insurance: 0,
  replacement_reserves: 0,
  ancillary_income: 0,
  rent_growth_pct: 2,
  exit_cap_rate: 6.5,
  property_tax: 0,
  tax_abatement_pct: 0,
  ami_market: "",
  ami_1br_80: 0,
  ami_1br_100: 0,
  ami_1br_120: 0,
  ami_2br_80: 0,
  ami_2br_100: 0,
  ami_2br_120: 0,
  ami_source: "",
  managing_director: "Steve Kirchner",
  analyst_name: "",
  date: "",
};

export type ComputedMetrics = {
  total_units_from_mix: number;
  total_units_used: number;
  total_project_cost: number;
  cost_per_unit: number;
  gross_potential_rent_annual: number;
  effective_gross_income: number;
  operating_expenses: number;
  noi_stabilized: number;
  annual_debt_service: number;
  ltc_pct: number;
  dscr: number;
  yield_on_cost_pct: number;
  debt_yield_pct: number;
  exit_value: number;
  ltv_pct: number;
  breakeven_occupancy_pct: number;
  value_creation: number;
};

function safeDiv(num: number, den: number): number {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
  return num / den;
}

function monthlyPayment(
  principal: number,
  annualRatePct: number,
  years: number
): number {
  if (principal <= 0 || years <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return (principal * (r * Math.pow(1 + r, n))) / (Math.pow(1 + r, n) - 1);
}

export function computeMetrics(inputs: DealInputs): ComputedMetrics {
  const totalFromMix =
    inputs.studio_count + inputs.one_br_count + inputs.two_br_count + inputs.three_br_count;
  const totalUnits = inputs.total_units > 0 ? inputs.total_units : totalFromMix;

  // Total Project Cost = real development cost basis only.
  // Excludes BSPRA (a sponsor profit credit, not a cash cost) and the
  // bridge loan (a pre-development timing instrument retired at HUD
  // construction closing). Including either would inflate the basis and
  // depress LTC / yield-on-cost calculations.
  const totalProjectCost =
    inputs.land_value +
    inputs.hard_costs +
    inputs.soft_costs_fees +
    inputs.financing_carrying_costs +
    inputs.working_capital_escrow +
    inputs.iod_escrow;

  const monthlyRentRoll =
    inputs.studio_count * inputs.studio_rent +
    inputs.one_br_count * inputs.one_br_rent +
    inputs.two_br_count * inputs.two_br_rent +
    inputs.three_br_count * inputs.three_br_rent;
  const gprAnnual = monthlyRentRoll * 12;

  const vacancyLoss = gprAnnual * (inputs.vacancy_collection_pct / 100);
  const effectiveGrossIncome = gprAnnual - vacancyLoss + inputs.ancillary_income;

  const propertyMgmtExpense =
    effectiveGrossIncome * (inputs.property_mgmt_pct / 100);
  const taxExpense = inputs.property_tax * (1 - inputs.tax_abatement_pct / 100);
  const operatingExpenses =
    propertyMgmtExpense +
    inputs.rm_turnover +
    inputs.common_area_utilities +
    inputs.gna +
    inputs.payroll +
    inputs.operations +
    inputs.insurance +
    inputs.replacement_reserves +
    taxExpense;

  const noi = effectiveGrossIncome - operatingExpenses;

  const annualPI =
    monthlyPayment(
      inputs.hud_loan_amount,
      inputs.hud_note_rate,
      inputs.amortization_years
    ) * 12;
  const annualMIP = inputs.hud_loan_amount * (inputs.mip_rate / 100);
  const annualDebtService = annualPI + annualMIP;

  const ltcPct = safeDiv(inputs.hud_loan_amount, totalProjectCost) * 100;
  const dscr = safeDiv(noi, annualDebtService);
  const yieldOnCostPct = safeDiv(noi, totalProjectCost) * 100;
  const debtYieldPct = safeDiv(noi, inputs.hud_loan_amount) * 100;
  const exitValue = safeDiv(noi, inputs.exit_cap_rate / 100);
  const ltvPct = safeDiv(inputs.hud_loan_amount, exitValue) * 100;

  // Breakeven occupancy: vacancy at which NOI = debt service
  // EGI* = OpEx + DS; Vacancy* = 1 - (EGI* - ancillary) / GPR
  const requiredEgi = operatingExpenses + annualDebtService;
  const breakevenOccupancyPct = gprAnnual > 0
    ? Math.max(0, Math.min(100, ((requiredEgi - inputs.ancillary_income) / gprAnnual) * 100))
    : 0;

  const valueCreation = exitValue - totalProjectCost;

  return {
    total_units_from_mix: totalFromMix,
    total_units_used: totalUnits,
    total_project_cost: totalProjectCost,
    cost_per_unit: safeDiv(totalProjectCost, totalUnits),
    gross_potential_rent_annual: gprAnnual,
    effective_gross_income: effectiveGrossIncome,
    operating_expenses: operatingExpenses,
    noi_stabilized: noi,
    annual_debt_service: annualDebtService,
    ltc_pct: ltcPct,
    dscr: dscr,
    yield_on_cost_pct: yieldOnCostPct,
    debt_yield_pct: debtYieldPct,
    exit_value: exitValue,
    ltv_pct: ltvPct,
    breakeven_occupancy_pct: breakevenOccupancyPct,
    value_creation: valueCreation,
  };
}

export type ProFormaYear = {
  year: number;
  revenue: number;
  vacancy_loss: number;
  effective_gross_income: number;
  operating_expenses: number;
  noi: number;
  debt_service: number;
  cash_flow: number;
  dscr: number;
};

export function computeProForma(
  inputs: DealInputs,
  metrics: ComputedMetrics,
  years = 5
): ProFormaYear[] {
  const out: ProFormaYear[] = [];
  const growth = 1 + inputs.rent_growth_pct / 100;
  const expGrowth = 1.025; // standard 2.5% expense inflation
  let revenue = metrics.gross_potential_rent_annual + inputs.ancillary_income;
  let opex = metrics.operating_expenses;
  for (let i = 1; i <= years; i++) {
    const year = i;
    const grossRevenue = revenue;
    const vacancyLoss =
      (grossRevenue - inputs.ancillary_income) *
      (inputs.vacancy_collection_pct / 100);
    const egi = grossRevenue - vacancyLoss;
    const noi = egi - opex;
    const ds = metrics.annual_debt_service;
    out.push({
      year,
      revenue: grossRevenue,
      vacancy_loss: vacancyLoss,
      effective_gross_income: egi,
      operating_expenses: opex,
      noi,
      debt_service: ds,
      cash_flow: noi - ds,
      dscr: safeDiv(noi, ds),
    });
    revenue = revenue * growth;
    opex = opex * expGrowth;
  }
  return out;
}

export type HudFlag = {
  severity: "red" | "yellow" | "green";
  metric: string;
  threshold: string;
  actual: string;
  message: string;
};

export function computeHudFlags(
  inputs: DealInputs,
  metrics: ComputedMetrics
): HudFlag[] {
  const flags: HudFlag[] = [];

  // LTC
  if (metrics.ltc_pct > 84) {
    flags.push({
      severity: "red",
      metric: "LTC",
      threshold: "≤ 84%",
      actual: `${metrics.ltc_pct.toFixed(1)}%`,
      message: "LTC exceeds HUD 221(d)(4) maximum of 84% for market-rate deals.",
    });
  } else if (metrics.ltc_pct > 80) {
    flags.push({
      severity: "yellow",
      metric: "LTC",
      threshold: "≤ 84%",
      actual: `${metrics.ltc_pct.toFixed(1)}%`,
      message: "LTC is above 80% — limited equity cushion; HUD will scrutinize.",
    });
  } else {
    flags.push({
      severity: "green",
      metric: "LTC",
      threshold: "≤ 84%",
      actual: `${metrics.ltc_pct.toFixed(1)}%`,
      message: "LTC within HUD 221(d)(4) parameters.",
    });
  }

  // DSCR
  if (metrics.dscr < 1.11) {
    flags.push({
      severity: "red",
      metric: "DSCR",
      threshold: "≥ 1.11x (HUD floor)",
      actual: `${metrics.dscr.toFixed(2)}x`,
      message: "DSCR below HUD minimum — deal will not size as proposed.",
    });
  } else if (metrics.dscr < 1.176) {
    flags.push({
      severity: "yellow",
      metric: "DSCR",
      threshold: "≥ 1.176x (preferred)",
      actual: `${metrics.dscr.toFixed(2)}x`,
      message: "DSCR meets HUD floor but tight; expect debt sizing pressure.",
    });
  } else {
    flags.push({
      severity: "green",
      metric: "DSCR",
      threshold: "≥ 1.176x",
      actual: `${metrics.dscr.toFixed(2)}x`,
      message: "DSCR above HUD preferred underwriting threshold.",
    });
  }

  // Breakeven occupancy
  if (metrics.breakeven_occupancy_pct > 93) {
    flags.push({
      severity: "red",
      metric: "Breakeven Occupancy",
      threshold: "≤ 93%",
      actual: `${metrics.breakeven_occupancy_pct.toFixed(1)}%`,
      message:
        "Breakeven occupancy above 93% — minimal cushion against vacancy.",
    });
  } else if (metrics.breakeven_occupancy_pct > 88) {
    flags.push({
      severity: "yellow",
      metric: "Breakeven Occupancy",
      threshold: "≤ 93%",
      actual: `${metrics.breakeven_occupancy_pct.toFixed(1)}%`,
      message: "Breakeven approaching 93% — modest vacancy cushion.",
    });
  } else {
    flags.push({
      severity: "green",
      metric: "Breakeven Occupancy",
      threshold: "≤ 93%",
      actual: `${metrics.breakeven_occupancy_pct.toFixed(1)}%`,
      message: "Healthy breakeven cushion.",
    });
  }

  // 1BR vs 120% AMI
  if (inputs.ami_1br_120 > 0 && inputs.one_br_rent > 0) {
    const pct = (inputs.one_br_rent / inputs.ami_1br_120) * 100;
    if (inputs.one_br_rent > inputs.ami_1br_120) {
      flags.push({
        severity: "red",
        metric: "1BR vs 120% AMI",
        threshold: `≤ $${inputs.ami_1br_120}`,
        actual: `$${inputs.one_br_rent} (${pct.toFixed(0)}%)`,
        message:
          "1BR rent exceeds 120% AMI limit — affordability covenant risk.",
      });
    } else if (pct > 95) {
      flags.push({
        severity: "yellow",
        metric: "1BR vs 120% AMI",
        threshold: `≤ $${inputs.ami_1br_120}`,
        actual: `$${inputs.one_br_rent} (${pct.toFixed(0)}%)`,
        message: "1BR rent within 5% of 120% AMI cap — limited headroom.",
      });
    }
  }

  // 2BR vs 120% AMI
  if (inputs.ami_2br_120 > 0 && inputs.two_br_rent > 0) {
    const pct = (inputs.two_br_rent / inputs.ami_2br_120) * 100;
    if (inputs.two_br_rent > inputs.ami_2br_120) {
      flags.push({
        severity: "red",
        metric: "2BR vs 120% AMI",
        threshold: `≤ $${inputs.ami_2br_120}`,
        actual: `$${inputs.two_br_rent} (${pct.toFixed(0)}%)`,
        message:
          "2BR rent exceeds 120% AMI limit — affordability covenant risk.",
      });
    } else if (pct > 95) {
      flags.push({
        severity: "yellow",
        metric: "2BR vs 120% AMI",
        threshold: `≤ $${inputs.ami_2br_120}`,
        actual: `$${inputs.two_br_rent} (${pct.toFixed(0)}%)`,
        message: "2BR rent within 5% of 120% AMI cap — limited headroom.",
      });
    }
  }

  return flags;
}

// === Comparables / Underwriting / Stress test types ===

export type ByBedroom = {
  studio: number | null;
  one_br: number | null;
  two_br: number | null;
  three_br: number | null;
};

export type WizardComp = {
  name: string;
  location: string;
  year_built: number | null;
  units: number;
  unit_mix: { studio: number; one_br: number; two_br: number; three_br: number };
  unit_sizes: ByBedroom;
  rents: ByBedroom;
  occupancy_pct: number;
  utilities_included: string[];
  hud_lihtc_flag: boolean;
  distance_miles: number;
};

export type WizardComparables = {
  comps: WizardComp[];
  market_summary: {
    market_rents: ByBedroom;
    market_occupancy_pct: number;
    hud_fmr: ByBedroom;
    subject_vs_market: string;
    subject_vs_fmr: string;
    rent_supportability: "supports" | "qualified" | "below";
    commentary: string;
  };
};

export type SourcesUsesRow = { label: string; amount: number };
export type UnitMixRow = {
  type: string;
  count: number;
  sf: number;
  monthly_rent: number;
  annual_rent: number;
  pct_of_units: number;
};

export type UnderwritingResult = {
  computed: ComputedMetrics;
  pro_forma: ProFormaYear[];
  flags: HudFlag[];
  sources: SourcesUsesRow[];
  uses: SourcesUsesRow[];
  unit_mix_table: UnitMixRow[];
  ami_analysis: {
    one_br: { subject: number; ami_80: number; ami_100: number; ami_120: number; pct_of_120: number };
    two_br: { subject: number; ami_80: number; ami_100: number; ami_120: number; pct_of_120: number };
  };
  balance_check: {
    total_sources: number;
    total_uses: number;
    delta: number;
    delta_pct: number;
    is_balanced: boolean;
    tolerance: number;
    /** Stated totals from the source spreadsheet, when an S&U was extracted. */
    stated_total_sources: number | null;
    stated_total_uses: number | null;
    /** Mismatch (line-item sum vs stated total) — only meaningful when extracted. */
    sources_sum_vs_stated: number | null;
    uses_sum_vs_stated: number | null;
  };
  /** Where the S&U came from, if it was extracted verbatim from a model. */
  sources_uses_origin: {
    source: "extracted" | "derived";
    location: string | null;
  };
  confidence: ConfidenceSummary;
  granular_notes: string;
};

// === Data confidence ===
export type FieldConfidence =
  | "extracted"
  | "manual"
  | "estimated"
  | "missing";

export type FieldConfidenceMap = Partial<Record<keyof DealInputs, FieldConfidence>>;

export type SectionConfidence = {
  section: string;
  total: number;
  extracted: number;
  manual: number;
  estimated: number;
  missing: number;
};

export type ConfidenceSummary = {
  per_field: FieldConfidenceMap;
  by_section: SectionConfidence[];
  totals: {
    extracted: number;
    manual: number;
    estimated: number;
    missing: number;
  };
};

// Fields whose default value is a published industry/HUD convention rather
// than user input. If the value matches the default and the field wasn't
// extracted, treat it as "estimated".
export const ESTIMATED_DEFAULTS: Partial<Record<keyof DealInputs, unknown>> = {
  amortization_years: 40,
  mip_rate: 0.25,
  vacancy_collection_pct: 7.7,
  property_mgmt_pct: 3.8,
  rent_growth_pct: 2,
  exit_cap_rate: 6.5,
  managing_director: "Steve Kirchner",
};

export const SECTION_FIELDS: { name: string; keys: (keyof DealInputs)[] }[] = [
  {
    name: "Project Overview",
    keys: [
      "project_name",
      "address",
      "city_state",
      "asset_type",
      "hud_program",
      "total_units",
      "total_stories",
      "total_acres",
      "parking_spaces",
      "construction_months",
      "stabilization_months",
    ],
  },
  {
    name: "Unit Mix",
    keys: [
      "studio_count",
      "studio_sf",
      "studio_rent",
      "one_br_count",
      "one_br_sf",
      "one_br_rent",
      "two_br_count",
      "two_br_sf",
      "two_br_rent",
      "three_br_count",
      "three_br_sf",
      "three_br_rent",
    ],
  },
  {
    name: "Capital Structure",
    keys: [
      "hud_loan_amount",
      "hud_note_rate",
      "amortization_years",
      "mip_rate",
      "land_value",
      "hard_costs",
      "soft_costs_fees",
      "financing_carrying_costs",
      "bspra_amount",
      "working_capital_escrow",
      "iod_escrow",
      "sponsor_funds_spent",
      "sponsor_cash_to_close",
      "bridge_loan_amount",
      "bridge_rate",
      "bridge_term_months",
    ],
  },
  {
    name: "Operating Assumptions",
    keys: [
      "vacancy_collection_pct",
      "property_mgmt_pct",
      "rm_turnover",
      "common_area_utilities",
      "gna",
      "payroll",
      "operations",
      "insurance",
      "replacement_reserves",
      "ancillary_income",
      "rent_growth_pct",
      "exit_cap_rate",
      "property_tax",
      "tax_abatement_pct",
    ],
  },
  {
    name: "AMI Rent Limits",
    keys: [
      "ami_market",
      "ami_1br_80",
      "ami_1br_100",
      "ami_1br_120",
      "ami_2br_80",
      "ami_2br_100",
      "ami_2br_120",
      "ami_source",
    ],
  },
  {
    name: "Model Oversight",
    keys: ["managing_director", "analyst_name", "date"],
  },
];

export function classifyField(
  key: keyof DealInputs,
  value: unknown,
  extractedSet: Set<string>
): FieldConfidence {
  // Missing first — a 0 or empty value is missing regardless of provenance
  if (typeof value === "number" && value === 0) return "missing";
  if (typeof value === "string" && value.trim() === "") return "missing";
  if (extractedSet.has(key as string)) return "extracted";
  if (
    Object.prototype.hasOwnProperty.call(ESTIMATED_DEFAULTS, key) &&
    ESTIMATED_DEFAULTS[key] === value
  ) {
    return "estimated";
  }
  return "manual";
}

export function computeConfidence(
  inputs: DealInputs,
  extractedKeys: string[]
): ConfidenceSummary {
  const extractedSet = new Set(extractedKeys);
  const per_field: FieldConfidenceMap = {};
  const totals = { extracted: 0, manual: 0, estimated: 0, missing: 0 };
  const by_section: SectionConfidence[] = [];

  for (const section of SECTION_FIELDS) {
    const counts = { extracted: 0, manual: 0, estimated: 0, missing: 0 };
    for (const key of section.keys) {
      const c = classifyField(key, inputs[key], extractedSet);
      per_field[key] = c;
      counts[c] += 1;
      totals[c] += 1;
    }
    by_section.push({
      section: section.name,
      total: section.keys.length,
      ...counts,
    });
  }

  return { per_field, by_section, totals };
}

export type StressScenario = {
  name: string;
  description: string;
  noi: number;
  cash_flow: number;
  dscr: number;
  ltc_pct: number;
};

export type StressTestResult = {
  scenarios: StressScenario[];
  critical: string[];
  concerns: string[];
  observations: string[];
  questions: string[];
};

export type QAItem = { question: string; answer: string };

/**
 * Sources & Uses captured directly from an uploaded model (Excel/PDF/Word).
 * Treated as the single source of truth — never recalculated, reassembled,
 * or normalized once extracted. If line item sums differ from stated totals,
 * we surface the delta as a model-level discrepancy for analyst review.
 */
export type ExtractedSourcesUses = {
  sources: SourcesUsesRow[];
  uses: SourcesUsesRow[];
  /** Total sources as written in the source row of the spreadsheet (null if not stated). */
  stated_total_sources: number | null;
  stated_total_uses: number | null;
  /** Where the table came from (e.g. "Excel: Sources & Uses tab", "OM page 14"). */
  source_location: string;
};

// === AI intake agent ===
//
// Step 1 of the wizard is now an analyst-style intake: the user uploads
// arbitrary documents + paste-in text, Claude reads everything, and produces
// a structured triage report (what was found, what conflicts, what's still
// missing). The wizard advances when the analyst confirms the conflicts and
// answers the gap questions.

export type IntakeConfidence = "HIGH" | "MEDIUM" | "LOW";

export type IntakeField = {
  /** Human-readable label, e.g. "Total Units" or "HUD Loan Amount". */
  label: string;
  /** Raw value as it should be displayed (formatted with units). */
  value: string;
  /** Where the value came from — "OM page 4", "MD email", "Excel: Project Summary". */
  source: string;
  confidence: IntakeConfidence;
  /** When this maps to a structured DealInputs key, name it. */
  inputs_key?: keyof DealInputs;
};

export type IntakeConflictOption = {
  value: string;
  source: string;
};

export type IntakeConflict = {
  /** Stable id like "c1" so the answer can be persisted by id. */
  id: string;
  label: string;
  /** Two or more candidate values pulled from different sources. */
  options: IntakeConflictOption[];
  /** Optional analyst-style hint for which option is more authoritative. */
  recommendation?: string;
  /** When known, the DealInputs field this conflict resolves. */
  inputs_key?: keyof DealInputs;
};

export type IntakeQuestion = {
  /** Stable id like "q1" so the answer can be persisted by id. */
  id: string;
  question: string;
  /** 1-line "why this matters" — surfaced as a sub-line in the UI. */
  why?: string;
  /** Required questions must be answered before the wizard advances. */
  required: boolean;
  /** When the answer should populate a DealInputs key, name it. */
  inputs_key?: keyof DealInputs;
};

export type IntakeReport = {
  /** 1-2 sentence top-level synopsis. */
  summary: string;
  found: IntakeField[];
  conflicts: IntakeConflict[];
  questions: IntakeQuestion[];
  /** Files actually processed (server-side). */
  files_processed: string[];
};

/**
 * Map of intake item id → analyst's answer.
 * - For conflicts: the answer is the chosen value (one of `options[].value`).
 * - For questions: the answer is the free-form text the analyst typed.
 */
export type IntakeAnswers = Record<string, string>;

export type WizardState = {
  inputs: DealInputs;
  /** Field keys populated by the file-extraction route (provenance tracking). */
  extractedFields: string[];
  /** Authoritative S&U pulled verbatim from an uploaded model, when present. */
  extractedSourcesUses: ExtractedSourcesUses | null;
  /** Triage report from the AI intake agent (Step 1). Null until analyzed. */
  intakeReport: IntakeReport | null;
  /** Analyst's answers to conflicts and gap questions. Keyed by item id. */
  intakeAnswers: IntakeAnswers;
  comparables: WizardComparables | null;
  underwriting: UnderwritingResult | null;
  stressTest: StressTestResult | null;
  qa: QAItem[];
};

export const EMPTY_WIZARD_STATE: WizardState = {
  inputs: { ...DEFAULT_INPUTS },
  extractedFields: [],
  extractedSourcesUses: null,
  intakeReport: null,
  intakeAnswers: {},
  comparables: null,
  underwriting: null,
  stressTest: null,
  qa: [],
};

export function isAssetType(v: unknown): v is AssetType {
  return typeof v === "string" && ASSET_TYPES.includes(v as AssetType);
}
export function isHudProgram(v: unknown): v is HudProgram {
  return typeof v === "string" && HUD_PROGRAMS.includes(v as HudProgram);
}
