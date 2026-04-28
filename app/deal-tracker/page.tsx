"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Handshake,
  Upload,
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ArrowLeft,
  ClipboardList,
  Layers,
  DollarSign as DollarIcon,
  Settings2,
  Users as UsersIcon,
  Building2,
  Calculator,
  ShieldAlert,
  FileSpreadsheet,
  Presentation,
  FileText as FileTextIcon,
  Download,
  X,
  ChartArea,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";
import {
  ASSET_TYPES,
  HUD_PROGRAMS,
  EMPTY_WIZARD_STATE,
  computeMetrics,
  type AssetType,
  type HudProgram,
  type DealInputs,
  type WizardState,
  type WizardComparables,
  type UnderwritingResult,
  type StressTestResult,
  type QAItem,
  type ExtractedSourcesUses,
} from "@/lib/deal-tracker/types";

const FACG_NAVY = "#1B2B6B";
const FACG_RED = "#C8102E";

const STEPS = [
  { num: 1, name: "Deal Intake", icon: ClipboardList },
  { num: 2, name: "Market Comparables", icon: Building2 },
  { num: 3, name: "HUD Underwriting Model", icon: Calculator },
  { num: 4, name: "Stress Test & Analyst", icon: ShieldAlert },
  { num: 5, name: "Generate Deal Package", icon: Download },
] as const;

// === Formatters ===
function fmt$(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}
function fmt$Short(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtPct(n: number, digits = 2): string {
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : "—";
}
function fmtX(n: number): string {
  return Number.isFinite(n) ? `${n.toFixed(2)}x` : "—";
}

// === Page ===
// === Persistence ===
const STORAGE_KEY = "facg-deal-engine";
const STORAGE_VERSION = 1;

type Persisted = {
  v: number;
  step: number;
  state: WizardState;
  savedAt: string;
};

function loadPersisted(): Persisted | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      parsed.v !== STORAGE_VERSION ||
      typeof parsed.step !== "number" ||
      !parsed.state
    ) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[deal-engine] failed to read storage:", err);
    return null;
  }
}

function savePersisted(step: number, state: WizardState) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = {
      v: STORAGE_VERSION,
      step,
      state,
      savedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error("[deal-engine] failed to persist:", err);
  }
}

function clearPersisted() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function formatRestoredAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const now = Date.now();
    const diffSec = Math.floor((now - d.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)} hr ago`;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function DealTrackerPage() {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({ ...EMPTY_WIZARD_STATE });
  const [hydrated, setHydrated] = useState(false);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  // Hydrate from localStorage on first mount only. Keep initial render
  // consistent with SSR (empty defaults) to avoid hydration mismatches.
  useEffect(() => {
    const loaded = loadPersisted();
    if (loaded) {
      setStep(loaded.step);
      setState(loaded.state);
      setRestoredAt(loaded.savedAt);
    }
    setHydrated(true);
  }, []);

  // Persist whenever step or state changes (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    savePersisted(step, state);
  }, [step, state, hydrated]);

  function patchInputs(p: Partial<DealInputs>) {
    setState((s) => ({ ...s, inputs: { ...s.inputs, ...p } }));
  }
  function setInputs(next: DealInputs) {
    setState((s) => ({ ...s, inputs: next }));
  }
  function setExtractedFields(keys: string[]) {
    setState((s) => ({
      ...s,
      // Union with anything previously extracted so multiple uploads accumulate
      extractedFields: Array.from(new Set([...s.extractedFields, ...keys])),
    }));
  }
  function setExtractedSourcesUses(esu: ExtractedSourcesUses | null) {
    // Last-write-wins: a new upload with an S&U table replaces the prior one.
    setState((s) => ({ ...s, extractedSourcesUses: esu }));
  }
  function handleClearDeal() {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Clear all deal data and start a fresh deal? This cannot be undone."
      )
    ) {
      return;
    }
    clearPersisted();
    setStep(1);
    setState({ ...EMPTY_WIZARD_STATE });
    setRestoredAt(null);
  }

  const reachable = useMemo(() => {
    if (state.stressTest) return 5;
    if (state.underwriting) return 4;
    if (state.comparables) return 3;
    return Math.min(2, step + 1); // step 1 is always available, can advance to 2
  }, [state.comparables, state.underwriting, state.stressTest, step]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Deal Engine"
        description="The FACG deal pipeline: intake → comps → underwriting → stress test → package generation."
        icon={Handshake}
      />

      <ProgressBar
        step={step}
        reachable={reachable}
        onClick={(n) => {
          if (n <= reachable) setStep(n);
        }}
        onClear={handleClearDeal}
        restoredAt={restoredAt}
      />

      {step === 1 && (
        <Step1Intake
          state={state}
          patchInputs={patchInputs}
          setInputs={setInputs}
          onExtractedFields={setExtractedFields}
          onExtractedSourcesUses={setExtractedSourcesUses}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step2Comparables
          state={state}
          setComparables={(c) =>
            setState((s) => ({ ...s, comparables: c }))
          }
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && (
        <Step3Underwriting
          state={state}
          setUnderwriting={(u) =>
            setState((s) => ({ ...s, underwriting: u }))
          }
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}
      {step === 4 && (
        <Step4StressTest
          state={state}
          setStressTest={(t) =>
            setState((s) => ({ ...s, stressTest: t }))
          }
          setQa={(qa) => setState((s) => ({ ...s, qa }))}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      )}
      {step === 5 && <Step5Generate state={state} onBack={() => setStep(4)} />}
    </div>
  );
}

// === Progress Bar ===
function ProgressBar({
  step,
  reachable,
  onClick,
  onClear,
  restoredAt,
}: {
  step: number;
  reachable: number;
  onClick: (n: number) => void;
  onClear: () => void;
  restoredAt: string | null;
}) {
  const restoredLabel = restoredAt ? formatRestoredAt(restoredAt) : null;
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">
            {restoredLabel ? (
              <>
                <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-400" />
                Restored from auto-save · {restoredLabel}
              </>
            ) : (
              <>Auto-saving deal progress to this browser…</>
            )}
          </p>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-2.5 py-1.5 text-[11px] font-medium text-muted hover:border-red-500/50 hover:text-red-300"
            title="Clear all deal data and start a fresh deal"
          >
            <Trash2 className="h-3 w-3" />
            Clear Deal
          </button>
        </div>
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const active = step === s.num;
            const done = step > s.num;
            const reached = s.num <= reachable;
            return (
              <li key={s.num}>
                <button
                  type="button"
                  onClick={() => onClick(s.num)}
                  disabled={!reached}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    active
                      ? "border-transparent text-white"
                      : reached
                        ? "border-border text-white/90 hover:border-accent/40"
                        : "cursor-not-allowed border-border/50 text-muted/50"
                  }`}
                  style={
                    active
                      ? { backgroundColor: FACG_NAVY }
                      : done
                        ? { backgroundColor: `${FACG_NAVY}33` }
                        : undefined
                  }
                >
                  <span
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{
                      backgroundColor: active
                        ? FACG_RED
                        : done
                          ? FACG_NAVY
                          : "#2A2F3A",
                      color: "#fff",
                    }}
                  >
                    {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : s.num}
                  </span>
                  <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                  <span className="truncate text-xs font-medium">{s.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </CardBody>
    </Card>
  );
}

