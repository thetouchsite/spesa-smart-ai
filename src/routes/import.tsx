/**
 * Import My Meal Plan — standalone flow.
 *
 * Three internal phases (upload → review → results) in a single route so
 * we never touch the existing Home / Onboarding / Results state machines.
 * Every downstream number (grocery, basket, supermarkets, savings) comes
 * from the same libs the Smart Meal Plan flow uses — we only add the
 * parser + adapter here. The imported plan itself is READ-ONLY.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Loader2,
  Lock,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { useT } from "@/lib/i18n";
import { parseImportedPlan } from "@/lib/import/parse-plan.functions";
import { importStore } from "@/lib/import/store";
import type {
  ImportedMeal,
  ImportedPlan,
} from "@/lib/import/imported-plan-schema";
import {
  buildGroceryFromImported,
  importedPlanStats,
  mergePatches,
} from "@/lib/import/to-plan";
import {
  compareSupermarkets,
  type SupermarketBasket,
} from "@/lib/price-data/supermarkets";
import {
  getPricesForShoppingList,
  comparePriceAlternatives,
  type PriceAlternative,
  type PricingResult,
} from "@/lib/price-data";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Import your meal plan — Spesa Smart" },
      {
        name: "description",
        content:
          "Already have a meal plan from a dietitian or coach? Import it and we'll build the grocery list, find the cheapest supermarket and estimate your savings — without changing a single meal.",
      },
      { property: "og:title", content: "Import your meal plan — Spesa Smart" },
      {
        property: "og:description",
        content:
          "Turn any existing meal plan into a smart shopping list. Your plan stays exactly as your dietitian designed it.",
      },
    ],
  }),
  component: ImportPage,
});

type Phase = "input" | "review" | "results";

function ImportPage() {
  const t = useT();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("input");

  return (
    <div className="mx-auto max-w-md min-h-screen bg-background px-4 pb-16 pt-6">
      <button
        type="button"
        onClick={() => (phase === "input" ? navigate({ to: "/" }) : setPhase("input"))}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-soft hover:border-primary"
      >
        <ArrowLeft className="size-3.5" strokeWidth={2.2} />
        {t("import.back")}
      </button>

      {phase === "input" && (
        <InputPhase onParsed={() => setPhase("review")} />
      )}
      {phase === "review" && (
        <ReviewPhase onGenerate={() => setPhase("results")} onBack={() => setPhase("input")} />
      )}
      {phase === "results" && <ResultsPhase onBack={() => setPhase("review")} />}
    </div>
  );
}

// ── Phase 1: Upload / Paste ─────────────────────────────────────────────
function InputPhase({ onParsed }: { onParsed: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; mime: string; dataBase64: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  const parse = useMutation({
    mutationFn: async () => {
      return parseImportedPlan({
        data: {
          text,
          file,
          language: typeof navigator !== "undefined" ? navigator.language.slice(0, 2) : "en",
        },
      });
    },
    onSuccess: (plan: ImportedPlan) => {
      importStore.setPlan(plan);
      onParsed();
    },
    onError: (e: unknown) => {
      setError(e instanceof Error ? e.message : String(e));
    },
  });

  const onFile = useCallback(async (f: File | null) => {
    setError(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      setError("Max 8 MB");
      return;
    }
    const buf = new Uint8Array(await f.arrayBuffer());
    let binary = "";
    for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
    const b64 = typeof btoa !== "undefined" ? btoa(binary) : Buffer.from(buf).toString("base64");
    setFile({ name: f.name, mime: f.type || "application/octet-stream", dataBase64: b64 });
  }, []);

  const canParse = (text.trim().length > 0 || file != null) && !parse.isPending;

  return (
    <div>
      <div className="mb-6 text-center">
        <div className="mx-auto mb-3 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <FileText className="size-6" strokeWidth={1.8} />
        </div>
        <h1 className="font-serif-display text-2xl font-extrabold tracking-tight text-foreground">
          {t("import.title")}
        </h1>
        <p className="mt-2 text-[0.9rem] leading-[1.5] text-muted-foreground">
          {t("import.sub")}
        </p>
      </div>

      <label className="mb-2 block text-[0.78rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("import.paste.label")}
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("import.paste.placeholder")}
        rows={7}
        className="w-full resize-y rounded-2xl border border-border bg-card p-3 text-sm text-foreground shadow-soft placeholder:text-muted-foreground/70 focus:border-primary focus:outline-none"
      />

      <div className="my-4 flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-wider text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-border bg-card px-4 py-6 text-center transition hover:border-primary/60">
        <Upload className="size-5 text-primary" strokeWidth={2} />
        <div className="text-left">
          <div className="text-sm font-semibold text-foreground">{t("import.upload")}</div>
          <div className="text-[0.72rem] text-muted-foreground">{t("import.uploadHint")}</div>
        </div>
        <input
          type="file"
          accept=".pdf,.docx,.doc,image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <div className="mt-2 flex items-center justify-between rounded-xl bg-primary/5 px-3 py-2 text-xs">
          <span className="truncate font-medium text-foreground">📎 {file.name}</span>
          <button
            type="button"
            onClick={() => setFile(null)}
            className="rounded-full p-1 text-muted-foreground hover:bg-card hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t("import.parseError")}
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          setError(null);
          if (!canParse) {
            setError(t("import.emptyInput"));
            return;
          }
          parse.mutate();
        }}
        disabled={!canParse}
        className="mt-6 flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-gradient-savings text-[1rem] font-bold text-primary-foreground shadow-glow disabled:opacity-50"
      >
        {parse.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("import.parsing")}
          </>
        ) : (
          <>
            {t("import.analyze")}
            <ArrowRight className="size-4" strokeWidth={2.4} />
          </>
        )}
      </button>
    </div>
  );
}

// ── Phase 2: Read-only review + gap editor + context ────────────────────
function ReviewPhase({ onGenerate, onBack }: { onGenerate: () => void; onBack: () => void }) {
  const t = useT();
  const [, setTick] = useState(0);
  useEffect(() => importStore.subscribe(() => setTick((x) => x + 1)), []);
  const { plan, patches, context } = importStore.get();
  const [editing, setEditing] = useState<{ di: number; mi: number } | null>(null);

  if (!plan) {
    onBack();
    return null;
  }

  const merged = mergePatches(plan, patches);
  const stats = importedPlanStats(merged);

  return (
    <div>
      <h1 className="font-serif-display text-2xl font-extrabold tracking-tight text-foreground">
        {t("import.review.title")}
      </h1>
      <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[0.72rem] font-semibold text-primary">
        <Lock className="size-3" strokeWidth={2.5} />
        {t("import.review.readOnly")}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {stats.days} {t("import.results.days")} · {stats.meals} {t("import.results.meals")}
      </div>

      {stats.missing > 0 && (
        <p className="mt-3 rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-800">
          ⚠ {t("import.review.missing")} ({stats.missing})
        </p>
      )}

      <div className="mt-5 space-y-4">
        {merged.days.map((d, di) => (
          <div key={di} className="rounded-2xl border border-border bg-card p-4 shadow-soft">
            <div className="mb-2 text-[0.78rem] font-bold uppercase tracking-wide text-primary">
              {d.day}
            </div>
            <div className="space-y-2.5">
              {d.meals.map((m, mi) => (
                <div key={mi} className="rounded-xl bg-background/60 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-[0.7rem] font-semibold uppercase text-muted-foreground">
                        {m.type}
                      </span>
                      <div className="text-sm font-semibold text-foreground">
                        {m.name || "—"}
                      </div>
                    </div>
                    {m.unparsed && (
                      <button
                        type="button"
                        onClick={() => setEditing({ di, mi })}
                        className="rounded-full bg-amber-500 px-3 py-1 text-[0.7rem] font-bold text-white"
                      >
                        {t("import.review.addDetails")}
                      </button>
                    )}
                  </div>
                  {m.ingredients.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                      {m.ingredients.map((i, ii) => (
                        <li key={ii}>
                          • {i.name} {i.quantity && <span className="text-foreground/70">— {i.quantity}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {m.unparsed && m.rawText && (
                    <pre className="mt-1.5 whitespace-pre-wrap rounded-lg bg-amber-50 p-2 text-[0.72rem] text-amber-900">
                      {m.rawText}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Context */}
      <div className="mt-6 rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-3 text-sm font-bold text-foreground">
          {t("import.review.context")}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <LabeledInput
            label="City"
            value={context.city}
            onChange={(v) => importStore.setContext({ city: v })}
          />
          <LabeledSelect
            label="Country"
            value={context.country}
            onChange={(v) => importStore.setContext({ country: v })}
            options={["UK", "IT", "US", "FR", "ES", "DE"]}
          />
          <LabeledSelect
            label="Household"
            value={context.household}
            onChange={(v) => importStore.setContext({ household: v })}
            options={["1", "2", "3", "4", "5", "6+"]}
          />
          <LabeledSelect
            label="Frequency"
            value={context.frequency}
            onChange={(v) => importStore.setContext({ frequency: v as "weekly" | "monthly" })}
            options={["weekly", "monthly"]}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onGenerate}
        className="mt-6 flex h-[56px] w-full items-center justify-center gap-2 rounded-full bg-gradient-savings text-[1rem] font-bold text-primary-foreground shadow-glow"
      >
        <Sparkles className="size-4" />
        {t("import.review.generate")}
      </button>

      {editing && (
        <MealEditor
          initial={merged.days[editing.di].meals[editing.mi]}
          onSave={(next) => {
            importStore.setPatch(editing.di, editing.mi, next);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm focus:border-primary focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function MealEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: ImportedMeal;
  onSave: (m: ImportedMeal) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(initial.name);
  const [raw, setRaw] = useState(
    initial.ingredients.map((i) => `${i.name} — ${i.quantity}`).join("\n") || initial.rawText,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3">
      <div className="w-full max-w-md rounded-3xl bg-card p-5 shadow-card">
        <div className="mb-3 text-sm font-bold text-foreground">
          {t("import.review.editSection")}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Meal name"
          className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          placeholder={"chicken breast — 200 g\nrice — 80 g"}
          className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground"
          >
            {t("import.review.cancel")}
          </button>
          <button
            type="button"
            onClick={() => {
              const ingredients = raw
                .split(/\n+/)
                .map((line) => {
                  const [n, q] = line.split(/[—:-]| - /).map((s) => s?.trim() ?? "");
                  return { name: n || "", quantity: q || "" };
                })
                .filter((i) => i.name);
              onSave({
                ...initial,
                name,
                ingredients,
                unparsed: false,
                rawText: "",
              });
            }}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            {t("import.review.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Phase 3: Results (grocery + basket + supermarkets + savings) ────────
function ResultsPhase({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { plan, patches, context, approvedSwaps } = importStore.get();
  const [, setTick] = useState(0);
  useEffect(() => importStore.subscribe(() => setTick((x) => x + 1)), []);

  const merged = useMemo(() => (plan ? mergePatches(plan, patches) : null), [plan, patches]);
  const household = useMemo(
    () => Math.max(1, parseInt(context.household.replace("+", ""), 10) || 4),
    [context.household],
  );

  const grocery = useMemo(() => {
    if (!merged) return [];
    const list = buildGroceryFromImported(merged, household, context.frequency);
    // Apply user-approved swaps as an OVERLAY — plan itself unchanged.
    return list.map((g) => {
      const swap = approvedSwaps[g.name];
      return swap ? { ...g, name: swap } : g;
    });
  }, [merged, household, context.frequency, approvedSwaps]);

  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [alternatives, setAlternatives] = useState<PriceAlternative[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (grocery.length === 0) return;
    setLoading(true);
    let cancel = false;
    (async () => {
      const p = await getPricesForShoppingList(
        grocery.map((g) => ({ name: g.name, category: g.category as never, quantity: g.quantity })),
        context.city || "London",
        context.country,
      );
      if (cancel) return;
      setPricing(p);
      const altsNested = await Promise.all(
        grocery.slice(0, 12).map((g) =>
          comparePriceAlternatives(g.name, context.city || "London", context.country),
        ),
      );
      if (cancel) return;
      setAlternatives(altsNested.flat().slice(0, 6));
      setLoading(false);
    })().catch(() => setLoading(false));
    return () => {
      cancel = true;
    };
  }, [grocery, context.city, context.country]);

  const supermarkets: SupermarketBasket[] = useMemo(
    () => (pricing ? compareSupermarkets(pricing.totalCost, context.country) : []),
    [pricing, context.country],
  );
  const cheapest = supermarkets.find((s) => s.isCheapest) ?? null;

  const totalSwapSavings = useMemo(
    () =>
      alternatives
        .filter((a) => approvedSwaps[a.from])
        .reduce((s, a) => s + a.save, 0),
    [alternatives, approvedSwaps],
  );

  if (!merged) return null;

  const sym = pricing?.currency
    ? new Intl.NumberFormat(undefined, { style: "currency", currency: pricing.currency })
        .formatToParts(0)
        .find((p) => p.type === "currency")?.value ?? ""
    : "";

  return (
    <div>
      <h1 className="font-serif-display text-2xl font-extrabold tracking-tight text-foreground">
        {t("import.results.title")}
      </h1>

      {loading && (
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-primary/5 px-3 py-2 text-xs text-primary">
          <Loader2 className="size-3.5 animate-spin" />
          Calculating prices…
        </div>
      )}

      {pricing && (
        <div className="mt-4 rounded-3xl bg-gradient-hero p-5 shadow-card">
          <div className="text-[0.72rem] font-semibold uppercase tracking-wider text-muted-foreground">
            {t("import.results.basket")}
          </div>
          <div className="mt-1 font-serif-display text-4xl font-extrabold text-foreground">
            {sym}
            {pricing.totalCost.toFixed(2)}
          </div>
          {cheapest && (
            <div className="mt-2 text-xs text-muted-foreground">
              💰 {t("import.results.savings")} {sym}
              {cheapest.savingsVsMax.toFixed(2)} @ <b>{cheapest.name}</b>
            </div>
          )}
          {totalSwapSavings > 0 && (
            <div className="mt-1 text-xs text-primary">
              + {sym}
              {totalSwapSavings.toFixed(2)} from your approved swaps
            </div>
          )}
        </div>
      )}

      {/* Grocery list */}
      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {t("import.results.grocery")}
        </h2>
        <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
          {grocery.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">No items yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {grocery.map((g, i) => {
                const priced = pricing?.items.find(
                  (p) => p.name.toLowerCase() === g.name.toLowerCase(),
                );
                return (
                  <li
                    key={i}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-foreground">{g.name}</div>
                      <div className="text-[0.72rem] text-muted-foreground">
                        {g.category} · {g.quantity}
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-primary">
                      {priced && priced.estimatedCost > 0
                        ? `${sym}${priced.estimatedCost.toFixed(2)}`
                        : "—"}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Supermarket comparison */}
      {supermarkets.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            {t("import.results.comparison")}
          </h2>
          <div className="space-y-2">
            {supermarkets.slice(0, 6).map((s) => (
              <div
                key={s.id}
                className={`flex items-center justify-between rounded-2xl border p-3 shadow-soft ${
                  s.isCheapest ? "border-primary bg-primary/5" : "border-border bg-card"
                }`}
              >
                <div className="text-sm font-semibold text-foreground">
                  {s.isCheapest && "⭐ "}
                  {s.name}
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-foreground">
                    {sym}
                    {s.total.toFixed(2)}
                  </div>
                  {s.savingsVsMax > 0 && (
                    <div className="text-[0.7rem] text-primary">
                      −{sym}
                      {s.savingsVsMax.toFixed(2)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Optional savings suggestions */}
      <section className="mt-6">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          {t("import.results.suggestions.title")}
        </h2>
        <p className="mb-2 text-[0.78rem] text-muted-foreground">
          {t("import.results.suggestions.sub")}
        </p>
        {alternatives.length === 0 ? (
          <p className="rounded-xl bg-primary/5 p-3 text-xs text-muted-foreground">
            {t("import.results.suggestions.none")}
          </p>
        ) : (
          <div className="space-y-2">
            {alternatives.map((a) => {
              const approved = !!approvedSwaps[a.from];
              return (
                <div
                  key={a.from + a.to}
                  className={`rounded-2xl border p-3 shadow-soft ${
                    approved ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <div className="text-sm">
                    <span className="text-muted-foreground line-through">{a.from}</span>{" "}
                    → <span className="font-bold text-foreground">{a.to}</span>
                  </div>
                  <div className="mt-0.5 text-[0.72rem] text-primary">
                    Save ~{sym}
                    {a.save.toFixed(2)} · nutrition {a.nutritionImpact}
                  </div>
                  <div className="mt-2 flex gap-2">
                    {approved ? (
                      <button
                        type="button"
                        onClick={() => importStore.clearSwap(a.from)}
                        className="flex-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
                      >
                        {t("import.results.suggestions.keep")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => importStore.approveSwap(a.from, a.to)}
                        className="flex-1 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                      >
                        {t("import.results.suggestions.apply")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-full border border-border bg-card px-4 py-3 text-sm font-semibold text-foreground"
        >
          <ArrowLeft className="mr-1 inline size-3.5" />
          {t("import.results.back")}
        </button>
        <Link
          to="/"
          className="flex-1 rounded-full bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
