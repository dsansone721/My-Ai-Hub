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
  ArrowRight,
  ArrowLeft,
  ClipboardList,
  Layers,
  DollarSign as DollarIcon,
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
  Mail,
  MessageSquare,
  HelpCircle,
  FileText,
  Image as ImageIcon,
  Brain,
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardBody } from "@/components/Card";
import {
  DEFAULT_INPUTS,
  EMPTY_WIZARD_STATE,
  type DealInputs,
  type WizardState,
  type WizardComparables,
  type UnderwritingResult,
  type StressTestResult,
  type QAItem,
  type ExtractedSourcesUses,
  type IntakeReport,
  type IntakeAnswers,
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
  function setIntakeReport(r: IntakeReport | null) {
    setState((s) => ({ ...s, intakeReport: r }));
  }
  function setIntakeAnswers(a: IntakeAnswers) {
    setState((s) => ({ ...s, intakeAnswers: a }));
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
          setInputs={setInputs}
          onExtractedFields={setExtractedFields}
          onExtractedSourcesUses={setExtractedSourcesUses}
          onIntakeReport={setIntakeReport}
          onIntakeAnswers={setIntakeAnswers}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <Step2Comparables
          state={state}
          setInputs={setInputs}
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

// === Step 1: AI Intake Agent ===
//
// Step 1 is now a single-pass intake: the analyst dumps everything they have
// (files of any kind, the MD's email, a free-text description) and Claude
// writes a triage report — what was found, what conflicts across documents,
// and exactly what's missing. The wizard advances when every conflict has
// been confirmed and every required gap question answered.

function Step1Intake({
  state,
  setInputs,
  onExtractedFields,
  onExtractedSourcesUses,
  onIntakeReport,
  onIntakeAnswers,
  onNext,
}: {
  state: WizardState;
  setInputs: (next: DealInputs) => void;
  onExtractedFields: (keys: string[]) => void;
  onExtractedSourcesUses: (esu: ExtractedSourcesUses | null) => void;
  onIntakeReport: (r: IntakeReport | null) => void;
  onIntakeAnswers: (a: IntakeAnswers) => void;
  onNext: () => void;
}) {
  // Local state for the input zones — files don't survive navigation.
  const [files, setFiles] = useState<File[]>([]);
  const [email, setEmail] = useState("");
  const [blurb, setBlurb] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analyzeNotes, setAnalyzeNotes] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const report = state.intakeReport;
  const answers = state.intakeAnswers;

  function patchAnswer(id: string, value: string) {
    onIntakeAnswers({ ...answers, [id]: value });
  }

  function addFiles(list: FileList | File[]) {
    const arr = Array.from(list).filter((f) => f.size > 0);
    if (arr.length === 0) return;
    setFiles((prev) => [...prev, ...arr]);
  }
  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleAnalyze() {
    if (files.length === 0 && !email.trim() && !blurb.trim()) {
      setAnalyzeError("Add at least one file, an email, or a deal description.");
      return;
    }
    setAnalyzeError(null);
    setAnalyzeNotes(null);
    setAnalyzing(true);
    try {
      const fd = new FormData();
      for (const f of files) fd.append("file", f);
      if (email.trim()) fd.append("email", email.trim());
      if (blurb.trim()) fd.append("blurb", blurb.trim());

      const res = await fetch("/api/deal-tracker/intake", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.error ?? `Analysis failed (${res.status}).`);

      // Apply extracted fields directly into wizard inputs so downstream
      // steps (Step 3 deterministic compute, etc.) have the data they need.
      const extractedFields = (data.fields ?? {}) as Record<string, unknown>;
      const acceptedKeys: string[] = [];
      const next = applyFieldsToInputs(state.inputs, extractedFields, acceptedKeys);
      setInputs(next);
      if (acceptedKeys.length > 0) onExtractedFields(acceptedKeys);

      // Verbatim S&U flows untouched through to underwriting + generators.
      if (data.sources_uses !== undefined) {
        onExtractedSourcesUses(
          (data.sources_uses as ExtractedSourcesUses | null) ?? null
        );
      }

      // Persist the intake triage report and reset answers (new ids).
      onIntakeReport((data.report as IntakeReport | null) ?? null);
      onIntakeAnswers({});

      if (typeof data.notes === "string" && data.notes) setAnalyzeNotes(data.notes);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // === Gating logic: build button enables only when every conflict is
  // resolved and every required question has a non-empty answer. ===
  const requiredQs = report?.questions.filter((q) => q.required) ?? [];
  const conflicts = report?.conflicts ?? [];
  const allRequiredAnswered =
    !!report &&
    requiredQs.every((q) => (answers[q.id] ?? "").trim().length > 0) &&
    conflicts.every((c) => (answers[c.id] ?? "").trim().length > 0);

  function handleBuild() {
    if (!report) return;
    // Map analyst's choices/answers back into DealInputs where applicable.
    let next = { ...state.inputs };
    for (const c of report.conflicts) {
      const sel = answers[c.id];
      if (!sel || !c.inputs_key) continue;
      next = applyOneRawValue(next, c.inputs_key, sel);
    }
    for (const q of report.questions) {
      const ans = answers[q.id];
      if (!ans || !q.inputs_key) continue;
      next = applyOneRawValue(next, q.inputs_key, ans);
    }
    setInputs(next);
    onNext();
  }

  return (
    <div className="space-y-6">
      {/* === INTAKE INPUTS === */}
      <Card>
        <div
          className="flex items-center gap-2 rounded-t-xl px-5 py-3"
          style={{ backgroundColor: FACG_NAVY }}
        >
          <Brain className="h-4 w-4 text-white" />
          <h3 className="flex-1 text-sm font-semibold uppercase tracking-wide text-white">
            AI Intake Agent
          </h3>
          <span className="hidden sm:inline text-[10px] font-medium uppercase tracking-[0.15em] text-white/60">
            Step 1
          </span>
        </div>
        <CardBody className="space-y-5">
          <p className="text-xs text-muted">
            Drop everything you have — broker package, term sheet, MD email, your
            own scribbles. The intake agent reads it all in one pass, flags
            conflicts across documents, and tells you exactly what&apos;s still
            missing before underwriting can start.
          </p>

          {/* Multi-file dropzone */}
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
              Documents (any number)
            </p>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files.length > 0)
                  addFiles(e.dataTransfer.files);
              }}
              className={`rounded-xl border-2 border-dashed px-6 py-7 text-center transition-colors ${
                dragActive
                  ? "border-accent bg-accent-soft/20"
                  : "border-border bg-background/40"
              }`}
            >
              <Upload className="mx-auto h-6 w-6 text-muted" />
              <p className="mt-2 text-sm text-white">
                Drag &amp; drop PDFs, Excel, Word, PowerPoint, or images
              </p>
              <p className="mt-1 text-xs text-muted">
                or{" "}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="font-medium text-accent underline-offset-2 hover:underline"
                  disabled={analyzing}
                >
                  browse
                </button>{" "}
                — no limit on number of files, 10 MB each, 40 MB total
              </p>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept=".pdf,.docx,.xlsx,.xls,.pptx,.csv,.txt,image/*"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  // allow re-selecting same file later
                  e.target.value = "";
                }}
                className="hidden"
                disabled={analyzing}
              />
            </div>

            {files.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-1.5 text-xs"
                  >
                    <FileIconForType file={f} />
                    <span className="flex-1 truncate text-white/90">
                      {f.name}
                    </span>
                    <span className="text-muted tabular-nums">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      disabled={analyzing}
                      className="rounded p-0.5 text-muted hover:bg-elevated hover:text-red-300"
                      title="Remove file"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Email paste */}
          <FieldShell label="Paste the email from your MD">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted" />
              <textarea
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                rows={4}
                placeholder="From: Steve Kirchner &lt;…&gt;
