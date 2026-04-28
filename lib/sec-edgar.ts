// SEC EDGAR is keyless and unlimited but requires a real User-Agent that
// identifies who's making requests. Customize via SEC_USER_AGENT in .env.local.
const USER_AGENT =
  process.env.SEC_USER_AGENT ?? "My AI Hub research-tool@example.com";

const TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const COMPANY_FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts";

export class SecEdgarError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "SecEdgarError";
    this.status = status;
  }
}

// SEC XBRL responses are deeply nested unions; treat loosely and parse what we
// need into a typed shape below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any;

type Fact = {
  end: string;
  val: number;
  fy: number;
  fp: string;
  form: string;
  filed: string;
  frame?: string;
};

type TickerEntry = { cik: string; ticker: string; title: string };

let tickerCache: Map<string, TickerEntry> | null = null;
let tickerCacheTime = 0;
const TICKER_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

async function loadTickerMap(): Promise<Map<string, TickerEntry>> {
  const now = Date.now();
  if (tickerCache && now - tickerCacheTime < TICKER_CACHE_TTL_MS) {
    return tickerCache;
  }

  let res: Response;
  try {
    res = await fetch(TICKER_MAP_URL, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new SecEdgarError(`SEC ticker map network error: ${msg}`);
  }

  if (!res.ok) {
    throw new SecEdgarError(
      `SEC ticker map HTTP ${res.status} ${res.statusText}`,
      502
    );
  }

  let data: Loose;
  try {
    data = await res.json();
  } catch {
    throw new SecEdgarError("SEC ticker map returned non-JSON.");
  }

  const map = new Map<string, TickerEntry>();
  for (const entry of Object.values(data) as Loose[]) {
    if (!entry || typeof entry.ticker !== "string") continue;
    const cikRaw =
      typeof entry.cik_str === "number"
        ? entry.cik_str
        : Number(entry.cik_str);
    if (!Number.isFinite(cikRaw)) continue;
    map.set(entry.ticker.toUpperCase(), {
      cik: String(cikRaw).padStart(10, "0"),
      ticker: entry.ticker.toUpperCase(),
      title: typeof entry.title === "string" ? entry.title : "",
    });
  }

  tickerCache = map;
  tickerCacheTime = now;
  return map;
}

export async function lookupCik(ticker: string): Promise<TickerEntry> {
  const map = await loadTickerMap();
  const entry = map.get(ticker.toUpperCase());
  if (!entry) {
    throw new SecEdgarError(
      `Ticker '${ticker}' not found in SEC EDGAR. SEC EDGAR covers US-registered issuers only — ADRs and foreign-private-issuer tickers may be missing.`,
      404
    );
  }
  return entry;
}

export async function fetchCompanyFacts(cik: string): Promise<Loose> {
  const url = `${COMPANY_FACTS_URL}/CIK${cik}.json`;

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "network error";
    throw new SecEdgarError(`SEC company facts network error: ${msg}`);
  }

  if (res.status === 404) {
    throw new SecEdgarError(`No SEC company facts for CIK ${cik}.`, 404);
  }
  if (res.status === 429) {
    throw new SecEdgarError(
      "Rate limited by SEC EDGAR. Try again in a moment.",
      429
    );
  }
  if (!res.ok) {
    throw new SecEdgarError(
      `SEC company facts HTTP ${res.status} ${res.statusText}`,
      502
    );
  }

  let data: Loose;
  try {
    data = await res.json();
  } catch {
    throw new SecEdgarError("SEC company facts returned non-JSON.");
  }
  return data;
}

// XBRL tag candidates in priority order — first one that has annual FY data
// for the year is used. us-gaap is checked first, then ifrs-full as fallback.
const TAG_CANDIDATES = {
  // Income statement
  revenue: [
    "Revenues",
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "SalesRevenueNet",
  ],
  costOfRevenue: [
    "CostOfRevenue",
    "CostOfGoodsAndServicesSold",
    "CostOfGoodsSold",
  ],
  grossProfit: ["GrossProfit"],
  operatingExpenses: ["OperatingExpenses", "CostsAndExpenses"],
  operatingIncome: ["OperatingIncomeLoss"],
  netIncome: ["NetIncomeLoss", "ProfitLoss"],
  researchAndDevelopment: ["ResearchAndDevelopmentExpense"],
  sga: ["SellingGeneralAndAdministrativeExpense"],
  // Balance sheet
  totalAssets: ["Assets"],
  cash: [
    "CashAndCashEquivalentsAtCarryingValue",
    "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
  ],
  longTermDebt: ["LongTermDebtNoncurrent", "LongTermDebt"],
  totalLiabilities: ["Liabilities"],
  stockholdersEquity: [
    "StockholdersEquity",
    "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
  ],
  // Cash flow
  operatingCashFlow: ["NetCashProvidedByUsedInOperatingActivities"],
  investingCashFlow: ["NetCashProvidedByUsedInInvestingActivities"],
  financingCashFlow: ["NetCashProvidedByUsedInFinancingActivities"],
  capex: ["PaymentsToAcquirePropertyPlantAndEquipment"],
  depreciationAmortization: [
    "DepreciationDepletionAndAmortization",
    "DepreciationAndAmortization",
    "Depreciation",
  ],
  stockBasedCompensation: ["ShareBasedCompensation"],
} as const;

const PER_SHARE_TAGS = {
  epsBasic: ["EarningsPerShareBasic"],
  epsDiluted: ["EarningsPerShareDiluted"],
} as const;

