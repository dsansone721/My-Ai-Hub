"use client";

import { useMemo, useState } from "react";
import {
  LineChart,
  Loader2,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Building2,
  ListChecks,
  Calculator,
  Table as TableIcon,
  Grid3x3,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

type ModelType = "DCF" | "LBO" | "Comps";

type FinancialModel = {
  ticker: string;
  company_name: string;
  model_type: ModelType;
  current_price: number | null;
  implied_value: number;
  upside_pct: number | null;
  summary: string;
  assumptions: { label: string; value: string }[];
  projections: { headers: string[]; rows: { cells: string[] }[] };
  valuation_breakdown: { label: string; value: string }[];
  sensitivity: {
    title: string;
    row_label: string;
    col_label: string;
    row_values: string[];
    col_values: string[];
    matrix: number[][];
  };
  key_takeaways: string[];
};

const MODEL_OPTIONS: { value: ModelType; label: string; help: string }[] = [
  { value: "DCF", label: "DCF", help: "Discounted Cash Flow" },
  { value: "LBO", label: "LBO", help: "Leveraged Buyout" },
  { value: "Comps", label: "Comps", help: "Comparable Company Analysis" },
];

function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export default function FinancialModelsPage() {
  const [ticker, setTicker] = useState("");
  const [modelType, setModelType] = useState<ModelType>("DCF");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<FinancialModel | null>(null);

  const canSubmit = ticker.trim().length > 0 && !loading;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setModel(null);
    setLoading(true);
    setStatusMsg("Fetching financial data from Alpha Vantage…");
    try {
      const res = await fetch("/api/build-financial-model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticker: ticker.trim().toUpperCase(), modelType }),
      });
      setStatusMsg("Building model with Claude…");
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setModel(data.model as FinancialModel);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setStatusMsg(null);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Financial Models"
        description="Pull live financials and build a DCF, LBO, or Comparable Company model in one click. Sensitivity tables and assumptions included."
        icon={LineChart}
      />

      <Card>
        <CardBody>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <label
                  htmlFor="ticker"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
                >
                  Ticker
                </label>
                <input
                  id="ticker"
                  type="text"
                  value={ticker}
                  onChange={(e) =>
                    setTicker(e.target.value.toUpperCase().slice(0, 10))
                  }
                  disabled={loading}
                  placeholder="AAPL"
                  autoComplete="off"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                />
              </div>
              <div>
                <label
                  htmlFor="model-type"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted"
                >
                  Model
                </label>
                <select
                  id="model-type"
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value as ModelType)}
                  disabled={loading}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
                >
                  {MODEL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} — {opt.help}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Building…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Build model
                    </>
                  )}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted">
              Powered by SEC EDGAR — free, unlimited, official US financial data.
            </p>
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

      {loading && !model && (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            {statusMsg ?? "Working…"}
          </CardBody>
        </Card>
      )}

      {model && <ModelResults model={model} />}
    </div>
  );
}

