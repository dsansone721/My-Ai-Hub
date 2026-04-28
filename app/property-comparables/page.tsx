"use client";

import { useMemo, useState } from "react";
import {
  BarChart3,
  Loader2,
  Sparkles,
  Copy,
  Check,
  Building2,
  Grid3x3,
  TrendingUp,
  ShieldAlert,
  AlertTriangle,
  Info,
  ListChecks,
  MapPin,
  Tag,
  Home,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

const PROPERTY_TYPES = ["Garden Style", "Mid-Rise", "High-Rise"] as const;
type PropertyType = (typeof PROPERTY_TYPES)[number];

const TENURE_TYPES = ["For Rent", "For Sale"] as const;
type TenureType = (typeof TENURE_TYPES)[number];

const AFFORDABILITY_LEVELS = [
  "Luxury",
  "Market Rate",
  "Workforce",
  "Affordable",
] as const;
type AffordabilityLevel = (typeof AFFORDABILITY_LEVELS)[number];

const AFFORDABILITY_LABELS: Record<AffordabilityLevel, string> = {
  Luxury: "Luxury",
  "Market Rate": "Market Rate",
  Workforce: "Workforce (60-80% AMI)",
  Affordable: "Affordable (30-60% AMI)",
};

type ByBedroom = {
  studio: number | null;
  one_br: number | null;
  two_br: number | null;
  three_br: number | null;
};

type RentDetails = {
  asking_rents: ByBedroom;
  effective_rents: ByBedroom;
  occupancy_pct: number;
  concessions: string;
  utilities_included: string[];
  lease_terms: string;
};
type SaleDetails = {
  list_prices: ByBedroom;
  price_per_sf: ByBedroom;
  hoa_fees_monthly: ByBedroom;
  days_on_market_avg: number;
  sale_to_list_ratio_pct: number;
  absorption_rate_units_per_month: number;
};
type GardenDetails = {
  lot_coverage_pct: number | null;
  parking_ratio: number | null;
  parking_type: string;
};
type MidRiseDetails = {
  floor_count: number | null;
  has_elevator: boolean;
  amenities: string[];
};
type HighRiseDetails = {
  floor_count: number | null;
  views_premium: string;
  has_concierge: boolean;
  amenities: string[];
};

type Comp = {
  name: string;
  address: string;
  year_built: number | null;
  distance_miles: number;
  units: number;
  unit_sizes_sf: ByBedroom;
  management_company: string;
  hud_lihtc_flag: boolean;
  affordability_tier: string;
  ami_targeting: string;
  notes: string;
  rent_details?: RentDetails;
  sale_details?: SaleDetails;
  garden_details?: GardenDetails;
  mid_rise_details?: MidRiseDetails;
  high_rise_details?: HighRiseDetails;
};

type ComparablesResult = {
  subject: {
    location: string;
    property_type: PropertyType;
    tenure_type: TenureType;
    affordability_level: AffordabilityLevel;
    units: number;
  };
  comps: Comp[];
  market_summary: {
    submarket_analysis: string;
    subject_positioning: string;
    affordability_commentary: string;
    rent_metrics?: {
      market_rents: ByBedroom;
      market_occupancy_pct: number;
      rent_growth_pct_yoy: number;
    };
    sale_metrics?: {
      market_list_prices: ByBedroom;
      market_price_per_sf: ByBedroom;
      avg_days_on_market: number;
      price_growth_pct_yoy: number;
      absorption_rate_units_per_month: number;
    };
  };
  hud_insights: {
    supports_proposed_metrics: "yes" | "qualified" | "no";
    support_notes: string;
    vacancy_or_absorption_analysis: string;
    red_flags: string[];
    underwriting_summary: string;
  };
};

// === Formatters ===

function fmtRent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtPriceFull(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtPsf(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(0)}/sf`;
}
function fmtSf(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString()} sf`;
}
function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toFixed(digits)}%`;
}
function fmtSignedPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}
function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

// === Markdown export ===

function compsToMarkdown(result: ComparablesResult): string {
  const subj = result.subject;
  const isRent = subj.tenure_type === "For Rent";

  const headers = isRent
    ? [
        "Property",
        "Year",
        "Units",
        "Studio",
        "1 BR",
        "2 BR",
        "3 BR",
        "Occ %",
        "Dist (mi)",
      ]
    : [
        "Property",
        "Year",
        "Units",
        "Studio",
        "1 BR",
        "2 BR",
        "3 BR",
        "DOM",
        "Dist (mi)",
      ];

  const subjectRow = [
    `**SUBJECT — ${subj.location}**`,
    "TBD",
    String(subj.units),
    "—",
    "—",
    "—",
    "—",
    "—",
    "0.0",
  ];

  const compRows = result.comps.map((c) => {
    if (isRent) {
      const r = c.rent_details!;
      return [
        c.name,
        c.year_built ? String(c.year_built) : "—",
        String(c.units),
        fmtRent(r.asking_rents.studio),
        fmtRent(r.asking_rents.one_br),
        fmtRent(r.asking_rents.two_br),
        fmtRent(r.asking_rents.three_br),
        fmtPct(r.occupancy_pct),
        c.distance_miles.toFixed(1),
      ];
    } else {
      const s = c.sale_details!;
      return [
        c.name,
        c.year_built ? String(c.year_built) : "—",
        String(c.units),
        fmtPrice(s.list_prices.studio),
        fmtPrice(s.list_prices.one_br),
        fmtPrice(s.list_prices.two_br),
        fmtPrice(s.list_prices.three_br),
        `${Math.round(s.days_on_market_avg)}d`,
        c.distance_miles.toFixed(1),
      ];
    }
  });

  const market = result.market_summary;
  const marketRow = isRent
    ? [
        "**MARKET AVG**",
        "—",
        "—",
        fmtRent(market.rent_metrics?.market_rents.studio),
        fmtRent(market.rent_metrics?.market_rents.one_br),
        fmtRent(market.rent_metrics?.market_rents.two_br),
        fmtRent(market.rent_metrics?.market_rents.three_br),
        fmtPct(market.rent_metrics?.market_occupancy_pct),
        "—",
      ]
    : [
        "**MARKET AVG**",
        "—",
        "—",
        fmtPrice(market.sale_metrics?.market_list_prices.studio),
        fmtPrice(market.sale_metrics?.market_list_prices.one_br),
        fmtPrice(market.sale_metrics?.market_list_prices.two_br),
        fmtPrice(market.sale_metrics?.market_list_prices.three_br),
        market.sale_metrics
          ? `${Math.round(market.sale_metrics.avg_days_on_market)}d`
          : "—",
        "—",
      ];

  const footerLine = isRent
    ? `_Submarket occ: ${fmtPct(market.rent_metrics?.market_occupancy_pct)} · Rent growth YoY: ${fmtSignedPct(market.rent_metrics?.rent_growth_pct_yoy)}_`
    : `_Avg DOM: ${market.sale_metrics ? Math.round(market.sale_metrics.avg_days_on_market) + "d" : "—"} · Price growth YoY: ${fmtSignedPct(market.sale_metrics?.price_growth_pct_yoy)} · Absorption: ${fmtNum(market.sale_metrics?.absorption_rate_units_per_month, 1)} units/mo_`;

  return [
    `# ${subj.location} — ${subj.property_type} · ${subj.tenure_type} · ${AFFORDABILITY_LABELS[subj.affordability_level]}`,
    ``,
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    `| ${subjectRow.join(" | ")} |`,
    ...compRows.map((r) => `| ${r.join(" | ")} |`),
    `| ${marketRow.join(" | ")} |`,
    ``,
    footerLine,
  ].join("\n");
}