Subject: Whitfield 221(d)(4) — initial look
…"
                disabled={analyzing}
                className={`${inputClass} pl-9 font-mono text-[12px] leading-relaxed resize-y`}
              />
            </div>
          </FieldShell>

          {/* Free-text blurb */}
          <FieldShell label="Describe the deal in your own words">
            <div className="relative">
              <MessageSquare className="pointer-events-none absolute left-3 top-3 h-3.5 w-3.5 text-muted" />
              <textarea
                value={blurb}
                onChange={(e) => setBlurb(e.target.value)}
                rows={3}
                placeholder="212-unit garden-style workforce deal in Lakeland FL, 221(d)(4) take-out, hard costs ~$32M, sponsor has $4M into the land already…"
                disabled={analyzing}
                className={`${inputClass} pl-9 resize-y`}
              />
            </div>
          </FieldShell>

          {/* Analyze button + status */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-xs text-muted">
              All inputs are synthesized in a single Claude pass. ~30-60 seconds.
            </span>
            <FacgButton onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Analyzing
                  everything…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" /> Analyze Everything
                </>
              )}
            </FacgButton>
          </div>

          {analyzeError && <p className="text-sm text-red-400">{analyzeError}</p>}
          {analyzing && (
            <div className="flex items-center gap-2 text-xs text-muted">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" />
              Reading documents, cross-referencing across sources, flagging
              gaps…
            </div>
          )}
          {analyzeNotes && (
            <div
              className="flex items-start gap-2 rounded-lg border px-3 py-2 text-xs leading-relaxed"
              style={{
                borderColor: `${FACG_NAVY}66`,
                backgroundColor: `${FACG_NAVY}1a`,
                color: "#dde2f5",
              }}
            >
              <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span className="whitespace-pre-line">{analyzeNotes}</span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* === INTAKE REPORT === */}
      {report && (
        <>
          {/* Section A — What I Found */}
          <FacgPanel icon={CheckCircle2} title="A · What I Found">
            {report.summary && (
              <p className="mb-3 text-sm leading-relaxed text-white/85">
                {report.summary}
              </p>
            )}
            {report.found.length === 0 ? (
              <p className="text-xs text-muted">
                Nothing extractable was found in the upload. Add more sources
                and re-analyze.
              </p>
            ) : (
              <FoundTable found={report.found} />
            )}
            {report.files_processed.length > 0 && (
              <p className="mt-3 text-[11px] text-muted">
                Sources processed: {report.files_processed.join(" · ")}
              </p>
            )}
          </FacgPanel>

          {/* Section B — Conflicts (only if any) */}
          {report.conflicts.length > 0 && (
            <FacgPanel
              icon={AlertTriangle}
              title="B · Conflicts & Discrepancies"
            >
              <p className="mb-3 text-xs text-muted">
                Two sources disagree on these values. Pick the authoritative one
                — it&apos;ll feed the model.
              </p>
              <div className="space-y-3">
                {report.conflicts.map((c) => (
                  <ConflictRow
                    key={c.id}
                    conflict={c}
                    selected={answers[c.id] ?? ""}
                    onSelect={(v) => patchAnswer(c.id, v)}
                  />
                ))}
              </div>
            </FacgPanel>
          )}

          {/* Section C — Gap Questions (only if any) */}
          {report.questions.length > 0 && (
            <FacgPanel
              icon={HelpCircle}
              title="C · Questions Before I Proceed"
            >
              <p className="mb-3 text-xs text-muted">
                Required questions are marked with a red dot. Optional
                questions are answered when you can — they&apos;ll sharpen the
                downstream analysis.
              </p>
              <div className="space-y-3">
                {report.questions.map((q, i) => (
                  <QuestionRow
                    key={q.id}
                    index={i + 1}
                    question={q}
                    answer={answers[q.id] ?? ""}
                    onAnswer={(v) => patchAnswer(q.id, v)}
                  />
                ))}
              </div>
            </FacgPanel>
          )}

          {/* Build button */}
          <NavRow>
            <span className="text-xs text-muted">
              {report.conflicts.length === 0 && requiredQs.length === 0
                ? "No gaps — ready to build."
                : !allRequiredAnswered
                  ? "Resolve conflicts and answer required questions to proceed."
                  : "All clear."}
            </span>
            <FacgButton onClick={handleBuild} disabled={!allRequiredAnswered}>
              All questions answered — Build the Deal{" "}
              <ArrowRight className="h-4 w-4" />
            </FacgButton>
          </NavRow>
        </>
      )}
    </div>
  );
}