function ModelResults({ model }: { model: FinancialModel }) {
  return (
    <div className="space-y-6">
      <SummaryHeader model={model} />

      <SectionCard icon={Calculator} title="Assumptions">
        <KeyValueGrid items={model.assumptions} />
      </SectionCard>

      <SectionCard icon={TableIcon} title="Projections">
        <ProjectionsTable
          headers={model.projections.headers}
          rows={model.projections.rows}
        />
      </SectionCard>

      <SectionCard icon={Building2} title="Valuation Breakdown">
        <KeyValueGrid items={model.valuation_breakdown} />
      </SectionCard>

      <SectionCard icon={Grid3x3} title="Sensitivity Analysis">
        <SensitivityTable
          sensitivity={model.sensitivity}
          currentPrice={model.current_price}
        />
      </SectionCard>

      <SectionCard icon={ListChecks} title="Key Takeaways">
        <ul className="space-y-2">
          {model.key_takeaways.map((t, i) => (
            <li
              key={i}
              className="flex gap-2 text-sm leading-relaxed text-white/90"
            >
              <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </div>
  );
}

function SummaryHeader({ model }: { model: FinancialModel }) {
  const upside = model.upside_pct;
  const tone =
    upside === null
      ? "neutral"
      : upside > 5
        ? "bull"
        : upside < -5
          ? "bear"
          : "neutral";
  const TrendIcon =
    tone === "bull" ? TrendingUp : tone === "bear" ? TrendingDown : Minus;
  const trendClass =
    tone === "bull"
      ? "text-emerald-400 bg-emerald-500/10"
      : tone === "bear"
        ? "text-red-400 bg-red-500/10"
        : "text-muted bg-elevated";

  return (
    <Card>
      <CardBody>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold text-white">
                {model.company_name}
              </h2>
              <span className="rounded-md bg-elevated px-2 py-0.5 text-xs font-medium text-muted">
                {model.ticker}
              </span>
              <span className="rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
                {model.model_type}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
              {model.summary}
            </p>
          </div>
          <div className="flex items-center gap-6">
            <PriceStat label="Current" value={formatPrice(model.current_price)} />
            <PriceStat
              label="Implied"
              value={formatPrice(model.implied_value)}
              accent
            />
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Upside
              </p>
              <div
                className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold ${trendClass}`}
              >
                <TrendIcon className="h-3.5 w-3.5" />
                {formatPct(upside)}
              </div>
            </div>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function PriceStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="text-right">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-semibold tabular-nums ${
          accent ? "text-accent" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        {children}
      </CardBody>
    </Card>
  );
}

function KeyValueGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((kv, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-background/50 p-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            {kv.label}
          </p>
          <p className="mt-1 text-sm tabular-nums text-white/90">{kv.value}</p>
        </div>
      ))}
    </div>
  );
}

function ProjectionsTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: { cells: string[] }[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-elevated/60">
          <tr>
            {headers.map((h, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row, ri) => (
            <tr key={ri} className="hover:bg-elevated/40">
              {row.cells.map((cell, ci) => (
                <td
                  key={ci}
                  className={`whitespace-nowrap px-3 py-2 tabular-nums ${
                    ci === 0 ? "font-medium text-white" : "text-white/90"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SensitivityTable({
  sensitivity,
  currentPrice,
}: {
  sensitivity: FinancialModel["sensitivity"];
  currentPrice: number | null;
}) {
  const { matrix, row_values, col_values, row_label, col_label, title } =
    sensitivity;

  const { min, max, anchor } = useMemo(() => {
    const flat = matrix.flat().filter((n) => Number.isFinite(n));
    if (flat.length === 0) return { min: 0, max: 0, anchor: 0 };
    const lo = Math.min(...flat);
    const hi = Math.max(...flat);
    const anc =
      currentPrice !== null && Number.isFinite(currentPrice)
        ? currentPrice
        : (lo + hi) / 2;
    return { min: lo, max: hi, anchor: anc };
  }, [matrix, currentPrice]);

  function cellClass(value: number): string {
    if (!Number.isFinite(value)) return "text-muted";
    if (anchor === 0) return "text-white/90";
    return value >= anchor ? "text-emerald-100" : "text-red-100";
  }

  function cellStyle(value: number): React.CSSProperties {
    if (!Number.isFinite(value) || anchor === 0) return {};
    const above = value >= anchor;
    const range = above ? max - anchor || 1 : anchor - min || 1;
    const distance = above ? value - anchor : anchor - value;
    const intensity = Math.min(1, Math.max(0, distance / range));
    const opacity = 0.08 + intensity * 0.45;
    return above
      ? { backgroundColor: `rgba(16, 185, 129, ${opacity})` } // emerald-500
      : { backgroundColor: `rgba(239, 68, 68, ${opacity})` }; // red-500
  }

  function fmtCell(value: number): string {
    if (!Number.isFinite(value)) return "—";
    if (Math.abs(value) < 100 && Math.abs(value) > 0) {
      return value.toLocaleString(undefined, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 2,
      });
    }
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        <span className="font-medium text-white">{title}</span>
        {" — rows: "}
        {row_label}, columns: {col_label}.
        {currentPrice !== null && (
          <>
            {" Color anchor: current price "}
            <span className="font-medium text-white">
              {formatPrice(currentPrice)}
            </span>
            .
          </>
        )}
      </p>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-elevated/60">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                {row_label} \ {col_label}
              </th>
              {col_values.map((c, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-muted"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {matrix.map((row, ri) => (
              <tr key={ri}>
                <td className="whitespace-nowrap bg-elevated/40 px-3 py-2 text-left text-xs font-semibold text-muted">
                  {row_values[ri] ?? `Row ${ri + 1}`}
                </td>
                {row.map((value, ci) => (
                  <td
                    key={ci}
                    style={cellStyle(value)}
                    className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${cellClass(value)}`}
                  >
                    {fmtCell(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
