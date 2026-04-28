"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ImageIcon,
  Sparkles,
  Loader2,
  Download,
  Building2,
  Sun,
  Crop,
  Trash2,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";
import type { GenerateRenderingResponse } from "@/app/api/generate-rendering/route";

const FACG_NAVY = "#1B2B6B";
const FACG_RED = "#C8102E";

const PROPERTY_TYPES = [
  "Garden Style",
  "Mid-Rise",
  "High-Rise",
  "Luxury Condo",
  "Senior Housing",
] as const;
const SETTINGS = [
  "Urban",
  "Suburban",
  "Waterfront",
  "Golf Course",
  "Mixed Use",
] as const;
const STYLES = [
  "Modern",
  "Traditional",
  "Mediterranean",
  "Contemporary",
  "Craftsman",
] as const;
const TIMES_OF_DAY = ["Day", "Golden Hour", "Dusk", "Night"] as const;

const ASPECT_OPTIONS = [
  { value: "16:9", label: "Landscape 16:9", size: "1792 × 1024" },
  { value: "1:1", label: "Square 1:1", size: "1024 × 1024" },
  { value: "9:16", label: "Portrait 9:16", size: "1024 × 1792" },
] as const;

type PropertyType = (typeof PROPERTY_TYPES)[number];
type Setting = (typeof SETTINGS)[number];
type Style = (typeof STYLES)[number];
type TimeOfDay = (typeof TIMES_OF_DAY)[number];
type AspectRatio = (typeof ASPECT_OPTIONS)[number]["value"];

const STORAGE_KEY = "facg-renderings-history";
const STORAGE_VERSION = 1;
const MAX_HISTORY = 6;

type HistoryItem = GenerateRenderingResponse;

type Persisted = { v: number; items: HistoryItem[] };

function loadHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || parsed.v !== STORAGE_VERSION || !Array.isArray(parsed.items))
      return [];
    return parsed.items.slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = {
      v: STORAGE_VERSION,
      items: items.slice(0, MAX_HISTORY),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota or private mode — ignore */
  }
}