// === Step 1: Intake ===
function Step1Intake({
  state,
  patchInputs,
  setInputs,
  onExtractedFields,
  onExtractedSourcesUses,
  onNext,
}: {
  state: WizardState;
  patchInputs: (p: Partial<DealInputs>) => void;
  setInputs: (next: DealInputs) => void;
  onExtractedFields: (keys: string[]) => void;
  onExtractedSourcesUses: (esu: ExtractedSourcesUses | null) => void;
  onNext: () => void;
}) {
  const inputs = state.inputs;
  const computed = useMemo(() => computeMetrics(inputs), [inputs]);
  const [extracting, setExtracting] = useState(false);
  const [extractNotes, setExtractNotes] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function update<K extends keyof DealInputs>(key: K, value: DealInputs[K]) {
    patchInputs({ [key]: value } as Partial<DealInputs>);
  }

  async function handleFiles(files: FileList | File[]) {
    const arr = Array.from(files).filter((f) => f.size > 0);
    if (arr.length === 0) return;
    setExtractError(null);
    setExtractNotes(null);
    setExtracting(true);
    try {
      const fd = new FormData();
      for (const f of arr) fd.append("file", f);
      const res = await fetch("/api/deal-tracker/extract", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`);
      const fields = (data.fields ?? {}) as Partial<DealInputs>;
      const next = { ...inputs };
      const acceptedKeys: string[] = [];
      for (const [k, v] of Object.entries(fields)) {
        if (v === undefined || v === null) continue;
        if (k in inputs) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (next as any)[k] = v;
          acceptedKeys.push(k);
        }
      }
      setInputs(next);
      if (acceptedKeys.length > 0) onExtractedFields(acceptedKeys);
      // Capture verbatim S&U if the extractor returned one — this becomes the
      // single source of truth for the deal's capital structure and flows
      // through underwriting and all document generators untouched.
      if (data.sources_uses !== undefined) {
        onExtractedSourcesUses(
          (data.sources_uses as ExtractedSourcesUses | null) ?? null
        );
      }
      if (typeof data.notes === "string" && data.notes) setExtractNotes(data.notes);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const canProceed = inputs.project_name.trim().length > 0 && inputs.city_state.trim().length > 0;

  return (
    <div className="space-y-6">
      {/* File upload — drag & drop */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2">
            <FacgChip icon={Upload}>Upload Deal Documents</FacgChip>
          </div>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragActive(false);
              if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
            }}
            className={`rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragActive ? "border-accent bg-accent-soft/20" : "border-border bg-background/40"
            }`}
          >
            <Upload className="mx-auto h-6 w-6 text-muted" />
            <p className="mt-2 text-sm text-white">
              Drag & drop PDF, Excel, Word, or PowerPoint files
            </p>
            <p className="mt-1 text-xs text-muted">
              or{" "}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="font-medium text-accent underline-offset-2 hover:underline"
              >
                browse
              </button>{" "}
              — multiple files supported, 10MB each, 25MB total
            </p>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.xls,.pptx,.csv,.txt"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
              className="hidden"
              disabled={extracting}
            />
          </div>
          {extracting && (
            <div className="flex items-center gap-2 text-sm text-muted">
              <Loader2 className="h-4 w-4 animate-spin text-accent" />
              Analyzing uploaded files…
            </div>
          )}
          {extractError && (
            <p className="text-sm text-red-400">{extractError}</p>
          )}
          {extractNotes && (
            <div
              className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed"
              style={{
                borderColor: `${FACG_NAVY}66`,
                backgroundColor: `${FACG_NAVY}1a`,
                color: "#dde2f5",
              }}
            >
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="whitespace-pre-line">{extractNotes}</span>
            </div>
          )}
        </CardBody>
      </Card>

      <Collapsible icon={Building2} title="Project Overview" defaultOpen>
        <Grid cols={3}>
          <TextField label="Project Name" value={inputs.project_name} onChange={(v) => update("project_name", v)} />
          <TextField label="Address" value={inputs.address} onChange={(v) => update("address", v)} />
          <TextField label="City, State" value={inputs.city_state} onChange={(v) => update("city_state", v)} />
          <SelectField
            label="Asset Type"
            value={inputs.asset_type}
            onChange={(v) => update("asset_type", v as AssetType)}
            options={ASSET_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <SelectField
            label="HUD Program"
            value={inputs.hud_program}
            onChange={(v) => update("hud_program", v as HudProgram)}
            options={HUD_PROGRAMS.map((t) => ({ value: t, label: t }))}
          />
          <NumberField label="Total Units" value={inputs.total_units} onChange={(v) => update("total_units", v)} integer />
          <NumberField label="Total Stories" value={inputs.total_stories} onChange={(v) => update("total_stories", v)} integer />
          <NumberField label="Total Acres" value={inputs.total_acres} onChange={(v) => update("total_acres", v)} decimals={2} />
          <NumberField label="Parking Spaces" value={inputs.parking_spaces} onChange={(v) => update("parking_spaces", v)} integer />
          <NumberField label="Construction Period (months)" value={inputs.construction_months} onChange={(v) => update("construction_months", v)} integer />
          <NumberField label="Stabilization Period (months)" value={inputs.stabilization_months} onChange={(v) => update("stabilization_months", v)} integer />
        </Grid>
      </Collapsible>

      <Collapsible icon={Layers} title="Unit Mix" defaultOpen>
        <Grid cols={3}>
          <NumberField label="Studio Count" value={inputs.studio_count} onChange={(v) => update("studio_count", v)} integer />
          <NumberField label="Studio Avg SF" value={inputs.studio_sf} onChange={(v) => update("studio_sf", v)} integer />
          <MoneyField label="Studio Monthly Rent" value={inputs.studio_rent} onChange={(v) => update("studio_rent", v)} />
          <NumberField label="1BR Count" value={inputs.one_br_count} onChange={(v) => update("one_br_count", v)} integer />
          <NumberField label="1BR Avg SF" value={inputs.one_br_sf} onChange={(v) => update("one_br_sf", v)} integer />
          <MoneyField label="1BR Monthly Rent" value={inputs.one_br_rent} onChange={(v) => update("one_br_rent", v)} />
          <NumberField label="2BR Count" value={inputs.two_br_count} onChange={(v) => update("two_br_count", v)} integer />
          <NumberField label="2BR Avg SF" value={inputs.two_br_sf} onChange={(v) => update("two_br_sf", v)} integer />
          <MoneyField label="2BR Monthly Rent" value={inputs.two_br_rent} onChange={(v) => update("two_br_rent", v)} />
          <NumberField label="3BR Count" value={inputs.three_br_count} onChange={(v) => update("three_br_count", v)} integer />
          <NumberField label="3BR Avg SF" value={inputs.three_br_sf} onChange={(v) => update("three_br_sf", v)} integer />
          <MoneyField label="3BR Monthly Rent" value={inputs.three_br_rent} onChange={(v) => update("three_br_rent", v)} />
        </Grid>
        <LiveCalc
          items={[
            { label: "Units (from mix)", value: String(computed.total_units_from_mix) },
            { label: "GPR (annual)", value: fmt$(computed.gross_potential_rent_annual) },
          ]}
        />
      </Collapsible>

      <Collapsible icon={DollarIcon} title="Capital Structure" defaultOpen>
        <Grid cols={3}>
          <MoneyField label="HUD Loan Amount" value={inputs.hud_loan_amount} onChange={(v) => update("hud_loan_amount", v)} />
          <PercentField label="HUD Note Rate" value={inputs.hud_note_rate} onChange={(v) => update("hud_note_rate", v)} />
          <NumberField label="Amortization (years)" value={inputs.amortization_years} onChange={(v) => update("amortization_years", v)} integer />
          <PercentField label="MIP Rate" value={inputs.mip_rate} onChange={(v) => update("mip_rate", v)} />
          <MoneyField label="Land Value" value={inputs.land_value} onChange={(v) => update("land_value", v)} />
          <MoneyField label="Hard Costs" value={inputs.hard_costs} onChange={(v) => update("hard_costs", v)} />
          <MoneyField label="Soft Costs & Fees" value={inputs.soft_costs_fees} onChange={(v) => update("soft_costs_fees", v)} />
          <MoneyField label="Financing & Carrying Costs" value={inputs.financing_carrying_costs} onChange={(v) => update("financing_carrying_costs", v)} />
          <MoneyField label="BSPRA Amount" value={inputs.bspra_amount} onChange={(v) => update("bspra_amount", v)} />
          <MoneyField label="Working Capital Escrow" value={inputs.working_capital_escrow} onChange={(v) => update("working_capital_escrow", v)} />
          <MoneyField label="IOD Escrow" value={inputs.iod_escrow} onChange={(v) => update("iod_escrow", v)} />
          <MoneyField label="Sponsor Funds Spent to Date" value={inputs.sponsor_funds_spent} onChange={(v) => update("sponsor_funds_spent", v)} />
          <MoneyField label="Sponsor Cash to Close" value={inputs.sponsor_cash_to_close} onChange={(v) => update("sponsor_cash_to_close", v)} />
          <MoneyField label="Bridge Loan Amount" value={inputs.bridge_loan_amount} onChange={(v) => update("bridge_loan_amount", v)} />
          <PercentField label="Bridge Rate" value={inputs.bridge_rate} onChange={(v) => update("bridge_rate", v)} />
          <NumberField label="Bridge Term (months)" value={inputs.bridge_term_months} onChange={(v) => update("bridge_term_months", v)} integer />
        </Grid>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/5 px-3 py-2 text-xs text-blue-200">
          <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-400" />
          <span>
            Bridge loan is a pre-development timing instrument and is excluded
            from Total Project Cost. It will be retired at HUD construction
            closing.
          </span>
        </div>
        <LiveCalc
          items={[
            { label: "Total Project Cost", value: fmt$Short(computed.total_project_cost) },
            { label: "LTC", value: fmtPct(computed.ltc_pct, 1) },
            { label: "Cost / Unit", value: fmt$Short(computed.cost_per_unit) },
          ]}
        />
      </Collapsible>

      <Collapsible icon={Settings2} title="Operating Assumptions" defaultOpen>
        <Grid cols={3}>
          <PercentField label="Vacancy & Coll. Loss" value={inputs.vacancy_collection_pct} onChange={(v) => update("vacancy_collection_pct", v)} />
          <PercentField label="Property Management" value={inputs.property_mgmt_pct} onChange={(v) => update("property_mgmt_pct", v)} />
          <MoneyField label="R&M & Turnover" value={inputs.rm_turnover} onChange={(v) => update("rm_turnover", v)} />
          <MoneyField label="Common Area Utilities" value={inputs.common_area_utilities} onChange={(v) => update("common_area_utilities", v)} />
          <MoneyField label="G&A" value={inputs.gna} onChange={(v) => update("gna", v)} />
          <MoneyField label="Payroll" value={inputs.payroll} onChange={(v) => update("payroll", v)} />
          <MoneyField label="Operations" value={inputs.operations} onChange={(v) => update("operations", v)} />
          <MoneyField label="Insurance" value={inputs.insurance} onChange={(v) => update("insurance", v)} />
          <MoneyField label="Replacement Reserves" value={inputs.replacement_reserves} onChange={(v) => update("replacement_reserves", v)} />
          <MoneyField label="Ancillary Income" value={inputs.ancillary_income} onChange={(v) => update("ancillary_income", v)} />
          <PercentField label="Rent Growth" value={inputs.rent_growth_pct} onChange={(v) => update("rent_growth_pct", v)} />
          <PercentField label="Exit Cap Rate" value={inputs.exit_cap_rate} onChange={(v) => update("exit_cap_rate", v)} />
          <MoneyField label="Property Tax (full)" value={inputs.property_tax} onChange={(v) => update("property_tax", v)} />
          <PercentField label="Tax Abatement" value={inputs.tax_abatement_pct} onChange={(v) => update("tax_abatement_pct", v)} />
        </Grid>
        <LiveCalc
          items={[
            { label: "Total OpEx", value: fmt$Short(computed.operating_expenses) },
            { label: "NOI", value: fmt$Short(computed.noi_stabilized) },
            { label: "DSCR", value: fmtX(computed.dscr) },
            { label: "Yield on Cost", value: fmtPct(computed.yield_on_cost_pct, 2) },
          ]}
        />
      </Collapsible>

      <Collapsible icon={ChartArea} title="AMI Rent Limits">
        <Grid cols={3}>
          <TextField label="Market" value={inputs.ami_market} onChange={(v) => update("ami_market", v)} />
          <TextField label="Source" value={inputs.ami_source} onChange={(v) => update("ami_source", v)} />
          <Spacer />
          <MoneyField label="1BR — 80% AMI" value={inputs.ami_1br_80} onChange={(v) => update("ami_1br_80", v)} />
          <MoneyField label="1BR — 100% AMI" value={inputs.ami_1br_100} onChange={(v) => update("ami_1br_100", v)} />
          <MoneyField label="1BR — 120% AMI" value={inputs.ami_1br_120} onChange={(v) => update("ami_1br_120", v)} />
          <MoneyField label="2BR — 80% AMI" value={inputs.ami_2br_80} onChange={(v) => update("ami_2br_80", v)} />
          <MoneyField label="2BR — 100% AMI" value={inputs.ami_2br_100} onChange={(v) => update("ami_2br_100", v)} />
          <MoneyField label="2BR — 120% AMI" value={inputs.ami_2br_120} onChange={(v) => update("ami_2br_120", v)} />
        </Grid>
      </Collapsible>

      <Collapsible icon={UsersIcon} title="Model Oversight">
        <Grid cols={3}>
          <TextField label="Managing Director" value={inputs.managing_director} onChange={(v) => update("managing_director", v)} />
          <TextField label="Analyst Name" value={inputs.analyst_name} onChange={(v) => update("analyst_name", v)} />
          <DateField label="Date" value={inputs.date} onChange={(v) => update("date", v)} />
        </Grid>
      </Collapsible>

      <NavRow>
        <span className="text-xs text-muted">
          {!canProceed && "Enter a project name and city/state to proceed."}
        </span>
        <FacgButton onClick={onNext} disabled={!canProceed}>
          Proceed to Market Comparables <ArrowRight className="h-4 w-4" />
        </FacgButton>
      </NavRow>
    </div>
  );
}

// === Step 2: Comparables ===
function Step2Comparables({
  state,
  setComparables,
  onBack,
  onNext,
}: {
  state: WizardState;
  setComparables: (c: WizardComparables | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (state.comparables || fired.current) return;
    fired.current = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/deal-tracker/comparables", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(state.inputs),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        setComparables(data.comparables as WizardComparables);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to pull comps.");
        fired.current = false;
      } finally {
        setLoading(false);
      }
    })();
  }, [state.comparables, state.inputs, setComparables]);

  return (
    <div className="space-y-6">
      {loading && (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Pulling market comparables for {state.inputs.city_state}…
          </CardBody>
        </Card>
      )}
      {error && (
        <Card>
          <CardBody className="space-y-2">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => {
                fired.current = false;
                setComparables(null);
              }}
              className="text-xs font-medium text-accent hover:underline"
            >
              Retry
            </button>
          </CardBody>
        </Card>
      )}
      {state.comparables && (
        <CompsDisplay comparables={state.comparables} subjectName={state.inputs.project_name || "Subject"} subjectLocation={state.inputs.city_state} />
      )}
      <NavRow>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-white hover:border-accent/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <FacgButton onClick={onNext} disabled={!state.comparables}>
          Proceed to HUD Underwriting Model <ArrowRight className="h-4 w-4" />
        </FacgButton>
      </NavRow>
    </div>
  );
}

function CompsDisplay({
  comparables,
  subjectName,
  subjectLocation,
}: {
  comparables: WizardComparables;
  subjectName: string;
  subjectLocation: string;
}) {
  const ms = comparables.market_summary;
  const verdictTone =
    ms.rent_supportability === "supports"
      ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
      : ms.rent_supportability === "qualified"
        ? "bg-amber-500/10 text-amber-300 border-amber-500/30"
        : "bg-red-500/10 text-red-300 border-red-500/30";
  return (
    <div className="space-y-4">
      <FacgPanel icon={Building2} title="Comparable Set">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-elevated/60">
              <tr>
                <Th left>Property</Th>
                <Th left>Location</Th>
                <Th>Year</Th>
                <Th>Units</Th>
                <Th>Studio</Th>
                <Th>1 BR</Th>
                <Th>2 BR</Th>
                <Th>3 BR</Th>
                <Th>Occ</Th>
                <Th>Dist</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <tr style={{ backgroundColor: `${FACG_NAVY}33` }}>
                <Td bold>SUBJECT — {subjectName}</Td>
                <Td>{subjectLocation}</Td>
                <Td>TBD</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>0.0</Td>
              </tr>
              {comparables.comps.map((c, i) => (
                <tr key={i} className="hover:bg-elevated/30">
                  <Td bold>
                    <span className="inline-flex items-center gap-1.5">
                      {c.name}
                      {c.hud_lihtc_flag && (
                        <span className="rounded-sm bg-emerald-500/15 px-1 py-0 text-[9px] font-semibold uppercase text-emerald-300">
                          LIHTC
                        </span>
                      )}
                    </span>
                  </Td>
                  <Td>{c.location}</Td>
                  <Td>{c.year_built ?? "—"}</Td>
                  <Td>{c.units}</Td>
                  <Td>{c.rents.studio !== null ? fmt$(c.rents.studio) : "—"}</Td>
                  <Td>{c.rents.one_br !== null ? fmt$(c.rents.one_br) : "—"}</Td>
                  <Td>{c.rents.two_br !== null ? fmt$(c.rents.two_br) : "—"}</Td>
                  <Td>{c.rents.three_br !== null ? fmt$(c.rents.three_br) : "—"}</Td>
                  <Td>{fmtPct(c.occupancy_pct, 1)}</Td>
                  <Td>{c.distance_miles.toFixed(1)}</Td>
                </tr>
              ))}
              <tr className="bg-elevated/40 font-medium">
                <Td bold>MARKET AVG</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>{ms.market_rents.studio !== null ? fmt$(ms.market_rents.studio) : "—"}</Td>
                <Td>{ms.market_rents.one_br !== null ? fmt$(ms.market_rents.one_br) : "—"}</Td>
                <Td>{ms.market_rents.two_br !== null ? fmt$(ms.market_rents.two_br) : "—"}</Td>
                <Td>{ms.market_rents.three_br !== null ? fmt$(ms.market_rents.three_br) : "—"}</Td>
                <Td>{fmtPct(ms.market_occupancy_pct, 1)}</Td>
                <Td>—</Td>
              </tr>
              <tr className="bg-elevated/40">
                <Td bold>HUD FMR</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>{ms.hud_fmr.studio !== null ? fmt$(ms.hud_fmr.studio) : "—"}</Td>
                <Td>{ms.hud_fmr.one_br !== null ? fmt$(ms.hud_fmr.one_br) : "—"}</Td>
                <Td>{ms.hud_fmr.two_br !== null ? fmt$(ms.hud_fmr.two_br) : "—"}</Td>
                <Td>{ms.hud_fmr.three_br !== null ? fmt$(ms.hud_fmr.three_br) : "—"}</Td>
                <Td>—</Td>
                <Td>—</Td>
              </tr>
            </tbody>
          </table>
        </div>
      </FacgPanel>
      <FacgPanel icon={ShieldAlert} title="Market Summary & Rent Supportability">
        <div className="space-y-3">
          <div className={`inline-flex items-center gap-2 self-start rounded-lg border px-3 py-1.5 text-xs font-medium ${verdictTone}`}>
            <ShieldAlert className="h-3.5 w-3.5" />
            Rent Supportability: {ms.rent_supportability.toUpperCase()}
          </div>
          <Para label="Subject vs Market Rents" body={ms.subject_vs_market} />
          <Para label="Subject vs HUD FMR" body={ms.subject_vs_fmr} />
          <Para label="HUD Underwriting Commentary" body={ms.commentary} />
        </div>
      </FacgPanel>
    </div>
  );
}

// === Step 3: Underwriting ===
function Step3Underwriting({
  state,
  setUnderwriting,
  onBack,
  onNext,
}: {
  state: WizardState;
  setUnderwriting: (u: UnderwritingResult | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (state.underwriting || fired.current) return;
    fired.current = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/deal-tracker/underwriting", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inputs: state.inputs,
            extractedFields: state.extractedFields,
            extractedSourcesUses: state.extractedSourcesUses,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        setUnderwriting(data.underwriting as UnderwritingResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to compute model.");
        fired.current = false;
      } finally {
        setLoading(false);
      }
    })();
  }, [
    state.underwriting,
    state.inputs,
    state.extractedFields,
    state.extractedSourcesUses,
    setUnderwriting,
  ]);

  return (
    <div className="space-y-6">
      {loading && (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Building HUD underwriting model…
          </CardBody>
        </Card>
      )}
      {error && (
        <Card>
          <CardBody>
            <p className="text-sm text-red-400">{error}</p>
          </CardBody>
        </Card>
      )}
      {state.underwriting && (
        <UwDisplay underwriting={state.underwriting} inputs={state.inputs} />
      )}
      <NavRow>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-white hover:border-accent/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <FacgButton onClick={onNext} disabled={!state.underwriting}>
          Proceed to Stress Test <ArrowRight className="h-4 w-4" />
        </FacgButton>
      </NavRow>
    </div>
  );
}

function UwDisplay({
  underwriting,
  inputs,
}: {
  underwriting: UnderwritingResult;
  inputs: DealInputs;
}) {
  const c = underwriting.computed;
  const bc = underwriting.balance_check;
  const totalSources = bc.total_sources;
  const totalUses = bc.total_uses;
  const proForma = underwriting.pro_forma;
  const sourcesEmpty = underwriting.sources.length === 0;
  const usesEmpty = underwriting.uses.length === 0;

  return (
    <div className="space-y-4">
      {/* === Deal Summary === */}
      <FacgPanel icon={Building2} title="Deal Summary">
        <div className="mb-3">
          <h4 className="text-base font-semibold text-white">{inputs.project_name || "(Unnamed)"}</h4>
          <p className="text-xs text-muted">{[inputs.address, inputs.city_state].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <Grid cols={3}>
          <Stat label="HUD Program" value={inputs.hud_program} />
          <Stat label="Total Units" value={String(c.total_units_used)} />
          <Stat label="HUD Loan" value={fmt$Short(inputs.hud_loan_amount)} />
          <Stat label="Total Project Cost" value={fmt$Short(c.total_project_cost)} />
          <Stat label="LTC" value={fmtPct(c.ltc_pct, 1)} highlight />
          <Stat label="LTV" value={fmtPct(c.ltv_pct, 1)} />
        </Grid>
        {underwriting.granular_notes && (
          <div
            className="mt-4 rounded-lg border px-3 py-2.5 text-xs leading-relaxed"
            style={{
              borderColor: `${FACG_NAVY}66`,
              backgroundColor: `${FACG_NAVY}1a`,
              color: "#dde2f5",
            }}
          >
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/70">
              Analyst Interpretation
            </p>
            <p>{underwriting.granular_notes}</p>
          </div>
        )}
      </FacgPanel>

      {/* === Data Confidence === */}
      <DataConfidencePanel summary={underwriting.confidence} />

      {/* === Sources & Uses === */}
      <FacgPanel icon={DollarIcon} title="Sources & Uses">
        <SourcesUsesProvenance origin={underwriting.sources_uses_origin} />
        <BalanceBanner check={bc} />
        <StatedTotalMismatchBanner check={bc} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <DynamicTable
            title="Sources"
            rows={underwriting.sources.map((r) => ({ label: r.label, value: fmt$(r.amount) }))}
            total={{ label: "Total Sources", value: fmt$(totalSources) }}
            emptyMessage={sourcesEmpty ? "No source line items provided." : undefined}
          />
          <DynamicTable
            title="Uses"
            rows={underwriting.uses.map((r) => ({ label: r.label, value: fmt$(r.amount) }))}
            total={{ label: "Total Uses", value: fmt$(totalUses) }}
            emptyMessage={usesEmpty ? "No use line items provided." : undefined}
          />
        </div>
      </FacgPanel>

      {/* === Unit Mix (only types with non-zero counts) === */}
      <FacgPanel icon={Layers} title="Unit Mix">
        {underwriting.unit_mix_table.length === 0 ? (
          <p className="text-xs text-muted">No unit-mix line items detected. Add unit counts in Step 1 to populate.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-elevated/60">
                <tr>
                  <Th left>Type</Th>
                  <Th>Count</Th>
                  <Th>SF</Th>
                  <Th>Monthly Rent</Th>
                  <Th>Annual Rent</Th>
                  <Th>% of Total</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {underwriting.unit_mix_table.map((row, i) => (
                  <tr key={i}>
                    <Td bold>{row.type}</Td>
                    <Td>{row.count}</Td>
                    <Td>{row.sf > 0 ? row.sf.toLocaleString() : "—"}</Td>
                    <Td>{fmt$(row.monthly_rent)}</Td>
                    <Td>{fmt$(row.annual_rent)}</Td>
                    <Td>{fmtPct(row.pct_of_units, 1)}</Td>
                  </tr>
                ))}
                <tr className="bg-elevated/40 font-semibold">
                  <Td bold>Total</Td>
                  <Td>{underwriting.unit_mix_table.reduce((a, r) => a + r.count, 0)}</Td>
                  <Td>—</Td>
                  <Td>—</Td>
                  <Td>{fmt$(underwriting.unit_mix_table.reduce((a, r) => a + r.annual_rent, 0))}</Td>
                  <Td>100.0%</Td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </FacgPanel>

      {/* === Pro Forma === */}
      <FacgPanel icon={Calculator} title="5-Year Pro Forma">
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-elevated/60">
              <tr>
                <Th left>Item</Th>
                {proForma.map((y) => (
                  <Th key={y.year}>Year {y.year}</Th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <ProRow label="Gross Potential Revenue" values={proForma.map((y) => y.revenue)} format={fmt$Short} />
              <ProRow label="(Vacancy & Coll. Loss)" values={proForma.map((y) => -y.vacancy_loss)} format={fmt$Short} muted />
              <ProRow label="Effective Gross Income" values={proForma.map((y) => y.effective_gross_income)} format={fmt$Short} />
              <ProRow label="(Operating Expenses)" values={proForma.map((y) => -y.operating_expenses)} format={fmt$Short} muted />
              <ProRow label="Net Operating Income" values={proForma.map((y) => y.noi)} format={fmt$Short} variant="noi" />
              <ProRow label="(Debt Service)" values={proForma.map((y) => -y.debt_service)} format={fmt$Short} muted />
              <ProRow label="Cash Flow After D/S" values={proForma.map((y) => y.cash_flow)} format={fmt$Short} signed />
              <ProRow label="DSCR" values={proForma.map((y) => y.dscr)} format={(n) => fmtX(n)} />
            </tbody>
          </table>
        </div>
      </FacgPanel>

      {/* === Key Metrics === */}
      <FacgPanel icon={Sparkles} title="Key Metrics">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <BigMetric label="Yield on Cost" value={fmtPct(c.yield_on_cost_pct, 2)} />
          <BigMetric label="DSCR" value={fmtX(c.dscr)} />
          <BigMetric label="Breakeven Occ" value={fmtPct(c.breakeven_occupancy_pct, 1)} />
          <BigMetric label="Value Creation" value={fmt$Short(c.value_creation)} />
        </div>
      </FacgPanel>

      {/* === AMI === */}
      {(inputs.ami_1br_120 > 0 || inputs.ami_2br_120 > 0) && (
        <FacgPanel icon={ChartArea} title="AMI Rent Analysis">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-elevated/60">
                <tr>
                  <Th left>Bedroom</Th>
                  <Th>Subject</Th>
                  <Th>80% AMI</Th>
                  <Th>100% AMI</Th>
                  <Th>120% AMI</Th>
                  <Th>% of 120%</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <AmiRow label="1BR" data={underwriting.ami_analysis.one_br} />
                <AmiRow label="2BR" data={underwriting.ami_analysis.two_br} />
              </tbody>
            </table>
          </div>
        </FacgPanel>
      )}

      {/* === Flags === */}
      <FacgPanel icon={ShieldAlert} title="HUD Underwriting Flags">
        <div className="space-y-2">
          {underwriting.flags.map((f, i) => (
            <FlagRow key={i} flag={f} />
          ))}
        </div>
      </FacgPanel>
    </div>
  );
}

function ProRow({
  label,
  values,
  format,
  variant,
  muted,
  signed,
}: {
  label: string;
  values: number[];
  format: (n: number) => string;
  variant?: "noi";
  muted?: boolean;
  signed?: boolean;
}) {
  // NOI: subtle horizontal accent (top/bottom border + faint tint), no boxed bg
  const rowCls =
    variant === "noi"
      ? "border-y border-accent/40"
      : "";
  const labelCls =
    variant === "noi"
      ? "text-white font-semibold"
      : muted
        ? "text-muted"
        : "text-white font-medium";
  return (
    <tr className={rowCls} style={variant === "noi" ? { backgroundColor: `${FACG_NAVY}1f` } : undefined}>
      <td className={`whitespace-nowrap px-3 py-2 text-left ${labelCls}`}>{label}</td>
      {values.map((v, i) => {
        let cellCls = "text-white/90";
        if (signed) {
          cellCls =
            v > 0
              ? "text-emerald-400 font-medium"
              : v < 0
                ? "text-red-400 font-medium"
                : "text-white/90";
        } else if (variant === "noi") {
          cellCls = "text-white font-semibold";
        } else if (muted) {
          cellCls = "text-muted";
        }
        return (
          <td
            key={i}
            className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${cellCls}`}
          >
            {format(v)}
          </td>
        );
      })}
    </tr>
  );
}

