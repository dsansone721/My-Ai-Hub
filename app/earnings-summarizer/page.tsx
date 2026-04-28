"use client";

import { useState } from "react";
import {
  FileText,
  Loader2,
  Sparkles,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Building2,
  BarChart3,
  ListChecks,
  Compass,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";

type EarningsSummary = {
  company_overview: string;
  key_financial_metrics: {
    revenue: string;
    eps: string;
    margins: string;
    yoy_growth: string;
  };
  key_takeaways: string[];
  management_outlook: string;
  bull_vs_bear: {
    bull: string[];
    bear: string[];
  };
};

function summaryToMarkdown(s: EarningsSummary): string {
  const m = s.key_financial_metrics;
  return [
    `# Earnings Summary`,
    ``,
    `## Company Overview`,
    s.company_overview,
    ``,
    `## Key Financial Metrics`,
    `- **Revenue:** ${m.revenue}`,
    `- **EPS:** ${m.eps}`,
    `- **Margins:** ${m.margins}`,
    `- **YoY Growth:** ${m.yoy_growth}`,
    ``,
    `## Key Takeaways`,
    ...s.key_takeaways.map((t) => `- ${t}`),
    ``,
    `## Management Outlook`,
    s.management_outlook,
    ``,
    `## Bull Case`,
    ...s.bull_vs_bear.bull.map((t) => `- ${t}`),
    ``,
    `## Bear Case`,
    ...s.bull_vs_bear.bear.map((t) => `- ${t}`),
    ``,
  ].join("\n");
}

export default function EarningsSummarizerPage() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<EarningsSummary | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit = text.trim().length > 0 && !loading;

  async function handleSubmit() {
    setError(null);
    setSummary(null);
    setLoading(true);
    try {
      const res = await fetch("/api/summarize-earnings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Request failed (${res.status})`);
      }
      setSummary(data.summary as EarningsSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!summary) return;
    try {
      await navigator.clipboard.writeText(summaryToMarkdown(summary));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Could not copy to clipboard.");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Earnings Summarizer"
        description="Paste an earnings transcript, press release, or article. Claude will return a structured summary with the key financials, takeaways, outlook, and a bull/bear case."
        icon={FileText}
      />

      <Card>
        <CardBody className="space-y-4">
          <label htmlFor="earnings-input" className="block text-sm font-medium text-white">
            Source material
          </label>
          <textarea
            id="earnings-input"
            rows={12}
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={loading}
            placeholder="Paste the earnings call transcript, press release, or article here…"
            className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">
              {text.length.toLocaleString()} characters
            </p>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Summarizing…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Summarize
                </>
              )}
            </button>
          </div>
        </CardBody>
      </Card>

      {error && (
        <Card>
          <CardBody>
            <p className="text-sm text-red-400">{error}</p>
          </CardBody>
        </Card>
      )}

      {loading && !summary && (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Analyzing the report — this usually takes 10–30 seconds.
          </CardBody>
        </Card>
      )}

      {summary && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">Summary</h2>
            <button
              onClick={handleCopy}
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
          </div>

          <SummaryCard
            icon={Building2}
            title="Company Overview"
            body={<p className="text-sm leading-relaxed text-white/90">{summary.company_overview}</p>}
          />

          <SummaryCard
            icon={BarChart3}
            title="Key Financial Metrics"
            body={
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Metric label="Revenue" value={summary.key_financial_metrics.revenue} />
                <Metric label="EPS" value={summary.key_financial_metrics.eps} />
                <Metric label="Margins" value={summary.key_financial_metrics.margins} />
                <Metric label="YoY Growth" value={summary.key_financial_metrics.yoy_growth} />
              </div>
            }
          />

          <SummaryCard
            icon={ListChecks}
            title="Key Takeaways"
            body={
              <ul className="space-y-2">
                {summary.key_takeaways.map((t, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-white/90">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            }
          />

          <SummaryCard
            icon={Compass}
            title="Management Outlook"
            body={<p className="text-sm leading-relaxed text-white/90">{summary.management_outlook}</p>}
          />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <BullBearCard
              title="Bull Case"
              icon={TrendingUp}
              tone="bull"
              items={summary.bull_vs_bear.bull}
            />
            <BullBearCard
              title="Bear Case"
              icon={TrendingDown}
              tone="bear"
              items={summary.bull_vs_bear.bear}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent-soft text-accent">
            <Icon className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        {body}
      </CardBody>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm text-white/90">{value}</p>
    </div>
  );
}

function BullBearCard({
  title,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "bull" | "bear";
  items: string[];
}) {
  const toneClasses =
    tone === "bull"
      ? "bg-emerald-500/10 text-emerald-400"
      : "bg-red-500/10 text-red-400";
  const dotClass = tone === "bull" ? "bg-emerald-400" : "bg-red-400";
  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-md ${toneClasses}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
        </div>
        <ul className="space-y-2">
          {items.map((t, i) => (
            <li key={i} className="flex gap-2 text-sm leading-relaxed text-white/90">
              <span className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${dotClass}`} />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