const SHARE_COUNT_TAGS = {
  sharesOutstanding: [
    "CommonStockSharesOutstanding",
    "EntityCommonStockSharesOutstanding",
  ],
} as const;

type FieldKey =
  | keyof typeof TAG_CANDIDATES
  | keyof typeof PER_SHARE_TAGS
  | keyof typeof SHARE_COUNT_TAGS
  | "freeCashFlow";

export type YearFinancials = {
  fiscalYear: number;
  endDate: string;
} & Partial<Record<FieldKey, number>>;

function getTagFacts(
  facts: Loose,
  tag: string,
  unit: string
): Fact[] {
  const tagData = facts?.["us-gaap"]?.[tag] ?? facts?.["ifrs-full"]?.[tag];
  if (!tagData) return [];
  const arr = tagData.units?.[unit];
  return Array.isArray(arr) ? (arr as Fact[]) : [];
}

function selectAnnualFacts(facts: Fact[], years: number): Fact[] {
  const annual = facts.filter(
    (f) =>
      (f.form === "10-K" || f.form === "10-K/A") &&
      f.fp === "FY" &&
      typeof f.val === "number"
  );
  // Dedupe by fiscal year — prefer the most-recently-filed (handles 10-K/A
  // amendments that supersede the original 10-K).
  const byFy = new Map<number, Fact>();
  for (const f of annual) {
    const existing = byFy.get(f.fy);
    if (!existing || f.filed > existing.filed) {
      byFy.set(f.fy, f);
    }
  }
  // Sort by reporting period end date descending (most reliable timestamp for
  // chronological order — handles non-calendar fiscal years correctly).
  return Array.from(byFy.values())
    .sort((a, b) => (a.end < b.end ? 1 : a.end > b.end ? -1 : 0))
    .slice(0, years);
}

function applyTagToYearMap(
  yearMap: Map<number, YearFinancials>,
  facts: Loose,
  field: FieldKey,
  candidateTags: readonly string[],
  unit: string,
  years: number
) {
  // Companies migrate XBRL tags over time (e.g. Revenues -> RevenueFromContract...
  // after ASC 606), so the first tag in our list may only carry old data while
  // a later tag has the most recent year. Try every candidate and pick the one
  // whose data extends to the most recent reporting period.
  let bestAnnual: Fact[] = [];
  let bestEndDate = "";
  for (const tag of candidateTags) {
    const annual = selectAnnualFacts(getTagFacts(facts, tag, unit), years);
    if (annual.length === 0) continue;
    const newestEnd = annual[0].end; // selectAnnualFacts sorts desc
    if (newestEnd > bestEndDate) {
      bestEndDate = newestEnd;
      bestAnnual = annual;
    }
  }
  if (bestAnnual.length === 0) return;

  for (const f of bestAnnual) {
    let yd = yearMap.get(f.fy);
    if (!yd) {
      yd = { fiscalYear: f.fy, endDate: f.end };
      yearMap.set(f.fy, yd);
    }
    if (yd[field] === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (yd as any)[field] = f.val;
    }
  }
}

export type Financials = {
  ticker: string;
  cik: string;
  entityName: string;
  source: "SEC EDGAR";
  years: YearFinancials[];
  availableUsGaapTags: string[];
};

export function parseFinancials(
  ticker: string,
  cik: string,
  facts: Loose,
  years = 5
): Financials {
  const entityName: string =
    typeof facts?.entityName === "string" ? facts.entityName : "";
  const yearMap = new Map<number, YearFinancials>();

  // USD facts
  for (const [field, tags] of Object.entries(TAG_CANDIDATES)) {
    applyTagToYearMap(
      yearMap,
      facts.facts ?? {},
      field as FieldKey,
      tags,
      "USD",
      years
    );
  }
  // Per-share facts
  for (const [field, tags] of Object.entries(PER_SHARE_TAGS)) {
    applyTagToYearMap(
      yearMap,
      facts.facts ?? {},
      field as FieldKey,
      tags,
      "USD/shares",
      years
    );
  }
  // Share-count facts
  for (const [field, tags] of Object.entries(SHARE_COUNT_TAGS)) {
    applyTagToYearMap(
      yearMap,
      facts.facts ?? {},
      field as FieldKey,
      tags,
      "shares",
      years
    );
  }

  const yearsArr = Array.from(yearMap.values())
    .sort((a, b) =>
      a.endDate < b.endDate ? 1 : a.endDate > b.endDate ? -1 : 0
    )
    .slice(0, years);

  // Compute Free Cash Flow = Operating CF + CapEx (CapEx is reported negative
  // in some filings, positive in others — both work with addition because we
  // subtract by sign).
  for (const y of yearsArr) {
    if (y.operatingCashFlow !== undefined && y.capex !== undefined) {
      const capexAbs = Math.abs(y.capex);
      y.freeCashFlow = y.operatingCashFlow - capexAbs;
    }
  }

  const availableUsGaapTags = Object.keys(facts?.facts?.["us-gaap"] ?? {});

  return {
    ticker: ticker.toUpperCase(),
    cik,
    entityName,
    source: "SEC EDGAR",
    years: yearsArr,
    availableUsGaapTags,
  };
}

export async function fetchAllFinancials(
  ticker: string,
  years = 5
): Promise<Financials> {
  const entry = await lookupCik(ticker);
  const rawFacts = await fetchCompanyFacts(entry.cik);
  const parsed = parseFinancials(ticker, entry.cik, rawFacts, years);
  if (!parsed.entityName) {
    parsed.entityName = entry.title;
  }
  return parsed;
}