function SourcesUsesProvenance({
  origin,
}: {
  origin: UnderwritingResult["sources_uses_origin"];
}) {
  if (origin.source === "extracted") {
    return (
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
        <div>
          <span className="font-semibold">Extracted verbatim</span> from{" "}
          <span className="font-medium text-emerald-100">
            {origin.location ?? "uploaded model"}
          </span>{" "}
          — line items, labels, and totals reflect the spreadsheet exactly.
        </div>
      </div>
    );
  }
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
      <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
      <div>
        <span className="font-semibold">Derived from Step 1 inputs</span> — no
        Sources & Uses table was found in the upload. Upload an Excel model
        with an S&U tab for line-by-line accuracy.
      </div>
    </div>
  );
}

function StatedTotalMismatchBanner({
  check,
}: {
  check: UnderwritingResult["balance_check"];
}) {
  const issues: string[] = [];
  if (
    check.sources_sum_vs_stated !== null &&
    Math.abs(check.sources_sum_vs_stated) > 1
  ) {
    const sum = (check.stated_total_sources ?? 0) + check.sources_sum_vs_stated;
    issues.push(
      `Sources line items sum to ${fmt$(sum)} but the spreadsheet states ${fmt$(check.stated_total_sources ?? 0)} (Δ ${fmt$(check.sources_sum_vs_stated)}).`
    );
  }
  if (
    check.uses_sum_vs_stated !== null &&
    Math.abs(check.uses_sum_vs_stated) > 1
  ) {
    const sum = (check.stated_total_uses ?? 0) + check.uses_sum_vs_stated;
    issues.push(
      `Uses line items sum to ${fmt$(sum)} but the spreadsheet states ${fmt$(check.stated_total_uses ?? 0)} (Δ ${fmt$(check.uses_sum_vs_stated)}).`
    );
  }
  if (issues.length === 0) return null;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
      <div>
        <p className="font-semibold uppercase tracking-wide">
          Model internal inconsistency
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          {issues.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
        <p className="mt-1 text-amber-200/80">
          Correct in the source spreadsheet and re-upload — the displayed total
          uses the spreadsheet&apos;s stated value.
        </p>
      </div>
    </div>
  );
}