// === Page ===

export default function PropertyComparablesPage() {
  const [location, setLocation] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("Garden Style");
  const [tenureType, setTenureType] = useState<TenureType>("For Rent");
  const [affordabilityLevel, setAffordabilityLevel] =
    useState<AffordabilityLevel>("Market Rate");
  const [units, setUnits] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ComparablesResult | null>(null);
  const [copied, setCopied] = useState(false);

  const unitsNum = Number(units);
  const canSubmit =
    location.trim().length > 0 &&
    Number.isFinite(unitsNum) &&
    unitsNum > 0 &&
    !loading;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch("/api/property-comparables", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          location: location.trim(),
          propertyType,
          tenureType,
          affordabilityLevel,
          units: unitsNum,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setResult(data.result as ComparablesResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(compsToMarkdown(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Property Comparables"
        description="Build a defensible HUD multifamily comp set with market analysis and underwriting insights — for-rent or for-sale, market-rate or affordable."
        icon={BarChart3}
      />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="location"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
              >
                Project location
              </label>
              <input
                id="location"
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={loading}
                placeholder='e.g. "1234 Main St, Sarasota, FL" or "Sarasota, FL"'
                autoComplete="off"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <SelectField
                id="prop-type"
                label="Property type"
                value={propertyType}
                onChange={(v) => setPropertyType(v as PropertyType)}
                disabled={loading}
                options={PROPERTY_TYPES.map((t) => ({ value: t, label: t }))}
              />
              <SelectField
                id="tenure-type"
                label="Tenure type"
                value={tenureType}
                onChange={(v) => setTenureType(v as TenureType)}
                disabled={loading}
                options={TENURE_TYPES.map((t) => ({ value: t, label: t }))}
              />
              <SelectField
                id="affordability"
                label="Affordability level"
                value={affordabilityLevel}
                onChange={(v) =>
                  setAffordabilityLevel(v as AffordabilityLevel)
                }
                disabled={loading}
                options={AFFORDABILITY_LEVELS.map((t) => ({
                  value: t,
                  label: AFFORDABILITY_LABELS[t],
                }))}
              />
            </div>

            <div className="sm:w-40">
              <label
                htmlFor="units"
                className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
              >
                Total units
              </label>
              <input
                id="units"
                type="number"
                min={1}
                max={5000}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                disabled={loading}
                placeholder="200"
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <p className="text-xs text-muted">
                AI-assisted comp research — for analyst pre-screening, not a
                substitute for a third-party rent or sales comparability study.
              </p>
              <button
                type="submit"
                disabled={!canSubmit}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Building…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Generate comps
                  </>
                )}
              </button>
            </div>
          </form>
        </CardBody>
      </Card>

      {error && (
        <Card>
          <CardBody>
            <p className="text-sm text-red-400">{error}</p>
          </CardBody>
        </Card>
      )}

      {loading && !result && (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Researching submarket and pulling 5–8 {tenureType.toLowerCase()}{" "}
            comparables…
          </CardBody>
        </Card>
      )}

      {result && (
        <Results result={result} onCopy={handleCopy} copied={copied} />
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// === Results ===

function Results({
  result,
  onCopy,
  copied,
}: {
  result: ComparablesResult;
  onCopy: () => void;
  copied: boolean;
}) {
  const isRent = result.subject.tenure_type === "For Rent";
  return (
    <div className="space-y-6">
      <SubjectCard subject={result.subject} hud={result.hud_insights} />

      <SectionCard
        icon={Grid3x3}
        title="Comparable Set"
        action={
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-1.5 text-xs text-white hover:border-accent/60"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-accent" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" /> Copy as Markdown
              </>
            )}
          </button>
        }
      >
        <CompGrid
          comps={result.comps}
          subject={result.subject}
          market={result.market_summary}
        />
      </SectionCard>

      <SectionCard icon={MapPin} title="Comp Details">
        <div className="space-y-3">
          {result.comps.map((c, i) => (
            <CompDetailCard
              key={i}
              comp={c}
              tenureType={result.subject.tenure_type}
              propertyType={result.subject.property_type}
            />
          ))}
        </div>
      </SectionCard>

      <SectionCard icon={TrendingUp} title="Market Summary">
        <MarketSummary summary={result.market_summary} isRent={isRent} />
      </SectionCard>

      <SectionCard icon={ShieldAlert} title="HUD Underwriting Insights">
        <HudInsights insights={result.hud_insights} isRent={isRent} />
      </SectionCard>

      <Card>
        <CardBody className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            Comps and market data are AI-generated from training-data knowledge
            of the submarket. Use as analyst pre-screening only — a HUD
            submission requires a third-party rent or sales comparability study.
          </span>
        </CardBody>
      </Card>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
              <Icon className="h-3.5 w-3.5" />
            </div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
          </div>
          {action}
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

function SubjectCard({
  subject,
  hud,
}: {
  subject: ComparablesResult["subject"];
  hud: ComparablesResult["hud_insights"];
}) {
  const isRent = subject.tenure_type === "For Rent";
  const supportTone =
    hud.supports_proposed_metrics === "yes"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      : hud.supports_proposed_metrics === "qualified"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
        : "bg-red-500/10 text-red-300 border-red-500/30";
  const metricNoun = isRent ? "rents" : "prices";
  const supportLabel =
    hud.supports_proposed_metrics === "yes"
      ? `Market supports ${metricNoun}`
      : hud.supports_proposed_metrics === "qualified"
        ? `Qualified support (${metricNoun})`
        : `${metricNoun.charAt(0).toUpperCase() + metricNoun.slice(1)} not supported`;

  return (
    <Card>
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Subject
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-white">
                {subject.location}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="accent">{subject.property_type}</Badge>
                <Badge tone="accent">{subject.tenure_type}</Badge>
                <Badge tone="accent">
                  {AFFORDABILITY_LABELS[subject.affordability_level]}
                </Badge>
                <Badge>{subject.units} units</Badge>
              </div>
            </div>
          </div>
          <div
            className={`inline-flex items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-xs font-medium ${supportTone}`}
          >
            <ShieldAlert className="h-3.5 w-3.5" />
            {supportLabel}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "accent";
}) {
  const cls =
    tone === "accent"
      ? "bg-accent-soft text-accent font-medium"
      : "bg-elevated text-muted";
  return <span className={`rounded-md px-2 py-0.5 ${cls}`}>{children}</span>;
}

// === Comp Grid ===

function CompGrid({
  comps,
  subject,
  market,
}: {
  comps: Comp[];
  subject: ComparablesResult["subject"];
  market: ComparablesResult["market_summary"];
}) {
  const isRent = subject.tenure_type === "For Rent";

  const compRentAvgs = useMemo(() => {
    const buckets: Record<keyof ByBedroom, number[]> = {
      studio: [],
      one_br: [],
      two_br: [],
      three_br: [],
    };
    for (const c of comps) {
      const source = isRent
        ? c.rent_details?.asking_rents
        : c.sale_details?.list_prices;
      if (!source) continue;
      (Object.keys(buckets) as (keyof ByBedroom)[]).forEach((k) => {
        const v = source[k];
        if (typeof v === "number" && Number.isFinite(v)) buckets[k].push(v);
      });
    }
    const avg = (xs: number[]) =>
      xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;
    return {
      studio: avg(buckets.studio),
      one_br: avg(buckets.one_br),
      two_br: avg(buckets.two_br),
      three_br: avg(buckets.three_br),
    };
  }, [comps, isRent]);

  const lastColLabel = isRent ? "Occ %" : "DOM";

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-elevated/60">
          <tr>
            <Th left>Property</Th>
            <Th>Year</Th>
            <Th>Units</Th>
            <Th>Studio</Th>
            <Th>1 BR</Th>
            <Th>2 BR</Th>
            <Th>3 BR</Th>
            <Th>{lastColLabel}</Th>
            <Th>Dist (mi)</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          <tr className="bg-accent-soft/40">
            <Td bold>{`SUBJECT — ${subject.location}`}</Td>
            <Td>TBD</Td>
            <Td>{subject.units.toLocaleString()}</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>0.0</Td>
          </tr>
          {comps.map((c, i) => {
            const fmt = isRent ? fmtRent : fmtPrice;
            const source = isRent
              ? c.rent_details?.asking_rents
              : c.sale_details?.list_prices;
            const lastCell = isRent
              ? fmtPct(c.rent_details?.occupancy_pct)
              : c.sale_details
                ? `${Math.round(c.sale_details.days_on_market_avg)}d`
                : "—";
            return (
              <tr key={i} className="hover:bg-elevated/40">
                <Td bold>
                  <span className="inline-flex items-center gap-1.5">
                    {c.name}
                    {c.hud_lihtc_flag && (
                      <span
                        title="HUD/LIHTC financed"
                        className="rounded-sm bg-emerald-500/15 px-1 py-0 text-[9px] font-semibold uppercase tracking-wider text-emerald-300"
                      >
                        LIHTC
                      </span>
                    )}
                  </span>
                </Td>
                <Td>{c.year_built ?? "—"}</Td>
                <Td>{c.units.toLocaleString()}</Td>
                <Td>{fmt(source?.studio)}</Td>
                <Td>{fmt(source?.one_br)}</Td>
                <Td>{fmt(source?.two_br)}</Td>
                <Td>{fmt(source?.three_br)}</Td>
                <Td>{lastCell}</Td>
                <Td>{c.distance_miles.toFixed(1)}</Td>
              </tr>
            );
          })}
          <tr className="bg-elevated/60 font-medium">
            <Td bold>Comp Avg</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>{(isRent ? fmtRent : fmtPrice)(compRentAvgs.studio)}</Td>
            <Td>{(isRent ? fmtRent : fmtPrice)(compRentAvgs.one_br)}</Td>
            <Td>{(isRent ? fmtRent : fmtPrice)(compRentAvgs.two_br)}</Td>
            <Td>{(isRent ? fmtRent : fmtPrice)(compRentAvgs.three_br)}</Td>
            <Td>—</Td>
            <Td>—</Td>
          </tr>
          <tr className="bg-elevated/40">
            <Td bold>Market Avg</Td>
            <Td>—</Td>
            <Td>—</Td>
            <Td>
              {isRent
                ? fmtRent(market.rent_metrics?.market_rents.studio)
                : fmtPrice(market.sale_metrics?.market_list_prices.studio)}
            </Td>
            <Td>
              {isRent
                ? fmtRent(market.rent_metrics?.market_rents.one_br)
                : fmtPrice(market.sale_metrics?.market_list_prices.one_br)}
            </Td>
            <Td>
              {isRent
                ? fmtRent(market.rent_metrics?.market_rents.two_br)
                : fmtPrice(market.sale_metrics?.market_list_prices.two_br)}
            </Td>
            <Td>
              {isRent
                ? fmtRent(market.rent_metrics?.market_rents.three_br)
                : fmtPrice(market.sale_metrics?.market_list_prices.three_br)}
            </Td>
            <Td>
              {isRent
                ? fmtPct(market.rent_metrics?.market_occupancy_pct)
                : market.sale_metrics
                  ? `${Math.round(market.sale_metrics.avg_days_on_market)}d`
                  : "—"}
            </Td>
            <Td>—</Td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  left,
}: {
  children: React.ReactNode;
  left?: boolean;
}) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted ${
        left ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  bold,
}: {
  children: React.ReactNode;
  bold?: boolean;
}) {
  return (
    <td
      className={`whitespace-nowrap px-3 py-2 tabular-nums ${
        bold ? "text-left font-medium text-white" : "text-right text-white/90"
      }`}
    >
      {children}
    </td>
  );
}

// === Comp Detail Card ===

function CompDetailCard({
  comp,
  tenureType,
  propertyType,
}: {
  comp: Comp;
  tenureType: TenureType;
  propertyType: PropertyType;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
            {comp.name}
            {comp.hud_lihtc_flag && (
              <span className="rounded-sm bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                HUD / LIHTC
              </span>
            )}
          </h4>
          <p className="mt-0.5 text-xs text-muted">{comp.address}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <Pill>{comp.year_built ?? "Year unk."}</Pill>
          <Pill>{comp.units} units</Pill>
          <Pill>{comp.distance_miles.toFixed(1)} mi</Pill>
        </div>
      </div>

      {/* Universal meta row */}
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <MetaCell
          icon={Tag}
          label="Affordability"
          value={`${comp.affordability_tier} · ${comp.ami_targeting}`}
        />
        <MetaCell
          icon={Home}
          label="Management"
          value={comp.management_company || "—"}
        />
      </div>

      {/* Unit sizes */}
      <ByBedroomGrid
        title="Unit Sizes"
        values={comp.unit_sizes_sf}
        format={fmtSf}
      />

      {/* Tenure-specific block */}
      {tenureType === "For Rent" && comp.rent_details && (
        <RentDetailsBlock details={comp.rent_details} />
      )}
      {tenureType === "For Sale" && comp.sale_details && (
        <SaleDetailsBlock details={comp.sale_details} />
      )}

      {/* Property-type-specific block */}
      {propertyType === "Garden Style" && comp.garden_details && (
        <GardenBlock details={comp.garden_details} />
      )}
      {propertyType === "Mid-Rise" && comp.mid_rise_details && (
        <MidRiseBlock details={comp.mid_rise_details} />
      )}
      {propertyType === "High-Rise" && comp.high_rise_details && (
        <HighRiseBlock details={comp.high_rise_details} />
      )}

      {comp.notes && (
        <p className="text-xs italic leading-relaxed text-muted">
          {comp.notes}
        </p>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-elevated px-2 py-0.5 text-muted">
      {children}
    </span>
  );
}

function MetaCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        <Icon className="h-3 w-3" />
        {label}
      </p>
      <p className="mt-0.5 text-xs text-white/90">{value}</p>
    </div>
  );
}

function ByBedroomGrid({
  title,
  values,
  format,
}: {
  title: string;
  values: ByBedroom;
  format: (n: number | null | undefined) => string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {(
          [
            { key: "studio", label: "Studio" },
            { key: "one_br", label: "1 BR" },
            { key: "two_br", label: "2 BR" },
            { key: "three_br", label: "3 BR" },
          ] as const
        ).map((f) => (
          <div
            key={f.key}
            className="rounded-md border border-border bg-background/50 p-2 text-center"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {f.label}
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-white">
              {format(values[f.key])}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RentDetailsBlock({ details }: { details: RentDetails }) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-elevated/30 p-3">
      <SectionHeader>For-Rent details</SectionHeader>
      <ByBedroomGrid
        title="Asking Rent"
        values={details.asking_rents}
        format={fmtRent}
      />
      <ByBedroomGrid
        title="Effective Rent (after concessions)"
        values={details.effective_rents}
        format={fmtRent}
      />
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <KvRow label="Occupancy" value={fmtPct(details.occupancy_pct)} />
        <KvRow label="Lease terms" value={details.lease_terms || "—"} />
        <KvRow label="Concessions" value={details.concessions || "None"} />
        <KvRow
          label="Utilities included"
          value={
            details.utilities_included.length > 0
              ? details.utilities_included.join(", ")
              : "None"
          }
        />
      </div>
    </div>
  );
}

function SaleDetailsBlock({ details }: { details: SaleDetails }) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-elevated/30 p-3">
      <SectionHeader>For-Sale details</SectionHeader>
      <ByBedroomGrid
        title="List Price"
        values={details.list_prices}
        format={fmtPriceFull}
      />
      <ByBedroomGrid
        title="$ / SF"
        values={details.price_per_sf}
        format={fmtPsf}
      />
      <ByBedroomGrid
        title="HOA / month"
        values={details.hoa_fees_monthly}
        format={fmtRent}
      />
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <KvRow
          label="Avg DOM"
          value={`${Math.round(details.days_on_market_avg)} days`}
        />
        <KvRow
          label="Sale / List"
          value={fmtPct(details.sale_to_list_ratio_pct)}
        />
        <KvRow
          label="Absorption"
          value={`${fmtNum(details.absorption_rate_units_per_month, 1)} units/mo`}
        />
      </div>
    </div>
  );
}

function GardenBlock({ details }: { details: GardenDetails }) {
  return (
    <div className="rounded-md border border-border bg-elevated/30 p-3">
      <SectionHeader>Garden Style details</SectionHeader>
      <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <KvRow label="Lot coverage" value={fmtPct(details.lot_coverage_pct)} />
        <KvRow
          label="Parking ratio"
          value={
            details.parking_ratio !== null
              ? `${details.parking_ratio.toFixed(2)} per unit`
              : "—"
          }
        />
        <KvRow label="Parking type" value={details.parking_type || "—"} />
      </div>
    </div>
  );
}

function MidRiseBlock({ details }: { details: MidRiseDetails }) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-elevated/30 p-3">
      <SectionHeader>Mid-Rise details</SectionHeader>
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
        <KvRow
          label="Floors"
          value={details.floor_count !== null ? String(details.floor_count) : "—"}
        />
        <KvRow
          label="Elevator"
          value={details.has_elevator ? "Yes" : "No"}
        />
      </div>
      <AmenitiesRow amenities={details.amenities} />
    </div>
  );
}

function HighRiseBlock({ details }: { details: HighRiseDetails }) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-elevated/30 p-3">
      <SectionHeader>High-Rise details</SectionHeader>
      <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <KvRow
          label="Floors"
          value={details.floor_count !== null ? String(details.floor_count) : "—"}
        />
        <KvRow
          label="Concierge"
          value={details.has_concierge ? "Yes" : "No"}
        />
        <KvRow label="Views premium" value={details.views_premium || "—"} />
      </div>
      <AmenitiesRow amenities={details.amenities} />
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">
      {children}
    </p>
  );
}