export default function RenderingsGeneratorPage() {
  const [description, setDescription] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("Mid-Rise");
  const [setting, setSetting] = useState<Setting>("Urban");
  const [style, setStyle] = useState<Style>("Modern");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("Golden Hour");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<HistoryItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    setHistory(loadHistory());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveHistory(history);
  }, [history, hydrated]);

  async function handleGenerate() {
    if (description.trim().length < 8) {
      setError("Add at least a sentence describing the property.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-rendering", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          property_type: propertyType,
          setting,
          style,
          time_of_day: timeOfDay,
          aspect_ratio: aspectRatio,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? `Generation failed (${res.status}).`);
      }
      const item = data as HistoryItem;
      setCurrent(item);
      setHistory((prev) => [item, ...prev].slice(0, MAX_HISTORY));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(item: HistoryItem) {
    setDownloading(true);
    setError(null);
    try {
      const slug =
        item.inputs.property_type.replace(/\s+/g, "_") +
        "_" +
        new Date(item.generated_at).getTime();
      const res = await fetch("/api/download-image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: item.image_url,
          filename: `FACG_Rendering_${slug}.png`,
        }),
      });
      if (!res.ok) {
        let msg = `Download failed (${res.status}).`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* ignore */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : "rendering.png";
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
      setDownloading(false);
    }
  }

  function clearHistory() {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Clear all generated renderings from this browser?")
    ) {
      return;
    }
    setHistory([]);
    setCurrent(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Renderings Generator"
        description="Generate photorealistic architectural renderings for pitch decks and offering memoranda. Claude writes the prompt, DALL-E 3 renders the image."
        icon={ImageIcon}
      />

      <Card>
        <PanelHeader icon={Building2} title="Property Specs" />
        <CardBody className="space-y-4">
          <FieldShell label="Property Description">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder='e.g. "23-story luxury coastal condo in Sarasota FL with rooftop pool, ocean views, and arrival motor court"'
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm text-white placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </FieldShell>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SelectField
              label="Property Type"
              value={propertyType}
              onChange={(v) => setPropertyType(v as PropertyType)}
              options={PROPERTY_TYPES}
            />
            <SelectField
              label="Setting"
              value={setting}
              onChange={(v) => setSetting(v as Setting)}
              options={SETTINGS}
            />
            <SelectField
              label="Style"
              value={style}
              onChange={(v) => setStyle(v as Style)}
              options={STYLES}
            />
            <SelectField
              label="Time of Day"
              value={timeOfDay}
              onChange={(v) => setTimeOfDay(v as TimeOfDay)}
              options={TIMES_OF_DAY}
            />
          </div>

          <FieldShell label="Aspect Ratio">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {ASPECT_OPTIONS.map((opt) => {
                const selected = aspectRatio === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAspectRatio(opt.value)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                      selected
                        ? "border-transparent text-white"
                        : "border-border text-white/85 hover:border-accent/40"
                    }`}
                    style={selected ? { backgroundColor: FACG_NAVY } : undefined}
                  >
                    <Crop className="h-3.5 w-3.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold">{opt.label}</p>
                      <p className={selected ? "text-white/70" : "text-muted"}>
                        {opt.size}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </FieldShell>

          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-xs text-muted">
              Standard quality · DALL-E 3 · Claude-optimized prompt
            </p>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: FACG_RED }}
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Generate Rendering
                </>
              )}
            </button>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          {generating && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              Claude is writing the rendering prompt and DALL-E is rendering the
              image. This usually takes 20-40 seconds.
            </div>
          )}
        </CardBody>
      </Card>

      {current && (
        <Card>
          <PanelHeader
            icon={Sun}
            title="Latest Rendering"
            action={
              <button
                type="button"
                onClick={() => handleDownload(current)}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: FACG_RED }}
              >
                {downloading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Preparing…
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" /> Download PNG
                  </>
                )}
              </button>
            }
          />
          <CardBody className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-border bg-background/40">
              <RenderedImage item={current} />
            </div>
            <SpecsRow item={current} />
            <PromptCallout prompt={current.prompt} />
          </CardBody>
        </Card>
      )}

      {history.length > 0 && (
        <Card>
          <PanelHeader
            icon={ImageIcon}
            title={`Recent Renderings (last ${MAX_HISTORY})`}
            action={
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-muted hover:border-red-500/50 hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            }
          />
          <CardBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {history.map((item, i) => (
                <HistoryCard
                  key={`${item.generated_at}-${i}`}
                  item={item}
                  onSelect={() => setCurrent(item)}
                  onDownload={() => handleDownload(item)}
                />
              ))}
            </div>
            <p className="mt-3 inline-flex items-start gap-1.5 text-[11px] text-muted">
              <Info className="mt-0.5 h-3 w-3 flex-shrink-0" />
              DALL-E image URLs expire roughly an hour after generation. Download
              renderings you want to keep.
            </p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// =====================================================
// Subcomponents
// =====================================================

function PanelHeader({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-t-xl px-5 py-3"
      style={{ backgroundColor: FACG_NAVY }}
    >
      <Icon className="h-4 w-4 text-white" />
      <h3 className="flex-1 text-sm font-semibold uppercase tracking-wide text-white">
        {title}
      </h3>
      {action}
    </div>
  );
}

function FieldShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <FieldShell label={label}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

function aspectClass(aspect: string): string {
  switch (aspect) {
    case "16:9":
      return "aspect-[16/9]";
    case "9:16":
      return "aspect-[9/16] mx-auto max-w-md";
    default:
      return "aspect-square mx-auto max-w-2xl";
  }
}

function RenderedImage({ item }: { item: HistoryItem }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div
        className={`relative flex w-full items-center justify-center bg-elevated ${aspectClass(item.inputs.aspect_ratio)}`}
      >
        <p className="px-6 text-center text-sm text-muted">
          The DALL-E image link has expired. Re-generate to view it again.
        </p>
      </div>
    );
  }
  return (
    <div className={`relative w-full ${aspectClass(item.inputs.aspect_ratio)}`}>
      <Image
        src={item.image_url}
        alt={item.inputs.description}
        fill
        unoptimized
        sizes="(max-width: 1024px) 100vw, 1024px"
        onError={() => setErrored(true)}
        className="object-cover"
      />
    </div>
  );
}

function SpecsRow({ item }: { item: HistoryItem }) {
  const i = item.inputs;
  const chips: { label: string; value: string }[] = [
    { label: "Type", value: i.property_type },
    { label: "Setting", value: i.setting },
    { label: "Style", value: i.style },
    { label: "Time", value: i.time_of_day },
    { label: "Aspect", value: i.aspect_ratio },
    { label: "Size", value: item.size },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.label}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated/60 px-2 py-1 text-[11px]"
        >
          <span className="text-muted">{c.label}:</span>
          <span className="font-semibold text-white">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

function PromptCallout({ prompt }: { prompt: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className="rounded-lg border px-3 py-2.5 text-xs leading-relaxed"
      style={{
        borderColor: `${FACG_NAVY}66`,
        backgroundColor: `${FACG_NAVY}1a`,
        color: "#dde2f5",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/70">
          Claude-optimized prompt
        </span>
        <span className="text-[11px] text-white/60 hover:text-white">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && <p className="mt-2 whitespace-pre-line">{prompt}</p>}
    </div>
  );
}

function HistoryCard({
  item,
  onSelect,
  onDownload,
}: {
  item: HistoryItem;
  onSelect: () => void;
  onDownload: () => void;
}) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background/40">
      <button
        type="button"
        onClick={onSelect}
        className="block w-full"
        title="Open in main viewer"
      >
        <div className={`relative w-full ${historyAspect(item.inputs.aspect_ratio)}`}>
          {errored ? (
            <div className="flex h-full w-full items-center justify-center bg-elevated">
              <p className="px-3 text-center text-[11px] text-muted">
                Image expired
              </p>
            </div>
          ) : (
            <Image
              src={item.image_url}
              alt={item.inputs.description}
              fill
              unoptimized
              sizes="(max-width: 1024px) 100vw, 33vw"
              onError={() => setErrored(true)}
              className="object-cover"
            />
          )}
        </div>
      </button>
      <div className="space-y-2 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1">
          <Pill>{item.inputs.property_type}</Pill>
          <Pill>{item.inputs.setting}</Pill>
          <Pill>{item.inputs.time_of_day}</Pill>
        </div>
        <p className="line-clamp-2 text-xs leading-snug text-white/85">
          {item.inputs.description}
        </p>
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] text-muted">
            {new Date(item.generated_at).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </span>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-white/85 hover:border-accent/50 hover:text-white"
          >
            <Download className="h-3 w-3" /> PNG
          </button>
        </div>
      </div>
    </div>
  );
}

function historyAspect(aspect: string): string {
  switch (aspect) {
    case "16:9":
      return "aspect-[16/9]";
    case "9:16":
      return "aspect-[9/16]";
    default:
      return "aspect-square";
  }
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-elevated/60 px-1.5 py-0.5 text-[10px] font-medium text-white/85">
      {children}
    </span>
  );
}