function BalanceBanner({
  check,
}: {
  check: UnderwritingResult["balance_check"];
}) {
  if (check.is_balanced) {
    return (
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
        <div>
          <span className="font-semibold">Balanced</span> — Sources {fmt$Short(check.total_sources)} = Uses{" "}
          {fmt$Short(check.total_uses)}{" "}
          {check.delta !== 0 && (
            <span className="text-muted">
              (Δ {fmt$Short(check.delta)} within ±{fmt$Short(check.tolerance)} tolerance)
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="mb-3 flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-400" />
      <div>
        <span className="font-semibold uppercase tracking-wide">
          Data discrepancy — Sources ≠ Uses
        </span>
        <div className="mt-1 text-red-100">
          Sources {fmt$Short(check.total_sources)} vs Uses {fmt$Short(check.total_uses)} (Δ{" "}
          {fmt$Short(check.delta)} = {check.delta_pct.toFixed(2)}% of larger side). Review for missing
          line items before proceeding to stress test.
        </div>
      </div>
    </div>
  );
}

function DataConfidencePanel({
  summary,
}: {
  summary: UnderwritingResult["confidence"];
}) {
  const t = summary.totals;
  const total = t.extracted + t.manual + t.estimated + t.missing;
  return (
    <FacgPanel icon={Info} title="Data Confidence">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        <ConfidenceLegendDot color="emerald" label={`Extracted ${t.extracted}`} />
        <ConfidenceLegendDot color="slate" label={`Manual ${t.manual}`} />
        <ConfidenceLegendDot color="amber" label={`Estimated ${t.estimated}`} />
        <ConfidenceLegendDot color="red" label={`Missing ${t.missing}`} />
        <span className="text-muted">· {total} fields total</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-elevated/60">
            <tr>
              <Th left>Section</Th>
              <Th>Extracted</Th>
              <Th>Manual</Th>
              <Th>Estimated</Th>
              <Th>Missing</Th>
              <Th>Coverage</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {summary.by_section.map((s, i) => {
              const filled = s.extracted + s.manual + s.estimated;
              const coveragePct = s.total > 0 ? (filled / s.total) * 100 : 0;
              return (
                <tr key={i}>
                  <Td bold>{s.section}</Td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-300">
                    {s.extracted}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-white/80">
                    {s.manual}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-amber-300">
                    {s.estimated}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-red-300">
                    {s.missing}
                  </td>
                  <Td>
                    <CoverageBar pct={coveragePct} />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Green = pulled from uploaded files · Slate = entered manually · Amber = matches default
        convention (estimated) · Red = not provided
      </p>
    </FacgPanel>
  );
}

function ConfidenceLegendDot({
  color,
  label,
}: {
  color: "emerald" | "slate" | "amber" | "red";
  label: string;
}) {
  const cls = {
    emerald: "bg-emerald-400",
    slate: "bg-slate-400",
    amber: "bg-amber-400",
    red: "bg-red-400",
  }[color];
  return (
    <span className="inline-flex items-center gap-1.5 text-white/90">
      <span className={`h-2 w-2 rounded-full ${cls}`} />
      {label}
    </span>
  );
}

function CoverageBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="ml-auto inline-flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            backgroundColor:
              clamped >= 80 ? "#34d399" : clamped >= 50 ? "#fbbf24" : "#f87171",
          }}
        />
      </div>
      <span className="text-xs tabular-nums text-white/80">{clamped.toFixed(0)}%</span>
    </div>
  );
}

function DynamicTable({
  title,
  rows,
  total,
  emptyMessage,
}: {
  title: string;
  rows: { label: string; value: string }[];
  total: { label: string; value: string };
  emptyMessage?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <div
        className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white"
        style={{ backgroundColor: `${FACG_NAVY}99` }}
      >
        {title}
      </div>
      {emptyMessage ? (
        <p className="px-3 py-3 text-xs text-muted">{emptyMessage}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-3 py-2 text-left text-white">{r.label}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-white/90">
                  {r.value}
                </td>
              </tr>
            ))}
            <tr className="bg-elevated/50 font-semibold">
              <td className="px-3 py-2 text-left text-white">{total.label}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-white">
                {total.value}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

function AmiRow({
  label,
  data,
}: {
  label: string;
  data: { subject: number; ami_80: number; ami_100: number; ami_120: number; pct_of_120: number };
}) {
  const tone = data.pct_of_120 > 100 ? "text-red-300" : data.pct_of_120 > 95 ? "text-amber-300" : "text-emerald-300";
  return (
    <tr>
      <Td bold>{label}</Td>
      <Td>{fmt$(data.subject)}</Td>
      <Td>{fmt$(data.ami_80)}</Td>
      <Td>{fmt$(data.ami_100)}</Td>
      <Td>{fmt$(data.ami_120)}</Td>
      <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${tone}`}>
        {fmtPct(data.pct_of_120, 1)}
      </td>
    </tr>
  );
}

function FlagRow({ flag }: { flag: { severity: "red" | "yellow" | "green"; metric: string; threshold: string; actual: string; message: string } }) {
  const tone =
    flag.severity === "red"
      ? "border-red-500/30 bg-red-500/5"
      : flag.severity === "yellow"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-emerald-500/30 bg-emerald-500/5";
  const Icon = flag.severity === "green" ? CheckCircle2 : AlertTriangle;
  const iconColor =
    flag.severity === "red" ? "text-red-400" : flag.severity === "yellow" ? "text-amber-400" : "text-emerald-400";
  return (
    <div className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${tone}`}>
      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-white">
          {flag.metric}
          <span className="ml-2 font-normal text-muted">
            {flag.actual} (target {flag.threshold})
          </span>
        </p>
        <p className="mt-0.5 text-sm text-white/90">{flag.message}</p>
      </div>
    </div>
  );
}

// === Step 4: Stress Test ===
function Step4StressTest({
  state,
  setStressTest,
  setQa,
  onBack,
  onNext,
}: {
  state: WizardState;
  setStressTest: (t: StressTestResult | null) => void;
  setQa: (qa: QAItem[]) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (state.stressTest || fired.current) return;
    fired.current = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/deal-tracker/stress-test", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inputs: state.inputs,
            underwriting: state.underwriting,
            comparables: state.comparables,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`);
        const result = data.stressTest as StressTestResult;
        setStressTest(result);
        // seed empty answers for each question
        setQa(result.questions.map((q) => ({ question: q, answer: "" })));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to run stress test.");
        fired.current = false;
      } finally {
        setLoading(false);
      }
    })();
  }, [state.stressTest, state.inputs, state.underwriting, state.comparables, setStressTest, setQa]);

  function updateAnswer(idx: number, ans: string) {
    setQa(state.qa.map((q, i) => (i === idx ? { ...q, answer: ans } : q)));
  }

  return (
    <div className="space-y-6">
      {loading && (
        <Card>
          <CardBody className="flex items-center gap-3 text-sm text-muted">
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
            Running stress scenarios and analyst review…
          </CardBody>
        </Card>
      )}
      {error && (
        <Card>
          <CardBody>
            <p className="text-sm text-red-400">{error}</p>
          </CardBody>
        </Card>
      )}
      {state.stressTest && (
        <>
          <FacgPanel icon={ChartArea} title="Stress Scenarios">
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-elevated/60">
                  <tr>
                    <Th left>Scenario</Th>
                    <Th>NOI</Th>
                    <Th>Cash Flow</Th>
                    <Th>DSCR</Th>
                    <Th>LTC</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {state.stressTest.scenarios.map((s, i) => (
                    <tr key={i} className={i === 0 ? "bg-accent-soft/20" : ""}>
                      <Td bold>
                        <div>
                          <div>{s.name}</div>
                          <div className="text-[10px] font-normal text-muted">{s.description}</div>
                        </div>
                      </Td>
                      <Td>{fmt$Short(s.noi)}</Td>
                      <Td>{fmt$Short(s.cash_flow)}</Td>
                      <Td>{fmtX(s.dscr)}</Td>
                      <Td>{fmtPct(s.ltc_pct, 1)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FacgPanel>

          {state.stressTest.critical.length > 0 && (
            <FacgPanel icon={AlertTriangle} title="Critical Issues">
              <ItemList items={state.stressTest.critical} tone="red" />
            </FacgPanel>
          )}
          {state.stressTest.concerns.length > 0 && (
            <FacgPanel icon={AlertTriangle} title="Concerns">
              <ItemList items={state.stressTest.concerns} tone="yellow" />
            </FacgPanel>
          )}
          {state.stressTest.observations.length > 0 && (
            <FacgPanel icon={Info} title="Observations">
              <ItemList items={state.stressTest.observations} tone="blue" />
            </FacgPanel>
          )}

          <FacgPanel icon={ClipboardList} title="HUD Underwriter Q&A">
            <p className="mb-3 text-xs text-muted">
              The top questions a HUD underwriter would ask about this deal. Your answers feed into the final package.
            </p>
            <div className="space-y-3">
              {state.qa.map((q, i) => (
                <div key={i} className="rounded-lg border border-border bg-background/40 p-3">
                  <p className="mb-2 text-sm font-medium text-white">
                    Q{i + 1}. {q.question}
                  </p>
                  <textarea
                    value={q.answer}
                    onChange={(e) => updateAnswer(i, e.target.value)}
                    placeholder="Your answer (optional)…"
                    rows={2}
                    className="w-full resize-y rounded-md border border-border bg-background px-2 py-1.5 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              ))}
            </div>
          </FacgPanel>
        </>
      )}
      <NavRow>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-white hover:border-accent/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <FacgButton onClick={onNext} disabled={!state.stressTest}>
          Proceed to Generate Deal Package <ArrowRight className="h-4 w-4" />
        </FacgButton>
      </NavRow>
    </div>
  );
}

// === Step 5: Generate ===
function Step5Generate({
  state,
  onBack,
}: {
  state: WizardState;
  onBack: () => void;
}) {
  const [excelLoading, setExcelLoading] = useState(false);
  const [pptxLoading, setPptxLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function downloadFile(
    endpoint: string,
    setLoading: (b: boolean) => void
  ) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inputs: state.inputs,
          underwriting: state.underwriting,
          comparables: state.comparables,
          stressTest: state.stressTest,
          qa: state.qa,
        }),
      });
      if (!res.ok) {
        // Try to parse JSON error
        let msg = `Generation failed (${res.status})`;
        try {
          const data = await res.json();
          if (data?.error) msg = data.error;
        } catch {
          /* not JSON */
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : "deal-package";
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
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <FacgPanel icon={Download} title="Generate Deal Package">
        <p className="mb-4 text-xs text-muted">
          All deal data from steps 1-4 will be packaged into the formats below.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <DownloadCard
            icon={FileSpreadsheet}
            title="Excel Model (.xlsx)"
            sub="Complete HUD underwriting workbook"
            cta="Download Excel"
            disabled={excelLoading}
            loading={excelLoading}
            onClick={() => downloadFile("/api/generate-excel", setExcelLoading)}
          />
          <DownloadCard
            icon={Presentation}
            title="Pitch Deck (.pptx)"
            sub="FACG branded presentation deck"
            cta="Download PPTX"
            disabled={pptxLoading}
            loading={pptxLoading}
            onClick={() => downloadFile("/api/generate-pitch-deck", setPptxLoading)}
          />
          <DownloadCard
            icon={FileTextIcon}
            title="Investor Prospectus (.pdf)"
            sub="Full institutional offering memorandum"
            cta="Download PDF"
            disabled={pdfLoading}
            loading={pdfLoading}
            onClick={() => downloadFile("/api/generate-prospectus", setPdfLoading)}
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </FacgPanel>

      <FacgPanel icon={ClipboardList} title="Deal Snapshot">
        <Grid cols={3}>
          <Stat label="Project" value={state.inputs.project_name || "—"} />
          <Stat label="Location" value={state.inputs.city_state || "—"} />
          <Stat label="HUD Program" value={state.inputs.hud_program} />
          <Stat label="Total Units" value={String(state.underwriting?.computed.total_units_used ?? 0)} />
          <Stat
            label="LTC"
            value={fmtPct(state.underwriting?.computed.ltc_pct ?? 0, 1)}
            highlight
          />
          <Stat
            label="DSCR"
            value={fmtX(state.underwriting?.computed.dscr ?? 0)}
            highlight
          />
        </Grid>
      </FacgPanel>

      <NavRow>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-white hover:border-accent/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Stress Test
        </button>
        <span className="text-xs text-muted">Wizard complete.</span>
      </NavRow>
    </div>
  );
}

function DownloadCard({
  icon: Icon,
  title,
  sub,
  cta,
  disabled,
  loading,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  cta: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: FACG_NAVY }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <h4 className="text-sm font-semibold text-white">{title}</h4>
      <p className="mt-1 text-xs leading-snug text-muted">{sub}</p>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: FACG_RED }}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" /> {cta}
          </>
        )}
      </button>
    </div>
  );
}

// === Shared UI primitives ===
function FacgChip({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md text-white" style={{ backgroundColor: FACG_NAVY }}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <h3 className="text-sm font-semibold text-white">{children}</h3>
    </div>
  );
}

function FacgPanel({
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
      <div className="flex items-center gap-2 rounded-t-xl px-5 py-3" style={{ backgroundColor: FACG_NAVY }}>
        <Icon className="h-4 w-4 text-white" />
        <h3 className="text-sm font-semibold uppercase tracking-wide text-white">{title}</h3>
      </div>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

function Collapsible({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-t-xl px-5 py-3 text-left"
        style={{ backgroundColor: FACG_NAVY }}
      >
        <Icon className="h-4 w-4 text-white" />
        <h3 className="flex-1 text-sm font-semibold uppercase tracking-wide text-white">{title}</h3>
        {open ? (
          <ChevronDown className="h-4 w-4 text-white" />
        ) : (
          <ChevronRight className="h-4 w-4 text-white" />
        )}
      </button>
      {open && <CardBody>{children}</CardBody>}
    </Card>
  );
}

function NavRow({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4">{children}</div>;
}

function FacgButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
      style={{ backgroundColor: FACG_RED }}
    >
      {children}
    </button>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  const cls =
    cols === 3
      ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      : "grid grid-cols-1 gap-4 sm:grid-cols-2";
  return <div className={cls}>{children}</div>;
}
function Spacer() {
  return <div className="hidden lg:block" aria-hidden />;
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}
const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60";

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <FieldShell label={label}>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </FieldShell>
  );
}
function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <FieldShell label={label}>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </FieldShell>
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
  options: { value: string; label: string }[];
}) {
  return (
    <FieldShell label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
function NumberField({
  label,
  value,
  onChange,
  integer,
  decimals,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  integer?: boolean;
  decimals?: number;
}) {
  return (
    <FieldShell label={label}>
      <input
        type="number"
        step={integer ? 1 : decimals ? Math.pow(10, -decimals) : "any"}
        value={value === 0 ? "" : value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? (integer ? Math.floor(n) : n) : 0);
        }}
        placeholder="0"
        className={inputClass}
      />
    </FieldShell>
  );
}
function MoneyField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <FieldShell label={label}>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
        <input
          type="number"
          step="any"
          value={value === 0 ? "" : value}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          placeholder="0"
          className={`${inputClass} pl-6`}
        />
      </div>
    </FieldShell>
  );
}
function PercentField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <FieldShell label={label}>
      <div className="relative">
        <input
          type="number"
          step="0.01"
          value={value === 0 ? "" : value}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          placeholder="0.00"
          className={`${inputClass} pr-7`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted">%</span>
      </div>
    </FieldShell>
  );
}

function LiveCalc({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-background/30 p-3 sm:grid-cols-4">
      {items.map((it, i) => (
        <div key={i}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{it.label}</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-white">{it.value}</p>
        </div>
      ))}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="rounded-lg border border-border p-3"
      style={highlight ? { borderLeft: `4px solid ${FACG_RED}`, backgroundColor: `${FACG_NAVY}22` } : undefined}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function BigMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border-l-4 px-4 py-3" style={{ borderLeftColor: FACG_RED, backgroundColor: `${FACG_NAVY}33` }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-white">{value}</p>
    </div>
  );
}

function Th({ children, left }: { children: React.ReactNode; left?: boolean }) {
  return (
    <th
      className={`whitespace-nowrap px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted ${
        left ? "text-left" : "text-right"
      }`}
    >
      {children}
    </th>
  );
}
function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
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

function Para({ label, body }: { label: string; body: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm leading-relaxed text-white/90">{body}</p>
    </div>
  );
}

function ItemList({ items, tone }: { items: string[]; tone: "red" | "yellow" | "blue" }) {
  const cls =
    tone === "red"
      ? "border-red-500/30 bg-red-500/5 text-red-200"
      : tone === "yellow"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-200"
        : "border-blue-500/30 bg-blue-500/5 text-blue-200";
  const Icon = tone === "blue" ? Info : tone === "red" ? X : AlertTriangle;
  const iconCls =
    tone === "red" ? "text-red-400" : tone === "yellow" ? "text-amber-400" : "text-blue-400";
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`}>
          <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${iconCls}`} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