function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-0.5 text-xs text-white/90">{value}</p>
    </div>
  );
}

function AmenitiesRow({ amenities }: { amenities: string[] }) {
  if (amenities.length === 0) {
    return (
      <p className="text-[11px] italic text-muted">No amenities listed.</p>
    );
  }
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted">
        Amenities
      </p>
      <div className="flex flex-wrap gap-1.5">
        {amenities.map((a, i) => (
          <span
            key={i}
            className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted"
          >
            {a}
          </span>
        ))}
      </div>
    </div>
  );
}

// === Market Summary ===

function MarketSummary({
  summary,
  isRent,
}: {
  summary: ComparablesResult["market_summary"];
  isRent: boolean;
}) {
  return (
    <div className="space-y-4">
      {isRent && summary.rent_metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat
            label="Mkt Studio"
            value={fmtRent(summary.rent_metrics.market_rents.studio)}
          />
          <Stat
            label="Mkt 1 BR"
            value={fmtRent(summary.rent_metrics.market_rents.one_br)}
          />
          <Stat
            label="Mkt 2 BR"
            value={fmtRent(summary.rent_metrics.market_rents.two_br)}
          />
          <Stat
            label="Mkt 3 BR"
            value={fmtRent(summary.rent_metrics.market_rents.three_br)}
          />
          <Stat
            label="Occupancy"
            value={fmtPct(summary.rent_metrics.market_occupancy_pct)}
          />
          <Stat
            label="YoY Growth"
            value={fmtSignedPct(summary.rent_metrics.rent_growth_pct_yoy)}
          />
        </div>
      )}
      {!isRent && summary.sale_metrics && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Mkt Studio"
              value={fmtPriceFull(summary.sale_metrics.market_list_prices.studio)}
            />
            <Stat
              label="Mkt 1 BR"
              value={fmtPriceFull(summary.sale_metrics.market_list_prices.one_br)}
            />
            <Stat
              label="Mkt 2 BR"
              value={fmtPriceFull(summary.sale_metrics.market_list_prices.two_br)}
            />
            <Stat
              label="Mkt 3 BR"
              value={fmtPriceFull(summary.sale_metrics.market_list_prices.three_br)}
            />
            <Stat
              label="Avg DOM"
              value={`${Math.round(summary.sale_metrics.avg_days_on_market)}d`}
            />
            <Stat
              label="Price YoY"
              value={fmtSignedPct(summary.sale_metrics.price_growth_pct_yoy)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="$/SF Studio"
              value={fmtPsf(summary.sale_metrics.market_price_per_sf.studio)}
            />
            <Stat
              label="$/SF 1BR"
              value={fmtPsf(summary.sale_metrics.market_price_per_sf.one_br)}
            />
            <Stat
              label="$/SF 2BR"
              value={fmtPsf(summary.sale_metrics.market_price_per_sf.two_br)}
            />
            <Stat
              label="$/SF 3BR"
              value={fmtPsf(summary.sale_metrics.market_price_per_sf.three_br)}
            />
          </div>
          <Stat
            label="Market Absorption"
            value={`${fmtNum(summary.sale_metrics.absorption_rate_units_per_month, 1)} units/mo`}
          />
        </>
      )}

      <Para label="Submarket Analysis" body={summary.submarket_analysis} />
      <Para label="Subject Positioning" body={summary.subject_positioning} />
      <Para
        label="Affordability Commentary"
        body={summary.affordability_commentary}
      />
    </div>
  );
}

function Para({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-white/90">{body}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm tabular-nums text-white/90">{value}</p>
    </div>
  );
}

// === HUD Insights ===

function HudInsights({
  insights,
  isRent,
}: {
  insights: ComparablesResult["hud_insights"];
  isRent: boolean;
}) {
  return (
    <div className="space-y-4">
      <Para
        label={isRent ? "Rent Support" : "Price Support"}
        body={insights.support_notes}
      />
      <Para
        label={isRent ? "Vacancy Cushion" : "Absorption Pace"}
        body={insights.vacancy_or_absorption_analysis}
      />
      {insights.red_flags.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            Red Flags
          </p>
          <ul className="space-y-1.5">
            {insights.red_flags.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-white/90"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <ListChecks className="h-3 w-3" />
          Underwriting Summary
        </p>
        <p className="mt-1 text-sm leading-relaxed text-white/90">
          {insights.underwriting_summary}
        </p>
      </div>
    </div>
  );
}