// =============================================================
// Intake report sub-components
// =============================================================

function FileIconForType({ file }: { file: File }) {
  const t = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();
  let Icon = FileText;
  if (t.startsWith("image/")) Icon = ImageIcon;
  else if (t.includes("spreadsheet") || /\.(xlsx?|csv)$/.test(name))
    Icon = FileSpreadsheet;
  else if (t.includes("presentation") || name.endsWith(".pptx"))
    Icon = Presentation;
  return <Icon className="h-3.5 w-3.5 flex-shrink-0 text-accent" />;
}

const CONFIDENCE_STYLES: Record<
  "HIGH" | "MEDIUM" | "LOW",
  { dot: string; chip: string; label: string }
> = {
  HIGH: {
    dot: "bg-emerald-400",
    chip: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    label: "HIGH",
  },
  MEDIUM: {
    dot: "bg-amber-400",
    chip: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    label: "MEDIUM",
  },
  LOW: {
    dot: "bg-red-400",
    chip: "border-red-500/30 bg-red-500/10 text-red-200",
    label: "LOW",
  },
};

function FoundTable({ found }: { found: IntakeReport["found"] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-elevated/60">
          <tr>
            <Th left>Field</Th>
            <Th left>Value</Th>
            <Th left>Source</Th>
            <Th left>Confidence</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {found.map((f, i) => {
            const s = CONFIDENCE_STYLES[f.confidence];
            return (
              <tr key={i}>
                <td className="px-3 py-2 align-top text-left">
                  <div className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${s.dot}`}
                    />
                    <span className="font-medium text-white">{f.label}</span>
                  </div>
                </td>
                <td className="px-3 py-2 align-top tabular-nums text-white/90">
                  {f.value}
                </td>
                <td className="px-3 py-2 align-top text-xs text-white/70">
                  {f.source}
                </td>
                <td className="px-3 py-2 align-top">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.chip}`}
                  >
                    {s.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ConflictRow({
  conflict,
  selected,
  onSelect,
}: {
  conflict: IntakeReport["conflicts"][number];
  selected: string;
  onSelect: (v: string) => void;
}) {
  const resolved = selected.length > 0;
  return (
    <div
      className={`rounded-lg border px-3 py-3 ${
        resolved
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5"
      }`}
    >
      <div className="flex items-start gap-2">
        {resolved ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{conflict.label}</p>
          {conflict.recommendation && (
            <p className="mt-0.5 text-[11px] italic text-muted">
              Suggestion: {conflict.recommendation}
            </p>
          )}
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {conflict.options.map((opt, i) => {
          const isSelected = selected === opt.value;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? "border-emerald-500 bg-emerald-500/15 text-white"
                  : "border-border bg-background/40 text-white/85 hover:border-accent/50"
              }`}
            >
              <span className="text-sm font-semibold tabular-nums">
                {opt.value}
              </span>
              <span className="text-[10px] text-muted">{opt.source}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function QuestionRow({
  index,
  question,
  answer,
  onAnswer,
}: {
  index: number;
  question: IntakeReport["questions"][number];
  answer: string;
  onAnswer: (v: string) => void;
}) {
  const answered = answer.trim().length > 0;
  const isRequired = question.required;
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="flex items-start gap-3">
        <span
          className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ backgroundColor: FACG_NAVY }}
        >
          {index}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium leading-snug text-white">
              {question.question}
            </p>
            {isRequired && (
              <span className="inline-flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-200">
                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                Required
              </span>
            )}
            {answered && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            )}
          </div>
          {question.why && (
            <p className="mt-0.5 text-[11px] italic text-muted">
              Why it matters: {question.why}
            </p>
          )}
          <input
            type="text"
            value={answer}
            onChange={(e) => onAnswer(e.target.value)}
            placeholder={isRequired ? "Required answer…" : "Optional answer…"}
            className={`mt-2 w-full rounded-md border bg-background px-2 py-1.5 text-sm text-white placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent ${
              isRequired && !answered ? "border-red-500/40" : "border-border"
            }`}
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================
// Inputs coercion: map intake-extracted values back into DealInputs
// =============================================================

function coerceForInputsKey<K extends keyof DealInputs>(
  key: K,
  raw: unknown
): DealInputs[K] | undefined {
  const def = DEFAULT_INPUTS[key];
  if (typeof def === "number") {
    const n =
      typeof raw === "number"
        ? raw
        : Number(String(raw ?? "").replace(/[$,%\s]/g, ""));
    return (Number.isFinite(n) ? n : undefined) as DealInputs[K] | undefined;
  }
  if (typeof def === "string") {
    if (typeof raw === "string") return raw.trim() as DealInputs[K];
    if (typeof raw === "number") return String(raw) as DealInputs[K];
    return undefined;
  }
  return undefined;
}

// Try to pull "City, ST" out of a free-form address. Handles common shapes:
//   "1234 Main St, Tampa, FL 33601"   → "Tampa, FL"
//   "1234 Main St, Tampa, FL"         → "Tampa, FL"
//   "Tampa, FL 33601"                 → "Tampa, FL"
//   "Tampa, FL"                       → "Tampa, FL"
// Returns "" when no two-letter state is found — we never invent one.
function deriveCityStateFromAddress(address: string): string {
  if (!address) return "";
  const trimmed = address.trim();
  // Match "<city words>, <ST>[ <zip>]" allowing 2-letter uppercase state.
  const m = trimmed.match(
    /([A-Za-z][A-Za-z\s.'-]{1,40}),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?\s*$/
  );
  if (!m) return "";
  const city = m[1].trim().replace(/\s{2,}/g, " ");
  const state = m[2];
  return `${city}, ${state}`;
}

const ASSET_TYPE_VALUES = new Set<string>([
  "Workforce Multifamily",
  "Market Rate",
  "Affordable",
  "Senior Housing",
  "Student Housing",
]);
const HUD_PROGRAM_VALUES = new Set<string>([
  "221(d)(4)",
  "223(f)",
  "231",
  "232",
  "223(a)(7)",
]);

function applyFieldsToInputs(
  current: DealInputs,
  fields: Record<string, unknown>,
  acceptedKeysOut: string[]
): DealInputs {
  const next = { ...current } as Record<string, unknown>;
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (!(k in DEFAULT_INPUTS)) continue;

    // Drop invalid enum values rather than coercing them — Step 2/3 read
    // these as typed enums and a stray string would render as a broken
    // <select>. Better to leave the existing default in place.
    if (k === "asset_type" && typeof v === "string" && !ASSET_TYPE_VALUES.has(v)) {
      continue;
    }
    if (k === "hud_program" && typeof v === "string" && !HUD_PROGRAM_VALUES.has(v)) {
      continue;
    }

    const coerced = coerceForInputsKey(k as keyof DealInputs, v);
    if (coerced === undefined) continue;
    next[k] = coerced;
    acceptedKeysOut.push(k);
  }

  // === Derivations: fill canonical keys when Claude returned a related but
  // non-canonical signal. Always run AFTER the main loop so explicit fields
  // win over derived ones. ===
  //
  // 1. city_state — if it's still blank but we have an address, parse it.
  //    Step 2 won't fire its comps API without a market location, so this
  //    rescue path cuts down on "missing city_state" gap questions.
  if (
    typeof next.city_state === "string" &&
    !next.city_state.trim() &&
    typeof next.address === "string"
  ) {
    const derived = deriveCityStateFromAddress(next.address);
    if (derived) {
      next.city_state = derived;
      acceptedKeysOut.push("city_state");
    }
  }

  // 2. total_units — if missing/zero but the unit-mix counts add up to a
  //    positive number, mirror the sum into total_units so anything that
  //    reads it directly (display, downstream prompts) has a value. The
  //    deterministic compute path already falls back to the mix-sum, but
  //    not every consumer does.
  if (typeof next.total_units === "number" && next.total_units <= 0) {
    const sum =
      (Number(next.studio_count) || 0) +
      (Number(next.one_br_count) || 0) +
      (Number(next.two_br_count) || 0) +
      (Number(next.three_br_count) || 0);
    if (sum > 0) {
      next.total_units = sum;
      acceptedKeysOut.push("total_units");
    }
  }

  return next as DealInputs;
}

function applyOneRawValue(
  current: DealInputs,
  key: keyof DealInputs,
  raw: string
): DealInputs {
  const coerced = coerceForInputsKey(key, raw);
  if (coerced === undefined) return current;
  return { ...current, [key]: coerced };
}

// === Step 2: Comparables ===
function Step2Comparables({
  state,
  setInputs,
  setComparables,
  onBack,
  onNext,
}: {
  state: WizardState;
  setInputs: (next: DealInputs) => void;
  setComparables: (c: WizardComparables | null) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fired = useRef(false);

  // city_state may be empty if the intake agent couldn't extract it AND
  // couldn't derive it from address. Rather than hard-blocking the wizard,
  // we render an inline confirm form, take the analyst's input, write it
  // to state.inputs, and THEN fire the comps API. This keeps progression
  // unblocked even when intake came up short.
  const initialLocation = state.inputs.city_state.trim();
  const [locationDraft, setLocationDraft] = useState(initialLocation);
  const [confirmedLocation, setConfirmedLocation] = useState(initialLocation);
  const needsLocation = !confirmedLocation;

  function handleConfirmLocation() {
    const v = locationDraft.trim();
    if (!v) return;
    // Persist to wizard state so downstream steps + the comps API see it.
    setInputs({ ...state.inputs, city_state: v });
    setConfirmedLocation(v);
    fired.current = false; // allow the effect below to fire on next render
  }

  useEffect(() => {
    if (needsLocation) return;
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
  }, [needsLocation, state.comparables, state.inputs, setComparables]);

  if (needsLocation) {
    return (
      <div className="space-y-6">
        <FacgPanel icon={Building2} title="Confirm Market Location">
          <p className="mb-3 text-sm text-white/85">
            The intake agent couldn&apos;t pin down the deal&apos;s market.
            Confirm the city &amp; state below before we pull comps.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <FieldShell label="City, State">
              <input
                type="text"
                value={locationDraft}
                onChange={(e) => setLocationDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirmLocation();
                }}
                placeholder="e.g. Tampa, FL"
                autoFocus
                className={inputClass}
              />
            </FieldShell>
            <FacgButton
              onClick={handleConfirmLocation}
              disabled={!locationDraft.trim()}
            >
              Confirm &amp; Pull Comps <ArrowRight className="h-4 w-4" />
            </FacgButton>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            We expect the form &quot;City, ST&quot; — for example,{" "}
            <span className="text-white/80">&quot;Sarasota, FL&quot;</span> or{" "}
            <span className="text-white/80">&quot;Phoenix, AZ&quot;</span>.
          </p>
        </FacgPanel>

        <NavRow>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-elevated px-3 py-2 text-xs text-white hover:border-accent/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Intake
          </button>
          <span className="text-xs text-muted">
            Comps run after the location is confirmed.
          </span>
        </NavRow>
      </div>
    );
  }

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
// === Step 5 audience constants ===
const PITCH_AUDIENCE_OPTIONS = [
  { id: "internal", label: "Internal FACG Review" },
  { id: "senior_debt", label: "Senior Debt Lender" },
  { id: "mezzanine", label: "Mezzanine Lender" },
  { id: "preferred_equity", label: "Preferred Equity Investor" },
  { id: "common_equity", label: "Common Equity / JV Partner" },
] as const;
type PitchAudienceId = (typeof PITCH_AUDIENCE_OPTIONS)[number]["id"];

const PROSPECTUS_OPTIONS = [
  {
    id: "senior_debt",
    label: "Senior Debt Prospectus",
    sub: "Credit-memo voice. Leads with LTC / LTV / DSCR and collateral coverage.",
  },
  {
    id: "mezzanine",
    label: "Mezzanine Prospectus",
    sub: "Subordinate-debt voice. Full debt stack, intercreditor, mezz IRR + waterfall.",
  },
  {
    id: "preferred_equity",
    label: "Preferred Equity Prospectus",
    sub: "Pref coupon, redemption timeline, distribution waterfall, downside recovery.",
  },
  {
    id: "common_equity",
    label: "Common Equity / JV Prospectus",
    sub: "Equity-pitch voice. IRR, MOIC, promote, full upside / base / downside cases.",
  },
] as const;
type ProspectusTypeId = (typeof PROSPECTUS_OPTIONS)[number]["id"];

function Step5Generate({
  state,
  onBack,
}: {
  state: WizardState;
  onBack: () => void;
}) {
  // Excel — single download
  const [excelLoading, setExcelLoading] = useState(false);

  // Pitch deck — single download driven by audience dropdown
  const [pitchAudience, setPitchAudience] =
    useState<PitchAudienceId>("internal");
  const [pitchLoading, setPitchLoading] = useState(false);

  // Prospectus — 4 checkboxes, parallel downloads
  const [prospectusSel, setProspectusSel] = useState<
    Record<ProspectusTypeId, boolean>
  >({
    senior_debt: false,
    mezzanine: false,
    preferred_equity: false,
    common_equity: false,
  });
  const [prospectusLoading, setProspectusLoading] = useState<
    Record<ProspectusTypeId, boolean>
  >({
    senior_debt: false,
    mezzanine: false,
    preferred_equity: false,
    common_equity: false,
  });
  const anyProspectusLoading =
    Object.values(prospectusLoading).some(Boolean);
  const selectedProspectusCount =
    Object.values(prospectusSel).filter(Boolean).length;

  const [error, setError] = useState<string | null>(null);

  // Common payload reused by every download endpoint.
  const commonBody = {
    inputs: state.inputs,
    underwriting: state.underwriting,
    comparables: state.comparables,
    stressTest: state.stressTest,
    qa: state.qa,
  };

  async function downloadFromEndpoint(
    endpoint: string,
    body: unknown,
    fallbackName: string
  ): Promise<void> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
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
    const filename = match ? match[1] : fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadExcel() {
    setError(null);
    setExcelLoading(true);
    try {
      await downloadFromEndpoint(
        "/api/generate-excel",
        commonBody,
        "FACG_Model.xlsx"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setExcelLoading(false);
    }
  }

  async function downloadPitchDeck() {
    setError(null);
    setPitchLoading(true);
    try {
      await downloadFromEndpoint(
        "/api/generate-pitch-deck",
        { ...commonBody, audience: pitchAudience },
        "FACG_Pitch_Deck.pptx"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setPitchLoading(false);
    }
  }

  async function generateSelectedProspectuses() {
    const selected = (
      Object.keys(prospectusSel) as ProspectusTypeId[]
    ).filter((id) => prospectusSel[id]);
    if (selected.length === 0) return;

    setError(null);
    // Mark every selected one as loading up-front so the UI reflects the
    // full batch, then fire them in parallel — each spawns its own
    // browser-level download as soon as its blob lands.
    setProspectusLoading((prev) => {
      const next = { ...prev };
      for (const id of selected) next[id] = true;
      return next;
    });

    const errors: string[] = [];
    await Promise.all(
      selected.map(async (id) => {
        try {
          await downloadFromEndpoint(
            "/api/generate-prospectus",
            { ...commonBody, prospectus_type: id },
            `FACG_${id}_Prospectus.pdf`
          );
        } catch (err) {
          const label =
            PROSPECTUS_OPTIONS.find((o) => o.id === id)?.label ?? id;
          errors.push(
            `${label}: ${err instanceof Error ? err.message : "failed"}`
          );
        } finally {
          setProspectusLoading((prev) => ({ ...prev, [id]: false }));
        }
      })
    );

    if (errors.length > 0) {
      setError(errors.join(" · "));
    }
  }

  function toggleProspectus(id: ProspectusTypeId) {
    setProspectusSel((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-6">
      <FacgPanel icon={Download} title="Generate Deal Package">
        <p className="mb-4 text-xs text-muted">
          All deal data from steps 1-4 will be packaged into the formats below.
          Pitch decks and prospectuses can be tailored per audience — each
          audience uses a different writing voice and emphasis.
        </p>

        {/* Row 1 — Excel + Pitch Deck */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <DownloadCard
            icon={FileSpreadsheet}
            title="Excel Model (.xlsx)"
            sub="Complete HUD underwriting workbook"
            cta="Download Excel"
            disabled={excelLoading}
            loading={excelLoading}
            onClick={downloadExcel}
          />

          <PitchDeckCard
            audience={pitchAudience}
            onChangeAudience={setPitchAudience}
            loading={pitchLoading}
            onDownload={downloadPitchDeck}
          />
        </div>

        {/* Row 2 — Prospectus multi-select */}
        <div className="mt-3">
          <ProspectusSelectorCard
            selections={prospectusSel}
            loading={prospectusLoading}
            onToggle={toggleProspectus}
            onGenerate={generateSelectedProspectuses}
            selectedCount={selectedProspectusCount}
            anyLoading={anyProspectusLoading}
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

// Pitch deck card with audience dropdown above the download button.
function PitchDeckCard({
  audience,
  onChangeAudience,
  loading,
  onDownload,
}: {
  audience: PitchAudienceId;
  onChangeAudience: (a: PitchAudienceId) => void;
  loading: boolean;
  onDownload: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg text-white"
        style={{ backgroundColor: FACG_NAVY }}
      >
        <Presentation className="h-4 w-4" />
      </div>
      <h4 className="text-sm font-semibold text-white">Pitch Deck (.pptx)</h4>
      <p className="mt-1 text-xs leading-snug text-muted">
        FACG-branded presentation deck. Audience tag is stamped on the cover
        and embedded in the file name.
      </p>

      <label className="mt-3 block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted">
          Audience
        </span>
        <select
          value={audience}
          onChange={(e) => onChangeAudience(e.target.value as PitchAudienceId)}
          disabled={loading}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-white focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        >
          {PITCH_AUDIENCE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={onDownload}
        disabled={loading}
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        style={{ backgroundColor: FACG_RED }}
      >
        {loading ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
          </>
        ) : (
          <>
            <Download className="h-3.5 w-3.5" /> Download PPTX
          </>
        )}
      </button>
    </div>
  );
}

// Multi-select prospectus card. Each checkbox spawns its own download in
// parallel when "Generate Selected Outputs" is clicked.
function ProspectusSelectorCard({
  selections,
  loading,
  onToggle,
  onGenerate,
  selectedCount,
  anyLoading,
}: {
  selections: Record<ProspectusTypeId, boolean>;
  loading: Record<ProspectusTypeId, boolean>;
  onToggle: (id: ProspectusTypeId) => void;
  onGenerate: () => void;
  selectedCount: number;
  anyLoading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="mb-3 flex items-start gap-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: FACG_NAVY }}
        >
          <FileTextIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-white">
            Investor Prospectus (.pdf)
          </h4>
          <p className="mt-1 text-xs leading-snug text-muted">
            Pick one or more audiences. Each checked box generates a separate
            audience-specific PDF in parallel — different system prompt, voice,
            and emphasis per type.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {PROSPECTUS_OPTIONS.map((opt) => {
          const checked = selections[opt.id];
          const itemLoading = loading[opt.id];
          return (
            <li key={opt.id}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                  checked
                    ? "border-accent/50 bg-accent-soft/10"
                    : "border-border bg-background/60 hover:border-accent/30"
                } ${itemLoading ? "opacity-70" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(opt.id)}
                  disabled={anyLoading}
                  className="mt-1 h-3.5 w-3.5 flex-shrink-0 rounded border-border bg-background text-accent focus:ring-accent disabled:cursor-not-allowed"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {opt.label}
                    </span>
                    {itemLoading && (
                      <Loader2 className="h-3 w-3 animate-spin text-accent" />
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted">
                    {opt.sub}
                  </p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] text-muted">
          {selectedCount === 0
            ? "Select at least one audience to proceed."
            : `${selectedCount} audience${selectedCount === 1 ? "" : "s"} selected — each will download as a separate PDF.`}
        </span>
        <button
          type="button"
          onClick={onGenerate}
          disabled={selectedCount === 0 || anyLoading}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: FACG_RED }}
        >
          {anyLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" /> Generate Selected Outputs
            </>
          )}
        </button>
      </div>
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
