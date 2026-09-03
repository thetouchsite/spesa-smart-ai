import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  comparePriceAlternatives,
  type PricingResult,
  type PriceAlternative,
} from "@/lib/price-data";
import { pricePlan } from "@/lib/price-data/price-engine";
import type { SupermarketBasket } from "@/lib/price-data/supermarkets";
import { generateMealPlanWithAI } from "@/lib/ai/meal-ai";
import { generateMealPlan } from "@/lib/meal-engine";
import { computeResults, type ComputedResults } from "@/lib/results/compute-results";
import { getPlanStore, type SavedPlan } from "@/lib/storage";
import { useSession } from "@/lib/state/session";
import type { UserProfile } from "@/lib/models";
import type { Plan } from "@/lib/models/plan-schema";
import { friendlyMessage } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  PiggyBank, MapPin, Users, Wallet, Salad, Sparkles, ArrowLeft, Check,
  AlertTriangle, ShoppingBasket, Loader2, ShoppingCart, TrendingDown, Receipt,
  BarChart3, Package, Leaf, Coins, ChefHat, Gauge, CalendarRange, ArrowRight,
  Bookmark, RefreshCw, Replace, Recycle, Store, Lightbulb, Trash2, FolderOpen, CalendarOff,
  ExternalLink, FileDown, Share2, ChevronDown, Trophy, Clock, Flame, Utensils,
} from "lucide-react";
import { unsplashFoodImage } from "@/lib/recipes/unsplash";
import { exportPlanToPdf } from "@/lib/export/pdf-export";
import { buildWhatsAppUrl } from "@/lib/export/whatsapp-share";
import {
  buildShoppingLink,
  buildBasketUrl,
  defaultRetailerFor,
  retailersForCountry,
  RETAILERS,
} from "@/lib/shopping-links";
import { googleShoppingUrl, amazonSearchUrl } from "@/lib/shopping-links/external";
import {
  buildBuyOptions,
  buildBasketProviders,
  cheapestOption,
  fastestDeliveryOption,
  type BuyOnlineResult,
} from "@/lib/buy-online";
import { searchProducts, type SearchOutput, type ItemResults, type ProductSource } from "@/lib/product-search";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useI18n, useT, LanguageSelector } from "@/lib/i18n";
import { getRecipe, type Recipe } from "@/lib/recipes";
import { pickAlternativeMeal, swapMealSlot } from "@/lib/ai/meal-ai";
import { detectLocation, type ResolvedLocation } from "@/lib/location/geolocate";
import { searchCities, searchNearbyStores, type CityResult, type NearbyStore } from "@/lib/location";
import { saveResolvedLocation, loadResolvedLocation } from "@/lib/location/store";
import { deliveryProvidersFor } from "@/lib/location/delivery-availability";
import { resolveCountry } from "@/lib/country";

const STEP_VALUES = ["welcome", "location", "household", "budget", "style", "allergies", "extras", "processing", "results", "low"] as const;
type Step = typeof STEP_VALUES[number];

function isStep(value: unknown): value is Step {
  return typeof value === "string" && STEP_VALUES.includes(value as Step);
}

function IndexErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error("[index route] render error", error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Please try again. If it keeps happening, reset your session.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => reset()}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Try again
          </button>
          <button
            onClick={() => {
              try {
                useSession.getState().resetProfile();
                if (typeof localStorage !== "undefined") localStorage.removeItem("spesa.session.v1");
              } catch { /* ignore */ }
              if (typeof window !== "undefined") window.location.href = "/";
            }}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Reset & start over
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): { step?: Step } => ({
    step: isStep(search.step) ? search.step : undefined,
  }),
  head: () => ({
    meta: [
      { title: "MealMint — Eat well. Save more." },
      { name: "description", content: "MealMint helps families save money on groceries while eating well. Personalized meal plans, local best prices and smart shopping lists — designed for real households." },
      { name: "theme-color", content: "#0F7A54" },
      { property: "og:title", content: "MealMint — Eat well. Save more." },
      { property: "og:description", content: "Helping families save money on groceries while eating well." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SpesaSmart,
  errorComponent: IndexErrorComponent,
});

/**
 * Currency-symbol lookup — Intl-derived only. No hardcoded symbol tables.
 * Kept as a Proxy so `CURRENCIES[code]` still works at every existing call
 * site; the actual glyph comes from Intl.NumberFormat.formatToParts, which
 * knows every ISO-4217 currency including AED, JPY, INR, BRL, ZAR, …
 */
const CURRENCIES: Record<string, string> = new Proxy({} as Record<string, string>, {
  get(_t, code: string) {
    if (typeof code !== "string" || !code) return "";
    try {
      const parts = new Intl.NumberFormat(undefined, { style: "currency", currency: code })
        .formatToParts(0);
      return parts.find((p) => p.type === "currency")?.value ?? code;
    } catch {
      return code;
    }
  },
});
const STYLES = ["Family Budget", "Mediterranean", "Low Carb", "Japanese Inspired", "Healthy Lifestyle"] as const;
const ALLERGIES = ["Gluten Free", "Lactose Free", "Vegetarian", "Vegan"] as const;

const EMERGENCY_PLAN: Plan = {
  budgetAnalysis: "A safe fallback plan was created so you can continue shopping and cooking.",
  estimatedCost: 0,
  safetyMargin: 0,
  status: "optimized",
  recommendedBudget: null,
  minimumBudget: null,
  mealPlan: [
    { day: "Monday", breakfast: "Oats with fruit", lunch: "Lentil soup", dinner: "Tomato pasta" },
    { day: "Tuesday", breakfast: "Scrambled eggs & toast", lunch: "Bean wrap", dinner: "Vegetable rice bowl" },
    { day: "Wednesday", breakfast: "Yogurt & granola", lunch: "Tuna pasta salad", dinner: "Chickpea curry" },
    { day: "Thursday", breakfast: "Toast with eggs", lunch: "Leftover curry", dinner: "Family pasta bake" },
    { day: "Friday", breakfast: "Oats with banana", lunch: "Lentil soup", dinner: "Egg fried rice" },
    { day: "Saturday", breakfast: "Yogurt & fruit", lunch: "Bean & cheese wrap", dinner: "Homemade pizza" },
    { day: "Sunday", breakfast: "Scrambled eggs & toast", lunch: "Tomato pasta", dinner: "Vegetable stew" },
  ],
  groceryList: [
    { name: "Eggs", quantity: "12", estimatedCost: 0, category: "Proteins" },
    { name: "Lentils", quantity: "500 g", estimatedCost: 0, category: "Proteins" },
    { name: "Chickpeas", quantity: "3 cans", estimatedCost: 0, category: "Proteins" },
    { name: "Tuna", quantity: "2 cans", estimatedCost: 0, category: "Proteins" },
    { name: "Tomatoes", quantity: "1.5 kg", estimatedCost: 0, category: "Vegetables" },
    { name: "Onions", quantity: "1 kg", estimatedCost: 0, category: "Vegetables" },
    { name: "Mixed vegetables", quantity: "1.5 kg", estimatedCost: 0, category: "Vegetables" },
    { name: "Oats", quantity: "1 kg", estimatedCost: 0, category: "Carbohydrates" },
    { name: "Pasta", quantity: "1 kg", estimatedCost: 0, category: "Carbohydrates" },
    { name: "Rice", quantity: "1 kg", estimatedCost: 0, category: "Carbohydrates" },
    { name: "Bread", quantity: "2 loaves", estimatedCost: 0, category: "Carbohydrates" },
    { name: "Olive oil", quantity: "500 ml", estimatedCost: 0, category: "Healthy Fats" },
  ],
  savingTips: [
    "Reuse lentils, beans, eggs and pasta across multiple meals.",
    "Cook once and keep leftovers for lunches.",
    "Use shelf-stable staples if live recipe or price providers are unavailable.",
  ],
};

// Lightweight city → country guess so the Price Engine + Supermarket
// comparison get a sensible country without an extra onboarding step.
// IMPORTANT: values must match `COUNTRY_BY_NAME` keys in the manual price
// DB (full country names, not ISO codes), otherwise the resolver falls
// through to region/global tier and pulls out-of-market data.
const CITY_COUNTRY: Record<string, string> = {
  // UK
  london: "UK", manchester: "UK", birmingham: "UK", liverpool: "UK",
  leeds: "UK", glasgow: "UK", edinburgh: "UK", bristol: "UK",
  sheffield: "UK", cardiff: "UK", belfast: "UK", newcastle: "UK",
  // Italy
  rome: "Italy", milan: "Italy", naples: "Italy", turin: "Italy",
  palermo: "Italy", genoa: "Italy", bologna: "Italy", florence: "Italy",
  venice: "Italy", verona: "Italy", bari: "Italy", catania: "Italy",
  messina: "Italy", padua: "Italy", trieste: "Italy", parma: "Italy",
  modena: "Italy", "reggio emilia": "Italy", perugia: "Italy",
  salerno: "Italy", brescia: "Italy", taranto: "Italy",
  // Germany
  berlin: "Germany", munich: "Germany", hamburg: "Germany", cologne: "Germany",
  frankfurt: "Germany", stuttgart: "Germany", dusseldorf: "Germany",
  leipzig: "Germany", dresden: "Germany", hannover: "Germany",
  // Spain
  madrid: "Spain", barcelona: "Spain", valencia: "Spain", seville: "Spain",
  zaragoza: "Spain", malaga: "Spain", bilbao: "Spain",
  // France
  paris: "France", lyon: "France", marseille: "France", toulouse: "France",
  nice: "France", nantes: "France", bordeaux: "France", lille: "France",
  // UAE
  dubai: "UAE", "abu dhabi": "UAE", sharjah: "UAE",
  // USA
  "new york": "USA", chicago: "USA", "los angeles": "USA", houston: "USA",
  miami: "USA", boston: "USA", "san francisco": "USA", seattle: "USA",
  philadelphia: "USA", "washington": "USA", atlanta: "USA", denver: "USA",
};

function guessCountry(city: string | undefined | null): string {
  return CITY_COUNTRY[(city ?? "").trim().toLowerCase()] ?? "UK";
}

function SpesaSmart() {
  const navigate = useNavigate({ from: "/" });
  const { step: routeStep } = Route.useSearch();
  const { language } = useI18n();
  const t = useT();
  const profile = useSession((s) => s.profile);
  const currentPlan = useSession((s) => s.currentPlan);
  const variantSeed = useSession((s) => s.variantSeed);
  const status = useSession((s) => s.status);
  const error = useSession((s) => s.error);
  const updateProfile = useSession((s) => s.updateProfile);
  const setPlan = useSession((s) => s.setPlan);
  const setStatus = useSession((s) => s.setStatus);
  const bumpSeed = useSession((s) => s.bumpSeed);
  const resetProfile = useSession((s) => s.resetProfile);

  const [step, setLocalStep] = useState<Step>(currentPlan ? "results" : routeStep ?? "welcome");
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [gpsState, setGpsState] = useState<"idle" | "loading" | "denied" | "unavailable">("idle");
  const generationRef = useRef(0);
  const isSubmittingRef = useRef(false);
  const locationRequestRef = useRef(false);
  const gpsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setStep = (next: Step | ((current: Step) => Step)) => {
    const resolvedStep = typeof next === "function" ? next(step) : next;
    setLocalStep(resolvedStep);
    void navigate({
      to: "/",
      search: resolvedStep === "welcome" ? {} : { step: resolvedStep },
      replace: true,
    });
  };

  useEffect(() => {
    if (!routeStep || routeStep === step) return;
    // Guard URL-driven jumps: if the requested onboarding step's prerequisites
    // are missing (e.g. deep-link to ?step=style without a budget set), rewind
    // to the first incomplete step instead of letting empty fields through.
    const required: Partial<Record<Step, () => boolean>> = {
      location: () => !!profile.city,
      household: () => !!profile.household,
      budget: () => Number(profile.budget) > 0,
      style: () => !!profile.style,
    };
    const order: Step[] = ["welcome", "location", "household", "budget", "style", "allergies", "extras"];
    const targetIdx = order.indexOf(routeStep);
    if (targetIdx > 0) {
      for (let i = 0; i < targetIdx; i++) {
        const check = required[order[i]];
        if (check && !check()) {
          setLocalStep(order[i]);
          void navigate({ to: "/", search: { step: order[i] }, replace: true });
          return;
        }
      }
    }
    setLocalStep(routeStep);
  }, [routeStep, step, profile.city, profile.household, profile.budget, profile.style, navigate]);

  useEffect(() => {
    void getPlanStore().list().then(setSavedPlans).catch(() => setSavedPlans([]));
  }, [step]);

  const update = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    updateProfile({ [k]: v } as Partial<UserProfile>);

  const focusManualCitySearch = () => {
    const el = document.querySelector<HTMLInputElement>('input[placeholder]');
    el?.focus();
  };

  function clearGpsTimeout() {
    if (gpsTimeoutRef.current) {
      clearTimeout(gpsTimeoutRef.current);
      gpsTimeoutRef.current = null;
    }
  }

  function requestBrowserLocation() {
    if (locationRequestRef.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsState("unavailable");
      focusManualCitySearch();
      return;
    }
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setGpsState("unavailable");
      focusManualCitySearch();
      return;
    }
    locationRequestRef.current = true;
    setGpsState("loading");

    // Hard safety timeout — iOS Safari can silently drop the request when
    // permission was previously denied at the system or site level and never
    // fire either callback. After 12s, force the fallback path.
    clearGpsTimeout();
    gpsTimeoutRef.current = setTimeout(() => {
      if (!locationRequestRef.current) return;
      locationRequestRef.current = false;
      setGpsState("unavailable");
      focusManualCitySearch();
    }, 12000);

    // NOTE: do not await anything before getCurrentPosition — must stay in user-gesture chain (iOS Safari).
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearGpsTimeout();
        const { latitude: lat, longitude: lon } = pos.coords;
        (async () => {
          try {
            const { reverseGeocode } = await import("@/lib/location");
            const { resolveCountry } = await import("@/lib/country");
            const rev = await reverseGeocode({ lat, lon });
            const ccRaw = (rev?.countryCode ?? "").toUpperCase();
            const profile = resolveCountry(ccRaw);
            const loc: ResolvedLocation = {
              lat, lon,
              city: rev?.city ?? "",
              country: profile?.name ?? rev?.country ?? "",
              countryCode: profile?.code ?? ccRaw,
              region: rev?.region,
              postcode: rev?.postcode,
              currency: profile?.currency ?? "",
              source: "gps",
            };
            updateProfile({
              city: loc.city,
              country: loc.country,
              currency: loc.currency as UserProfile["currency"],
            });
            saveResolvedLocation(loc);
            setGpsState("idle");
            locationRequestRef.current = false;
            toast.success(`${t("location.located")}: ${loc.city || `${lat.toFixed(2)}, ${lon.toFixed(2)}`}, ${loc.country}`);
            setStep("household");
          } catch {
            locationRequestRef.current = false;
            setGpsState("unavailable");
            focusManualCitySearch();
          }
        })();
      },
      (err) => {
        clearGpsTimeout();
        locationRequestRef.current = false;
        if (err.code === err.PERMISSION_DENIED) {
          setGpsState("denied");
        } else {
          setGpsState("unavailable");
        }
        focusManualCitySearch();
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300_000 },
    );
  }

  useEffect(() => {
    return () => clearGpsTimeout();
  }, []);


  async function submit(seed = variantSeed, quantityScale = 1) {
    // Supersede any in-flight generation instead of blocking — the user
    // explicitly asked for "Cancel every pending request before starting
    // a new generation." Bumping generationRef invalidates every stale
    // setPlan/setStatus from prior runs (they early-return below).
    const generationId = generationRef.current + 1;
    generationRef.current = generationId;
    isSubmittingRef.current = true;
    setStep("processing");
    setStatus("generating");
    try {
      const enrichedProfile: UserProfile = {
        ...profile,
        household: profile.household || "4",
        country: profile.country || guessCountry(profile.city),
      };
      updateProfile({
        household: enrichedProfile.household,
        country: enrichedProfile.country,
      });
      const plan = await generateMealPlanWithAI(enrichedProfile, seed, { quantityScale, language });
      if (generationRef.current !== generationId) return;
      setPlan(plan);
      setStatus("ready");
      setStep("results");
    } catch (err) {
      if (generationRef.current !== generationId) return;
      const msg = friendlyMessage(err);
      setStatus("error", msg);
      toast.error(msg);
      try {
        const safePlan = generateMealPlan({
          profile: {
            ...profile,
            household: profile.household || "4",
            country: profile.country || guessCountry(profile.city),
          },
          seed,
          quantityScale,
        }).plan;
        if (generationRef.current !== generationId) return;
        setPlan(safePlan);
        setStatus("ready");
        setStep("results");
      } catch {
        if (generationRef.current !== generationId) return;
        if (currentPlan) {
          setStatus("ready");
          setStep("results");
        } else {
          setPlan(EMERGENCY_PLAN);
          setStatus("ready");
          setStep("results");
        }
      }
    } finally {
      if (generationRef.current === generationId) {
        isSubmittingRef.current = false;
      }
    }
  }

  function regenerate() {
    const next = bumpSeed();
    void submit(next);
  }

  async function handleSave(results: ComputedResults) {
    if (!currentPlan) return;
    try {
      const budget = Number(profile.budget) || 0;
      const record = await getPlanStore().save({
        label: `${profile.city || "My"} · ${CURRENCIES[profile.currency]}${budget} ${profile.frequency}`,
        form: {
          city: profile.city,
          country: profile.country,
          household: profile.household,
          budget: profile.budget,
          currency: profile.currency,
          frequency: profile.frequency,
          style: profile.style,
          allergies: profile.allergies,
          dislikes: profile.dislikes,
          zeroSpendDay: profile.zeroSpendDay,
        },
        plan: currentPlan,
        estimatedSpend: results.savingsAvailable ? results.estimatedSpend : 0,
        savings: results.savingsAvailable ? results.savings : 0,
        score: results.savingsAvailable ? results.score.total : 0,
      });
      setSavedPlans(await getPlanStore().list());
      toast.success(t("toast.planSaved"), { description: t("toast.savedAs", { label: record.label }) });
    } catch (err) {
      toast.error(friendlyMessage(err));
    }
  }

  async function openSaved(id: string) {
    try {
      const s = await getPlanStore().get(id);
      if (!s) return;
      updateProfile({
        city: s.form.city,
        country: s.form.country || guessCountry(s.form.city),
        household: s.form.household,
        budget: s.form.budget,
        currency: s.form.currency,
        frequency: s.form.frequency,
        style: s.form.style,
        allergies: s.form.allergies,
        dislikes: s.form.dislikes,
        zeroSpendDay: s.form.zeroSpendDay,
      });
      setPlan(s.plan);
      setStep("results");
    } catch (err) {
      toast.error(friendlyMessage(err));
    }
  }

  async function removeSaved(id: string) {
    await getPlanStore().delete(id);
    setSavedPlans(await getPlanStore().list());
    toast(t("toast.planRemoved"));
  }

  function startOver() {
    // Invalidate every in-flight generation so a stale resolve can't
    // overwrite the fresh blank session, and clear submit lock.
    generationRef.current += 1;
    isSubmittingRef.current = false;
    // Clear in-memory price-cache so the new plan re-fetches against the
    // new city/country instead of serving the previous run's payload.
    void import("@/lib/price-data/price-cache").then((m) => m.cacheClear()).catch(() => undefined);
    setStatus("idle");
    setPlan(null);
    resetProfile();
    setStep("welcome");
  }

  // Dev-only instrumentation. The console.log is no-op in production.
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[onboarding] step =", step, "| hasPlan =", !!currentPlan);
    }
  }, [step, currentPlan]);


  const isOnboardingStarted = step !== "welcome";

  return (
    <div className="min-h-screen bg-gradient-soft">
      <Toaster position="top-center" />
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
        <Header step={step} onBack={() => setStep(prevStep(step))} />


        {error && status === "error" && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-foreground">
            <AlertTriangle className="size-4 shrink-0 text-warning" />
            <span>{error}</span>
          </div>
        )}
        <main className="mt-2 flex flex-1 flex-col">
          {step === "welcome" && (
            <Welcome
              onStart={() => {
                console.log("[onboarding] Create My Plan tapped");
                setStep("location");
              }}
              savedPlans={savedPlans}
              onOpenSaved={openSaved}
              onDeleteSaved={removeSaved}
            />
          )}
          {step === "location" && (
            <Question
              icon={<MapPin className="size-6" />} title={t("step.location.title")}
              subtitle={t("step.location.subtitle")}
              canNext={(profile.city ?? "").trim().length > 1}
              onNext={() => {
                const guessedCountry = guessCountry(profile.city ?? "");
                const countryProfile = resolveCountry(guessedCountry) ?? resolveCountry(profile.country);
                updateProfile({
                  country: countryProfile?.name ?? guessedCountry,
                  currency: (countryProfile?.currency ?? profile.currency) as UserProfile["currency"],
                });
                setStep("household");
              }}
            >
              <CityCombobox
                value={profile.city ?? ""}
                onTextChange={(v) => update("city", v)}
                onPick={(c) => {
                  const cc = c.countryCode.toUpperCase();
                  const profile = resolveCountry(cc);
                  const country = profile?.name ?? c.country;
                  const currency = (profile?.currency ?? "") as UserProfile["currency"];
                  updateProfile({ city: c.name, country, currency });
                  saveResolvedLocation({
                    lat: c.lat, lon: c.lon, city: c.name,
                    country, countryCode: profile?.code ?? cc,
                    region: c.region, postcode: c.postcode,
                    currency, source: "manual",
                  });
                }}
              />
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface/40 p-4">
                <button
                  type="button"
                  onClick={requestBrowserLocation}
                  disabled={gpsState === "loading"}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-70"
                >
                  {gpsState === "loading" ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      {t("location.searching")}
                    </>
                  ) : (
                    <>
                      <MapPin className="size-4" /> {t("location.useMyLocation")}
                    </>
                  )}
                </button>

                {gpsState === "denied" && (
                  <p
                    className="mt-3 rounded-xl bg-warning/15 px-3 py-2 text-center text-xs font-semibold text-foreground"
                    role="status"
                  >
                    {t("location.deniedHelp")}
                  </p>
                )}
                {gpsState === "unavailable" && (
                  <p
                    className="mt-3 rounded-xl bg-warning/15 px-3 py-2 text-center text-xs font-semibold text-foreground"
                    role="status"
                  >
                    {t("location.unavailableHelp")}
                  </p>
                )}

                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {t("location.privacy")}
                </p>
              </div>

            </Question>
          )}
          {step === "household" && (
            <Question icon={<Users className="size-6" />} title={t("step.household.title")}
              subtitle={t("step.household.subtitle")}
              canNext={!!profile.household} onNext={() => setStep("budget")}
            >
              <div className="grid grid-cols-5 gap-2">
                {["1", "2", "3", "4", "5+"].map((n) => (
                  <button key={n} onClick={() => update("household", n)}
                    className={`aspect-square rounded-2xl border text-lg font-semibold transition ${
                      profile.household === n
                        ? "border-primary bg-primary text-primary-foreground shadow-glow"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </Question>
          )}
          {step === "budget" && (
            <Question icon={<Wallet className="size-6" />} title={t("step.budget.title")}
              subtitle={t("step.budget.subtitle")}
              canNext={Number(profile.budget) > 0} onNext={() => setStep("style")}
            >
              <div className="flex gap-2">
                <select value={profile.currency}
                  onChange={(e) => update("currency", e.target.value as UserProfile["currency"])}
                  className="h-14 rounded-2xl border border-input bg-card px-3 text-base font-medium">
                  {Object.entries(CURRENCIES).map(([k, v]) => (
                    <option key={k} value={k}>{v} {k}</option>
                  ))}
                </select>
                <Input type="number" inputMode="decimal" placeholder="0"
                  value={profile.budget} onChange={(e) => update("budget", e.target.value)}
                  className="h-14 flex-1 rounded-2xl text-base" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(["weekly", "monthly"] as const).map((f) => (
                  <button key={f} onClick={() => update("frequency", f)}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                      profile.frequency === f
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}>{t(`frequency.${f}`)}</button>
                ))}
              </div>
            </Question>
          )}
          {step === "style" && (
            <Question icon={<Salad className="size-6" />} title={t("step.style.title")}
              subtitle={t("step.style.subtitle")}
              canNext={!!profile.style} onNext={() => setStep("allergies")}
            >
              <div className="flex flex-col gap-2">
                {STYLES.map((s) => (
                  <button key={s} onClick={() => update("style", s)}
                    className={`flex items-center justify-between rounded-2xl border px-5 py-4 text-left font-medium transition ${
                      profile.style === s
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-foreground hover:border-primary/40"
                    }`}>
                    <span>{t(`style.${s}`)}</span>
                    {profile.style === s && <Check className="size-5 text-primary" />}
                  </button>
                ))}
              </div>
            </Question>
          )}
          {step === "allergies" && (
            <Question icon={<Sparkles className="size-6" />} title={t("step.allergies.title")}
              subtitle={t("step.allergies.subtitle")}
              canNext={true} onNext={() => setStep("extras")} nextLabel={t("common.continue")}
            >
              <div className="grid grid-cols-2 gap-2">
                {ALLERGIES.map((a) => {
                  const on = profile.allergies.includes(a);
                  return (
                    <button key={a}
                      onClick={() => update("allergies", on ? profile.allergies.filter((x) => x !== a) : [...profile.allergies, a])}
                      className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium transition ${
                        on ? "border-primary bg-primary/10" : "border-border bg-card text-muted-foreground"
                      }`}>
                      <Checkbox checked={on} className="pointer-events-none" />
                      {t(`allergy.${a}`)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4">
                <Label className="text-sm text-muted-foreground">{t("step.allergies.dislikes")}</Label>
                <Textarea placeholder={t("step.allergies.dislikesPlaceholder")}
                  value={profile.dislikes} onChange={(e) => update("dislikes", e.target.value)}
                  className="mt-2 rounded-2xl" />
              </div>
            </Question>
          )}
          {step === "extras" && (
            <Question icon={<CalendarOff className="size-6" />} title={t("step.extras.title")}
              subtitle={t("step.extras.subtitle")}
              canNext={true} onNext={() => void submit(variantSeed)} nextLabel={t("common.generate")}
            >
              <div className="grid grid-cols-2 gap-2">
                {([
                  { v: true, label: t("extras.yes"), sub: t("extras.yesSub") },
                  { v: false, label: t("extras.no"), sub: t("extras.noSub") },
                ] as const).map((o) => (
                  <button key={String(o.v)} onClick={() => update("zeroSpendDay", o.v)}
                    className={`flex flex-col items-start gap-1 rounded-2xl border px-4 py-4 text-left transition ${
                      profile.zeroSpendDay === o.v
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border bg-card text-muted-foreground"
                    }`}>
                    <span className="text-sm font-semibold">{o.label}</span>
                    <span className="text-xs opacity-80">{o.sub}</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 rounded-2xl border border-dashed border-border bg-surface/50 p-4 text-xs text-muted-foreground">
                {t("extras.disclaimer")}
              </div>
            </Question>
          )}
          {step === "processing" && <Processing />}
          {step === "results" && currentPlan && (
            <Results
              plan={currentPlan}
              profile={profile}
              onRestart={startOver}
              onRegenerate={regenerate}
              onSave={handleSave}
              onTooLow={() => setStep("low")}
            />
          )}
          {step === "low" && currentPlan && <LowBudget plan={currentPlan} profile={profile}
            onKeep={() => setStep("results")}
            onOptimize={() => setStep("results")}
            onRestart={startOver} />}
        </main>
      </div>
    </div>
  );
}

function prevStep(s: Step): Step {
  const order: Step[] = ["welcome", "location", "household", "budget", "style", "allergies", "extras"];
  const i = order.indexOf(s);
  return i > 0 ? order[i - 1] : "welcome";
}

function Header({ step, onBack }: { step: Step; onBack: () => void }) {
  const showBack = !["welcome", "processing", "results", "low"].includes(step);
  const steps = ["location", "household", "budget", "style", "allergies", "extras"];
  const idx = steps.indexOf(step);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {showBack ? (
          <button onClick={onBack} className="grid size-10 place-items-center rounded-full bg-card shadow-soft">
            <ArrowLeft className="size-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="grid size-11 place-items-center rounded-full bg-primary shadow-glow">
              <PiggyBank className="size-5 text-primary-foreground" strokeWidth={2} />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-serif-display text-[1.35rem] font-bold tracking-tight text-foreground">MealMint</span>
              <span className="mt-0.5 text-[0.68rem] font-medium tracking-wide text-primary/80">Eat Well. Save More.</span>
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {idx >= 0 && (
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div key={i} className={`h-1.5 w-5 rounded-full transition ${i <= idx ? "bg-primary" : "bg-border"}`} />
            ))}
          </div>
        )}
        <LanguageSelector compact />
      </div>
    </div>
  );
}

function Welcome({ onStart, savedPlans, onOpenSaved, onDeleteSaved }: {
  onStart: () => void;
  savedPlans: SavedPlan[];
  onOpenSaved: (id: string) => void;
  onDeleteSaved: (id: string) => void;
}) {
  const [showSaved, setShowSaved] = useState(false);
  const t = useT();
  const handleStart = () => {
    if (import.meta.env.DEV) {
      console.log("[onboarding] CTA pressed — starting onboarding", {
        isOnboardingStarted: true,
        currentStep: "location",
      });
    }
    onStart();
  };
  const scrollToHow = () => {
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-1 pb-10">
      {/* ─── Brand mark ─── */}
      <div className="flex flex-col items-center pt-3 pb-1 text-center">
        <div className="flex items-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-soft">
            <PiggyBank className="size-5" strokeWidth={2} />
          </div>
          <span className="font-serif-display text-2xl font-extrabold tracking-tight text-foreground">
            MealMint
          </span>
        </div>
        <p className="mt-1.5 text-[0.78rem] font-medium uppercase tracking-[0.22em] text-muted-foreground">
          {t("welcome.tagline.short")}
        </p>
      </div>

      {/* ─── Hero ─── */}
      <div className="relative mt-6 overflow-hidden rounded-[2rem] bg-gradient-hero px-5 pt-8 pb-7 text-center shadow-card">
        <div className="pointer-events-none absolute -top-16 -right-16 size-60 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 size-56 rounded-full bg-accent/25 blur-3xl" />

        {/* Illustration card */}
        <div className="relative mx-auto mb-6 grid size-32 place-items-center">
          <div className="absolute inset-0 rounded-[2rem] bg-secondary shadow-sticker" />
          <div className="absolute inset-0 rounded-[2rem] bg-gradient-to-br from-white/60 to-transparent mix-blend-overlay" />
          <PiggyBank className="relative size-16 text-primary animate-bob" strokeWidth={1.6} />
          <div className="absolute -right-2 -top-1 grid size-9 place-items-center rounded-full bg-accent text-accent-foreground shadow-glow animate-sparkle">
            <Coins className="size-4" strokeWidth={2.25} />
          </div>
          <div className="absolute -left-3 bottom-1 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-soft">
            <Sparkles className="size-3.5" strokeWidth={2.4} />
          </div>
        </div>

        <h1 className="font-serif-display text-[2rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-foreground">
          {t("welcome.hero.title.a")} <span className="italic text-primary">{t("welcome.hero.title.b")}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-[20rem] text-[0.95rem] leading-[1.55] text-muted-foreground">
          {t("welcome.hero.sub")}
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
          <Button
            type="button"
            onClick={handleStart}
            className="h-[62px] w-full rounded-full bg-gradient-savings text-[1.02rem] font-bold tracking-tight text-primary-foreground shadow-glow transition active:scale-[0.98] hover:opacity-95"
          >
            ✨ {t("welcome.hero.cta")}
            <ArrowRight className="ml-1 size-4" strokeWidth={2.4} />
          </Button>
          <Link
            to="/import"
            className="inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-full border-2 border-primary/25 bg-card text-[0.98rem] font-bold tracking-tight text-foreground shadow-soft transition active:scale-[0.98] hover:border-primary/60"
          >
            📄 {t("import.cta")}
          </Link>
          <button
            type="button"
            onClick={scrollToHow}
            className="text-[0.85rem] font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("welcome.hero.how")}
          </button>
        </div>
      </div>

      {/* ─── Savings preview card ─── */}
      <div className="mt-5 rounded-[1.75rem] bg-card p-5 shadow-card">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-full bg-accent/30 text-accent-foreground">
            <Coins className="size-5 text-primary" strokeWidth={2} />
          </div>
          <div className="flex-1">
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("welcome.savings.label")}
            </div>
            <div className="font-serif-display text-3xl font-extrabold leading-none text-primary">
              €18–€42
            </div>
          </div>
        </div>
        <p className="mt-3 text-[0.85rem] leading-[1.5] text-muted-foreground">
          {t("welcome.savings.desc")}
        </p>
      </div>

      {/* ─── Feature chips ─── */}
      <div id="how-it-works" className="mt-6 grid grid-cols-2 gap-3">
        <FeatureChip icon={<ChefHat className="size-4" strokeWidth={2.2} />} label={t("welcome.chip.recipes")} />
        <FeatureChip icon={<MapPin className="size-4" strokeWidth={2.2} />} label={t("welcome.chip.stores")} />
        <FeatureChip icon={<Wallet className="size-4" strokeWidth={2.2} />} label={t("welcome.chip.prices")} />
        <FeatureChip icon={<Recycle className="size-4" strokeWidth={2.2} />} label={t("welcome.chip.waste")} />
      </div>

      {/* ─── Saved plans ─── */}
      {savedPlans.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowSaved((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-soft"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FolderOpen className="size-4 text-primary" />
              {t("welcome.savedToggle", { count: savedPlans.length })}
            </span>
            <ArrowRight className={`size-4 text-muted-foreground transition ${showSaved ? "rotate-90" : ""}`} />
          </button>
          {showSaved && (
            <div className="mt-2 flex flex-col gap-2">
              {savedPlans.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft">
                  <button onClick={() => onOpenSaved(s.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-semibold text-foreground">{s.label}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(s.createdAt).toLocaleDateString()} · {t("welcome.savedEst")} {CURRENCIES[s.form.currency]}{s.estimatedSpend.toFixed(0)}
                    </div>
                  </button>
                  <button
                    onClick={() => onDeleteSaved(s.id)}
                    className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-destructive"
                    aria-label={t("welcome.deleteSaved")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Trust / family message ─── */}
      <div className="mt-6 flex items-center justify-center gap-2.5 rounded-2xl bg-secondary/60 px-4 py-3.5 text-center text-[0.85rem] font-medium text-secondary-foreground">
        <Users className="size-4 shrink-0 text-primary" />
        <span>{t("welcome.family")}</span>
      </div>
    </div>
  );
}

function FeatureChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-3 shadow-soft">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-secondary text-primary">
        {icon}
      </div>
      <span className="text-[0.9rem] font-semibold leading-tight text-foreground">{label}</span>
    </div>
  );
}

function AchievementChip({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl bg-white/95 px-2 py-4 text-center shadow-soft backdrop-blur-sm ring-1 ring-white/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/80 to-transparent" />
      <div className="relative grid size-8 place-items-center rounded-full bg-secondary text-primary">
        {icon}
      </div>
      <div className="relative mt-2 font-serif-display text-lg font-extrabold leading-none text-foreground">{value}</div>
      <div className="relative mt-1 text-[10px] font-medium leading-tight text-muted-foreground">{label}</div>
    </div>
  );
}

function Question({ icon, title, subtitle, children, canNext, onNext, nextLabel }: {
  icon: React.ReactNode; title: string; subtitle?: string; children: React.ReactNode;
  canNext: boolean; onNext: () => void; nextLabel?: string;
}) {
  const t = useT();
  const label = nextLabel ?? t("common.continue");
  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-6 grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</div>
      <h2 className="mt-4 font-display text-2xl font-bold text-foreground">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      <div className="mt-6">{children}</div>
      <div className="mt-auto pb-2 pt-6">
        <Button onClick={onNext} disabled={!canNext}
          className="h-14 w-full rounded-2xl bg-gradient-primary text-base font-semibold shadow-glow hover:opacity-90 disabled:opacity-40 disabled:shadow-none">
          {label}
        </Button>
      </div>
    </div>
  );
}

function Processing() {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center">
      <div className="relative mb-8">
        <div className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
        <div className="relative grid size-24 place-items-center rounded-full bg-gradient-primary shadow-glow">
          <Loader2 className="size-10 animate-spin text-primary-foreground" />
        </div>
      </div>
      <h2 className="font-display text-2xl font-bold">{t("processing.title")}</h2>
      <p className="mt-3 max-w-xs text-sm text-muted-foreground">
        {t("processing.subtitle")}
      </p>
    </div>
  );
}

const STATUS_KEY: Record<ComputedResults["status"], string> = {
  comfortable: "status.comfortable",
  optimized: "status.optimized",
  too_low: "status.tooLow",
  over: "status.over",
  unavailable: "status.unavailable",
};

function Results({ plan: inputPlan, profile, onRestart, onRegenerate, onSave, onTooLow }: {
  plan: Plan;
  profile: UserProfile;
  onRestart: () => void;
  onRegenerate: () => void;
  onSave: (results: ComputedResults) => void;
  onTooLow: () => void;
}) {
  const t = useT();
  const { language } = useI18n();
  const sym = CURRENCIES[profile.currency];

  // ─── Live pricing via the Price Engine ────────────────────────────
  const [rawPricing, setRawPricing] = useState<PricingResult | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingLoading, setPricingLoading] = useState<boolean>(true);
  const [retryToken, setRetryToken] = useState(0);
  const [alternatives, setAlternatives] = useState<PriceAlternative[]>([]);
  const [recipeOpen, setRecipeOpen] = useState<null | { dayIndex: number; day: string; mealType: "breakfast" | "lunch" | "dinner"; name: string }>(null);
  const city = profile.city || "London";
  const country = profile.country || "UK";

  useEffect(() => {
    let alive = true;
    setPricingError(null);
    setPricingLoading(true);
    (async () => {
      try {
        const result = await pricePlan(inputPlan, city, country);
        const altCandidates = ["Chicken breast", "Branded cereal", "Avocado", "Butter", "Imported vegetables"];
        const altResults = (
          await Promise.all(altCandidates.map((i) => comparePriceAlternatives(i, city, country)))
        ).flat();
        if (!alive) return;
        setRawPricing(result);
        setAlternatives(altResults);
      } catch (err) {
        if (!alive) return;
        setPricingError(friendlyMessage(err));
      } finally {
        if (alive) setPricingLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [inputPlan, city, country, retryToken]);

  const retryPricing = () => setRetryToken((n) => n + 1);

  const pricing = rawPricing;
  const plan = inputPlan;
  const flatGrocery = useMemo<Plan["groceryList"]>(() => (
    pricing
      ? pricing.items.map((i) => ({
          name: i.name,
          category: i.category,
          quantity: i.quantity,
          estimatedCost: i.estimatedCost,
        }))
      : plan.groceryList
  ), [pricing, plan.groceryList]);

  const grouped = flatGrocery.reduce<Record<string, typeof flatGrocery>>((acc, item) => {
    (acc[item.category] ||= []).push(item);
    return acc;
  }, {});
  const categoryOrder = ["Proteins", "Vegetables", "Carbohydrates", "Healthy Fats", "Fruit", "Pantry", "Other"];
  const sortedGrouped = categoryOrder
    .filter((cat) => grouped[cat])
    .map((cat) => [cat, grouped[cat]] as const);

  // ─── ALL displayed numbers come from computeResults() — zero math in JSX ──
  const results = useMemo<ComputedResults>(
    () => computeResults({ profile, plan, pricing }),
    [profile, plan, pricing],
  );

  // If the budget is fundamentally too low, escort the user to the recovery view.
  // Guarded so a single pricing result triggers onTooLow at most once — prevents
  // a ping-pong loop with LowBudget's "Keep"/"Optimize" handlers that setStep back to "results".
  const tooLowFiredFor = useRef<PricingResult | null>(null);
  useEffect(() => {
    if (!pricing || results.status !== "too_low") return;
    if (tooLowFiredFor.current === pricing) return;
    tooLowFiredFor.current = pricing;
    onTooLow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricing, results.status]);

  const statusLabel = t(STATUS_KEY[results.status]);
  const priceByName = new Map(
    (pricing?.items ?? []).map((i) => [i.name.toLowerCase(), i.estimatedCost] as const),
  );

  // ─── Live product search via Search & Shopping Engine ─────────────
  const [productSearch, setProductSearch] = useState<SearchOutput | null>(null);
  const [productSearchLoading, setProductSearchLoading] = useState<boolean>(false);
  useEffect(() => {
    let alive = true;
    setProductSearchLoading(true);
    (async () => {
      try {
        const out = await searchProducts({
          items: flatGrocery,
          city,
          country,
          currency: profile.currency,
          estimatedByName: priceByName,
        });
        if (alive) setProductSearch(out);
      } catch (err) {
        console.warn("[product-search] failed", err);
      } finally {
        if (alive) setProductSearchLoading(false);
      }
    })();
    return () => { alive = false; };
    // priceByName re-created every render; gate on pricing identity instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flatGrocery, city, country, profile.currency, pricing]);
  const productByName = new Map(
    (productSearch?.results ?? []).map((r) => [r.itemName.toLowerCase(), r] as const),
  );

  // Refs used by the "Next best action" CTAs to scroll to sections.
  const mealsRef = useRef<HTMLDivElement>(null);
  const groceryRef = useRef<HTMLDivElement>(null);
  const shoppingRef = useRef<HTMLDivElement>(null);
  const scrollTo = (r: React.RefObject<HTMLDivElement | null>) =>
    r.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Emotional equivalents for the savings amount — used in the hero copy.
  const equivalent = useMemo(() => {
    const s = Math.max(0, results.savings);
    if (s <= 0) return null;
    const dinners = Math.floor(s / 25);
    if (dinners >= 1) return t("results.equivalent.dinners", { n: dinners });
    const coffees = Math.floor(s / 3.5);
    if (coffees >= 3) return t("results.equivalent.coffees", { n: coffees });
    return null;
  }, [results.savings, t]);

  const yearlyProjection = Math.max(0, results.annualSavings);
  const shownMeals = plan.mealPlan.slice(0, 3);
  const extraMeals = plan.mealPlan.length - shownMeals.length;
  const shownGrocery = flatGrocery.slice(0, 5);
  const extraGrocery = flatGrocery.length - shownGrocery.length;
  const household = Math.max(1, Number(profile.household) || 1);
  const perServing = results.savingsAvailable
    ? results.estimatedSpend / Math.max(1, plan.mealPlan.length * 3 * household)
    : 0;
  const mainSavingsAmount = results.status === "over" ? results.overBudgetAmount : results.savings;
  const savingsLineLabel = results.status === "over" ? t("results.overBudget") : t("results.expectedSavings");
  const savingsLineValue = results.savingsAvailable
    ? `${sym}${mainSavingsAmount.toFixed(2)}`
    : t("results.savingsUnavailable");

  const kcalFor = (k: "breakfast" | "lunch" | "dinner") =>
    k === "breakfast" ? 420 : k === "lunch" ? 620 : 720;

  return (
    <div className="flex flex-1 flex-col gap-6 pb-12 overflow-y-auto">
      {pricingError && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-xs text-foreground">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <div className="flex-1">
              <div className="font-semibold">{t("results.pricingFetchFailed.title")}</div>
              <p className="mt-0.5 text-muted-foreground">{t("results.pricingFetchFailed.body", { msg: pricingError })}</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-xs" onClick={retryPricing} disabled={pricingLoading}>
              {pricingLoading ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
              <span className="ml-1">{t("results.retry")}</span>
            </Button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          1. HERO SAVINGS MOMENT — gold amount on warm white
          ═══════════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden rounded-[2.25rem] border border-border/60 bg-card p-6 shadow-[0_20px_60px_-30px_rgba(35,47,62,0.35)]">
        <div className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-accent/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-14 -bottom-16 size-52 rounded-full bg-[color:var(--trust,#232F3E)]/10 blur-3xl" />

        <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--trust,#232F3E)]/70">
          <Sparkles className="size-3.5 text-accent" strokeWidth={2.2} />
          {t("results.hero.eyebrow")}
        </div>

        <h1 className="mt-3 font-serif-display text-[1.7rem] font-extrabold leading-tight text-[color:var(--trust,#232F3E)]">
          {!results.savingsAvailable
            ? t("results.savingsUnavailable")
            : results.status === "over"
            ? t("results.hero.title.tune")
            : t("results.hero.title.good")}
        </h1>

        {pricing && results.savingsAvailable ? (
          <div className="relative mt-5 flex items-end gap-2">
            <span className="font-serif-display text-3xl font-bold text-accent">{sym}</span>
            <span
              className="font-serif-display text-[4.75rem] font-extrabold leading-none tracking-tight text-accent"
              style={{ textShadow: "0 2px 24px rgba(255,153,0,0.25)" }}
            >
              {mainSavingsAmount.toFixed(0)}
            </span>
            <span className="mb-3 text-sm font-semibold text-muted-foreground">
              {t(profile.frequency === "monthly" ? "results.period.month" : "results.period.week")}
            </span>
          </div>
        ) : pricing ? (
          <div className="relative mt-5 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm font-semibold text-foreground">
            {t("results.savingsUnavailable")}
            {results.missingPrices.length > 0 && (
              <div className="mt-1 text-xs font-normal text-muted-foreground">
                {t("results.noPriceFound", { n: results.missingPrices.length, s: results.missingPrices.length === 1 ? "" : "s" })}
              </div>
            )}
          </div>
        ) : (
          <Skeleton className="mt-5 h-16 w-40 rounded-2xl" />
        )}

        {pricing && results.savingsAvailable && equivalent && results.savings > 0 && (
          <p className="relative mt-2 text-sm italic text-muted-foreground">
            {equivalent}
          </p>
        )}

        {/* Compact stat strip — no dashboard cards */}
        <div className="relative mt-6 grid grid-cols-3 gap-3">
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <CalendarRange className="size-3 text-[color:var(--trust,#232F3E)]" /> {t("results.hero.yearly")}
            </div>
            <div className="mt-1 font-serif-display text-lg font-bold text-accent">
              {pricing && results.savingsAvailable ? `${sym}${yearlyProjection.toFixed(0)}` : "—"}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Wallet className="size-3 text-[color:var(--trust,#232F3E)]" /> {t("results.hero.budget")}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`inline-block size-2 rounded-full ${
                  results.status === "optimized" || results.status === "comfortable"
                    ? "bg-primary"
                    : results.status === "over"
                    ? "bg-accent"
                    : "bg-warning"
                }`}
              />
              <span className="text-sm font-semibold text-foreground">
                {pricing ? statusLabel : t("results.pricing")}
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Trophy className="size-3 text-accent" /> {t("results.hero.score")}
            </div>
            <div className="mt-1 font-serif-display text-lg font-bold text-foreground">
              {results.savingsAvailable ? results.score.total : "—"}
              {results.savingsAvailable && <span className="text-xs font-medium text-muted-foreground">/100</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-[0_2px_8px_-4px_rgba(35,47,62,0.15)]">
        <div className="flex flex-col gap-2.5">
          <BudgetRowLine label={profile.frequency === "monthly" ? t("results.monthlyBudget") : t("results.weeklyBudget")} value={`${sym}${results.budget.toFixed(2)}`} type="total" />
          <BudgetRowLine label={t("results.estimatedSpend")} value={results.savingsAvailable ? `${sym}${results.estimatedSpend.toFixed(2)}` : "—"} type="spend" />
          <div className="h-px bg-border" />
          <BudgetRowLine label={savingsLineLabel} value={savingsLineValue} type={results.status === "over" ? "over" : results.savingsAvailable ? "savings" : "unavailable"} />
          <BudgetRowLine label={t("results.annualSavings")} value={results.savingsAvailable ? `${sym}${results.annualSavings.toFixed(0)}` : "—"} type="total" />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          2. WHY YOU SAVED — 3 reason cards, no long paragraphs
          ═══════════════════════════════════════════════════════════════ */}
      {results.savingsAvailable && <section>
        <h2 className="mb-3 px-1 font-serif-display text-base font-bold text-[color:var(--trust,#232F3E)]">
          {t("results.why.title")}
        </h2>
        <div className="grid grid-cols-1 gap-2.5">
          {[
            {
              icon: <Recycle className="size-4" strokeWidth={2.2} />,
              title: t("results.why.reused.title", { n: results.waste.ingredientsReused }),
              body: t("results.why.reused.body"),
            },
            {
              icon: <TrendingDown className="size-4" strokeWidth={2.2} />,
              title: t("results.why.cheaper.title"),
              body: t("results.why.cheaper.body"),
            },
            {
              icon: <Sparkles className="size-4" strokeWidth={2.2} />,
              title: t("results.why.optimized.title"),
              body: t("results.why.optimized.body"),
            },
          ].map((r, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-[0_2px_8px_-4px_rgba(35,47,62,0.15)]"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color:var(--trust,#232F3E)]/8 text-[color:var(--trust,#232F3E)]">
                {r.icon}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-foreground">{r.title}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{r.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>}

      {/* ═══════════════════════════════════════════════════════════════
          3. NEXT BEST ACTION — one primary CTA, two subtle secondaries
          ═══════════════════════════════════════════════════════════════ */}
      <section className="flex flex-col gap-2">
        <Button
          onClick={() => scrollTo(results.savingsAvailable ? shoppingRef : groceryRef)}
          className="h-14 rounded-2xl bg-primary text-base font-bold text-primary-foreground shadow-[0_10px_24px_-12px_rgba(30,122,70,0.55)] hover:bg-primary/90"
        >
          <ShoppingCart className="size-4" /> {results.savingsAvailable ? t("results.nba.primary") : t("results.nba.viewGrocery")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => scrollTo(mealsRef)}
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-sm font-semibold text-[color:var(--trust,#232F3E)] hover:border-[color:var(--trust,#232F3E)]/40"
          >
            <ChefHat className="size-4" /> {t("results.nba.viewMeals")}
          </button>
          <button
            type="button"
            onClick={() => scrollTo(groceryRef)}
            className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card px-3 py-3 text-sm font-semibold text-[color:var(--trust,#232F3E)] hover:border-[color:var(--trust,#232F3E)]/40"
          >
            <ShoppingBasket className="size-4" /> {t("results.nba.viewGrocery")}
          </button>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          4. MEAL PLAN PREVIEW — visual meal rows, not database rows
          ═══════════════════════════════════════════════════════════════ */}
      <section ref={mealsRef} className="scroll-mt-6">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="font-serif-display text-base font-bold text-[color:var(--trust,#232F3E)]">
            {t("results.mealPreview.title")}
          </h2>
          <span className="text-xs font-medium text-muted-foreground">
            {t("results.mealPreview.count", { n: plan.mealPlan.length })}
          </span>
        </div>

        <div className="flex flex-col gap-3">
          {shownMeals.map((m, i) => {
            const slots: Array<{ key: "breakfast" | "lunch" | "dinner"; label: string; name: string }> = [
              { key: "breakfast", label: t("results.mealType.breakfast"), name: m.breakfast },
              { key: "lunch", label: t("results.mealType.lunch"), name: m.lunch },
              { key: "dinner", label: t("results.mealType.dinner"), name: m.dinner },
            ];
            return (
              <div key={i} className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_2px_8px_-4px_rgba(35,47,62,0.15)]">
                <div className="flex items-center gap-2 border-b border-border/60 bg-surface/60 px-4 py-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-[color:var(--trust,#232F3E)]">{m.day}</span>
                </div>
                <div className="divide-y divide-border/50">
                  {slots.map((s) => {
                    const mins = estimatePrepMinutes(s.name, s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => setRecipeOpen({ dayIndex: i, day: m.day, mealType: s.key, name: s.name })}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-surface/40"
                      >
                        <div className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-surface">
                          <div className="absolute inset-0 grid place-items-center bg-surface/50 text-[color:var(--trust,#232F3E)]/40">
                            <Utensils className="size-5" />
                          </div>
                          <img
                            src={unsplashFoodImage(s.name, i * 3)}
                            alt=""
                            loading="lazy"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                            className="absolute inset-0 size-full object-cover"
                          />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.label}</div>
                          <div className="truncate text-sm font-semibold text-foreground">{s.name}</div>
                          <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {mins}m</span>
                            <span className="inline-flex items-center gap-1"><Flame className="size-3" /> {kcalFor(s.key)} kcal</span>
                            {pricing && (
                              <span className="inline-flex items-center gap-1 font-semibold text-accent">
                                {perServing >= 0.01
                                  ? <>{sym}{perServing.toFixed(2)}<span className="text-muted-foreground font-normal">/serv</span></>
                                  : <span className="text-muted-foreground font-normal">{t("results.priceUnavailable")}</span>}
                              </span>
                            )}
                          </div>
                        </div>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {extraMeals > 0 && (
          <details className="mt-3 rounded-2xl border border-border/70 bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-[color:var(--trust,#232F3E)]">
              <span>{t("results.mealPreview.viewAll", { n: extraMeals })}</span>
              <ChevronDown className="size-4 transition group-open:rotate-180" />
            </summary>
            <div className="flex flex-col gap-3 border-t border-border/60 p-3">
              {plan.mealPlan.slice(shownMeals.length).map((m, i) => {
                const dayIndex = shownMeals.length + i;
                const slots: Array<{ key: "breakfast" | "lunch" | "dinner"; label: string; name: string }> = [
                  { key: "breakfast", label: t("results.mealType.breakfast"), name: m.breakfast },
                  { key: "lunch", label: t("results.mealType.lunch"), name: m.lunch },
                  { key: "dinner", label: t("results.mealType.dinner"), name: m.dinner },
                ];
                return (
                  <div key={dayIndex} className="rounded-xl border border-border/60 bg-surface/40 p-3">
                    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[color:var(--trust,#232F3E)]">{m.day}</div>
                    <div className="flex flex-col gap-1">
                      {slots.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setRecipeOpen({ dayIndex, day: m.day, mealType: s.key, name: s.name })}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground hover:bg-card"
                        >
                          <span className="truncate"><span className="text-[10px] font-bold uppercase text-muted-foreground mr-2">{s.label}</span>{s.name}</span>
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </section>

      <RecipeDetailsDialog
        open={!!recipeOpen}
        onOpenChange={(v) => !v && setRecipeOpen(null)}
        entry={recipeOpen}
        plan={plan}
        profile={profile}
        results={results}
        sym={sym}
        priceByName={priceByName}
      />

      {/* ═══════════════════════════════════════════════════════════════
          5. GROCERY LIST PREVIEW — one clear action per item
          ═══════════════════════════════════════════════════════════════ */}
      <section ref={groceryRef} className="scroll-mt-6">
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="font-serif-display text-base font-bold text-[color:var(--trust,#232F3E)]">
            {t("results.groceryPreview.title")}
          </h2>
          <span className="text-xs font-medium text-muted-foreground">
            {t("results.groceryPreview.count", { n: flatGrocery.length })}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_2px_8px_-4px_rgba(35,47,62,0.15)]">
          <ul className="divide-y divide-border/60">
            {shownGrocery.map((it, i) => {
              const product = productByName.get(it.name.toLowerCase()) ?? null;
              const live = priceByName.get(it.name.toLowerCase()) ?? 0;
              const price = live;
              const bestRetailer = product?.primary.retailer ?? defaultRetailerFor(country).name;
              const bestUrl = product?.primary.url ?? buildShoppingLink({ itemName: it.name, city, country }).searchUrl;
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{it.name}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{it.quantity}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{bestRetailer}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-serif-display text-sm font-bold text-accent">
                      {pricing
                        ? (price > 0
                            ? `${sym}${price.toFixed(2)}`
                            : <span className="text-[11px] font-medium text-muted-foreground">{t("results.priceUnavailable")}</span>)
                        : <Skeleton className="inline-block h-4 w-10 rounded" />}

                    </div>
                  </div>
                  <a
                    href={bestUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/15"
                  >
                    {t("results.groceryPreview.bestPlace")} <ExternalLink className="size-3" />
                  </a>
                </li>
              );
            })}
          </ul>

          {extraGrocery > 0 && (
            <details className="border-t border-border/60">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold text-[color:var(--trust,#232F3E)]">
                <span>{t("results.groceryPreview.viewAll", { n: extraGrocery })}</span>
                <ChevronDown className="size-4" />
              </summary>
              <ul className="divide-y divide-border/60 border-t border-border/60">
                {flatGrocery.slice(shownGrocery.length).map((it, i) => {
                  const product = productByName.get(it.name.toLowerCase()) ?? null;
                  const live = priceByName.get(it.name.toLowerCase()) ?? 0;
                  const price = live;
                  const bestUrl = product?.primary.url ?? buildShoppingLink({ itemName: it.name, city, country }).searchUrl;
                  return (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        <span className="font-semibold">{it.name}</span>
                        <span className="ml-2 text-[11px] text-muted-foreground">{it.quantity}</span>
                      </span>
                      <span className="shrink-0 font-serif-display font-bold text-accent">
                        {pricing && price > 0
                          ? `${sym}${price.toFixed(2)}`
                          : <span className="text-[11px] font-medium text-muted-foreground">{t("results.priceUnavailable")}</span>}
                      </span>
                      <a href={bestUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-primary/10 p-1.5 text-primary hover:bg-primary/15">
                        <ExternalLink className="size-3" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>

        <p className="mt-2 px-1 text-[11px] text-muted-foreground">{t("results.groceryPreview.moreOptions")}</p>
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          6. SHOPPING RECOMMENDATION — one recommended basket
          ═══════════════════════════════════════════════════════════════ */}
      <section ref={shoppingRef} className="scroll-mt-6">
        {results.cheapestSupermarket ? (
          <div className="relative overflow-hidden rounded-[2rem] border border-[color:var(--trust,#232F3E)]/12 bg-card p-6 shadow-[0_20px_50px_-30px_rgba(35,47,62,0.4)]">
            <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-accent/10 blur-3xl" />

            <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--trust,#232F3E)]/70">
              <Sparkles className="size-3.5 text-[color:var(--trust,#232F3E)]" strokeWidth={2.2} />
              {t("results.shopping.eyebrow")}
            </div>

            <div className="relative mt-3 flex items-baseline gap-2">
              <h2 className="font-serif-display text-2xl font-extrabold text-[color:var(--trust,#232F3E)]">
                {results.cheapestSupermarket.name}
              </h2>
            </div>
            <p className="relative mt-1 text-sm text-muted-foreground">
              {t("results.shopping.why", { country })}
            </p>

            <div className="relative mt-5 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("results.shopping.totalCost")}</div>
                <div className="mt-1 font-serif-display text-xl font-bold text-foreground">
                  {sym}{results.cheapestSupermarket.total.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("results.shopping.expectedSaving")}</div>
                <div className="mt-1 font-serif-display text-xl font-bold text-accent">
                  −{sym}{results.cheapestSupermarket.savingsVsMax.toFixed(2)}
                </div>
              </div>
            </div>

            <a
              href={buildBasketUrl(defaultRetailerFor(country).id as keyof typeof RETAILERS, plan.groceryList)}
              target="_blank"
              rel="noopener noreferrer"
              className="relative mt-5 flex h-13 items-center justify-center gap-2 rounded-2xl bg-primary py-3 text-sm font-bold text-primary-foreground shadow-[0_10px_24px_-12px_rgba(30,122,70,0.55)] hover:bg-primary/90"
            >
              <ShoppingCart className="size-4" /> {t("results.shopping.shopNow")}
              <ArrowRight className="size-4" />
            </a>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted-foreground">
            {t("results.shopping.noneAvailable")}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════
          Advanced details — collapsed by default to preserve premium feel
          ═══════════════════════════════════════════════════════════════ */}
      <details className="group rounded-3xl border border-border/70 bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-[color:var(--trust,#232F3E)]" />
            <span className="font-serif-display text-base font-bold text-[color:var(--trust,#232F3E)]">
              {t("results.moreInsights")}
            </span>
          </div>
          <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
        </summary>

        <div className="flex flex-col gap-4 border-t border-border/60 p-4">
          {/* Budget Breakdown */}
          <Card title={t("results.budgetBreakdown")} icon={<Receipt className="size-4 text-primary" />}>
            <div className="flex flex-col gap-3">
              <BudgetRowLine label={profile.frequency === "monthly" ? t("results.monthlyBudget") : t("results.weeklyBudget")} value={`${sym}${results.budget.toFixed(2)}`} type="total" />
              {results.savingsAvailable ? (
                <BudgetRowLine label={t("results.estimatedSpend")} value={`${sym}${results.estimatedSpend.toFixed(2)}`} type="spend" />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{t("results.estimatedSpend")}</span>
                  {pricing ? <span className="text-right text-sm font-semibold text-muted-foreground">—</span> : <Skeleton className="h-5 w-20 rounded-md" />}
                </div>
              )}
              <div className="h-px bg-border" />
              {results.savingsAvailable ? (
                <BudgetRowLine label={savingsLineLabel} value={savingsLineValue} type={results.status === "over" ? "over" : "savings"} />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{t("results.expectedSavings")}</span>
                  {pricing ? <span className="text-right text-sm font-semibold text-muted-foreground">{t("results.savingsUnavailable")}</span> : <Skeleton className="h-5 w-20 rounded-md" />}
                </div>
              )}
            </div>
          </Card>

          {/* Full grocery list with per-item compare */}
          <Card title={t("results.groceryList")} icon={<ShoppingBasket className="size-4 text-primary" />}>
            <div className="flex flex-col gap-5">
              {sortedGrouped.map(([cat, items]) => {
                const enriched = items.map((it) => {
                  const live = priceByName.get(it.name.toLowerCase()) ?? 0;
                  const product = productByName.get(it.name.toLowerCase()) ?? null;
                  return { ...it, live, product };
                });
                const catTotal = enriched.reduce((sum, it) => sum + it.live, 0);
                return (
                  <div key={cat}>
                    <div className="mb-2 flex items-center gap-2">
                      <CategoryIcon category={cat} />
                      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t(`category.${cat}`)}</span>
                      <span className="ml-auto text-xs font-semibold text-foreground">
                        {pricing ? `${sym}${catTotal.toFixed(2)}` : <Skeleton className="inline-block h-4 w-12 rounded" />}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {enriched.map((it, i) => (
                        <GroceryRow
                          key={i}
                          itemName={it.name}
                          quantity={it.quantity}
                          live={it.live}
                          sym={sym}
                          product={it.product}
                          country={country}
                          city={city}
                          currency={profile.currency}
                          loadingProduct={productSearchLoading && !it.product}
                          pricing={pricing}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5">
              <NearbyStoresCard country={country} city={city} />
            </div>

            <BuyOnlineBasket
              items={plan.groceryList}
              country={country}
              city={city}
              estimatedBasketCost={results.estimatedSpend}
              currency={sym}
            />
          </Card>

          {/* Supermarket comparison */}
          <Card title={t("results.supermarketComparison")} icon={<Store className="size-4 text-primary" />}>
            <p className="-mt-1 mb-3 text-xs text-muted-foreground">{t("results.supermarketDesc")}</p>
            <SupermarketPicks supermarkets={results.supermarkets} plan={plan} sym={sym} t={t} />
          </Card>

          {/* Score details */}
          <Card title={t("results.score")} icon={<Gauge className="size-4 text-primary" />}>
            <div className="flex items-center gap-5">
              <div className="relative grid size-24 shrink-0 place-items-center">
                <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
                  <circle cx="50" cy="50" r="44" className="fill-none stroke-border" strokeWidth="8" />
                  <circle cx="50" cy="50" r="44" className="fill-none stroke-primary" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(results.score.total / 100) * 276.46} 276.46`} />
                </svg>
                <div className="text-center">
                  <div className="font-display text-2xl font-extrabold text-foreground leading-none">{results.score.total}</div>
                  <div className="text-[10px] font-semibold text-muted-foreground">/ 100</div>
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-2">
                {results.score.breakdown.map((b) => {
                  const key =
                    b.label === "Budget Efficiency" ? "score.budgetEfficiency"
                    : b.label === "Waste Reduction" ? "score.wasteReduction"
                    : b.label === "Nutrition Balance" || b.label === "Nutrition" ? "score.nutrition"
                    : null;
                  const label = key ? t(key) : b.label;
                  return (
                    <div key={b.label}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold text-foreground">{Math.round(b.value)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-border">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${b.value}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Waste & insights & alternatives — kept but tucked away */}
          <Card title={t("results.waste.title")} icon={<Recycle className="size-4 text-primary" />}>
            <div className="grid grid-cols-2 gap-2.5">
              <MiniStat label={t("results.waste.ingredientsReused")} value={String(results.waste.ingredientsReused)} sub={t("results.waste.acrossMeals")} />
              <MiniStat label={t("results.waste.leftoverMeals")} value={String(results.waste.leftoverMeals)} sub={t("results.waste.created")} />
              <MiniStat label={t("results.waste.wasteAvoided")} value={`${results.waste.wasteAvoidedKg.toFixed(1)} kg`} sub={t("results.waste.vsAvg")} />
              <MiniStat label={t("results.waste.wasteReduction")} value={`${results.waste.wasteReductionPct}%`} sub={t("results.waste.vsBaseline")} />
            </div>
          </Card>

          {results.insights.length > 0 && (
            <Card title={t("results.insights")} icon={<Lightbulb className="size-4 text-primary" />}>
              <div className="flex flex-col gap-2.5">
                {results.insights.map((ins) => (
                  <div key={ins.id} className="flex items-start gap-3 rounded-2xl border border-border bg-surface/50 px-4 py-3">
                    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-primary/10">
                      <Sparkles className="size-3.5 text-primary" />
                    </div>
                    <p className="text-sm leading-relaxed text-foreground">{t(ins.key, ins.params)}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {results.savingsAvailable && alternatives.length > 0 && (
            <Card title={t("results.smartAlternatives")} icon={<Replace className="size-4 text-primary" />}>
              <p className="-mt-1 mb-3 text-xs text-muted-foreground">{t("results.altDesc")}</p>
              <div className="flex flex-col gap-3">
                {alternatives.map((a, i) => (
                  <div key={i} className="rounded-2xl border border-border bg-surface/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex flex-1 flex-col items-start gap-1.5">
                        <div className="inline-flex items-center gap-1.5 text-sm">
                          <span className="text-base">❌</span>
                          <span className="font-medium text-muted-foreground line-through">{a.from}</span>
                        </div>
                        <div className="ml-1 text-primary/70">↓</div>
                        <div className="inline-flex items-center gap-1.5 text-sm">
                          <span className="text-base">✅</span>
                          <span className="font-bold text-foreground">{a.to}</span>
                        </div>
                      </div>
                      <span className="rounded-full bg-accent/15 px-3 py-1 text-sm font-bold text-accent">
                        {t("results.save")} {CURRENCIES[a.currency]}{a.save.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </details>

      {/* ═══════════════════════════════════════════════════════════════
          Simple action bar — Save first, share subtle
          ═══════════════════════════════════════════════════════════════ */}
      <div className="mt-2 flex flex-col gap-3">
        <Button
          onClick={() => onSave(results)}
          disabled={!results.savingsAvailable}
          className="h-13 rounded-2xl bg-[color:var(--trust,#232F3E)] text-base font-bold text-white hover:opacity-90"
        >
          <Bookmark className="size-4" /> {t("results.saveMyPlan")}
        </Button>

        <div className="grid grid-cols-3 gap-2">
          <button
            disabled={!results.savingsAvailable}
            onClick={() => {
              if (!results.savingsAvailable) return;
              try {
                exportPlanToPdf({
                  plan, profile, language,
                  estimatedSpend: results.estimatedSpend,
                  savings: results.savings,
                  supermarkets: results.supermarkets,
                });
              } catch (err) {
                console.warn("[export-pdf] failed", err);
                toast.error(t("results.exportFailed"));
              }
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <FileDown className="size-3.5" /> {t("results.exportPdf")}
          </button>
          <button
            disabled={!results.savingsAvailable}
            onClick={() => {
              if (!results.savingsAvailable) return;
              const url = buildWhatsAppUrl({
                plan, profile,
                estimatedSpend: results.estimatedSpend,
                savings: results.savings,
                language,
              });
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Share2 className="size-3.5" /> {t("results.shareWhatsapp")}
          </button>
          <button
            onClick={onRegenerate}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-card py-2.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="size-3.5" /> {t("results.regenerate")}
          </button>
        </div>

        <button onClick={onRestart} className="text-center text-xs text-muted-foreground hover:text-foreground">
          {t("results.startNew")}
        </button>
      </div>
    </div>
  );
}


function MetricCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-soft">
      <div className="flex items-center gap-2">
        <div className="grid size-8 place-items-center rounded-xl bg-primary/10">{icon}</div>
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 font-display text-2xl font-extrabold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

function ReasonRow({ emoji, title, body }: { emoji: string; title: string; body: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface/50 px-3.5 py-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-lg">
        {emoji}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="mt-0.5 text-xs leading-relaxed text-muted-foreground line-clamp-2">{body}</div>
      </div>
    </div>
  );
}

function SupermarketPicks({
  supermarkets,
  plan,
  sym,
  t,
}: {
  supermarkets: SupermarketBasket[];
  plan: Plan;
  sym: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!supermarkets.length) return null;
  const sorted = [...supermarkets].sort((a, b) => a.total - b.total);
  const recommended = sorted[0];
  const others = sorted.slice(1);

  const linkFor = (s: SupermarketBasket) => {
    const rid = (s.id in RETAILERS ? s.id : s.id.replace(/-de$|-us$|-it$/, "")) as keyof typeof RETAILERS;
    const retailer = RETAILERS[rid];
    return retailer ? { retailer, href: buildBasketUrl(retailer.id, plan.groceryList) } : null;
  };

  const recLink = linkFor(recommended);
  return (
    <div className="flex flex-col gap-3">
      {/* Recommended — hero card */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent p-4 shadow-soft">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
          <Sparkles className="size-3" /> {t("results.recommended")}
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-serif-display text-xl font-extrabold text-foreground">{recommended.name}</div>
            {recommended.savingsVsMax > 0 && (
              <div className="mt-1 text-sm font-semibold text-success">
                {t("results.save")} {sym}{recommended.savingsVsMax.toFixed(2)}
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="font-display text-2xl font-extrabold text-foreground">{sym}{recommended.total.toFixed(2)}</div>
          </div>
        </div>
        {recLink?.href && (
          <a
            href={recLink.href}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-soft transition hover:opacity-90"
          >
            <ShoppingCart className="size-3.5" />
            {t("results.bestPlace")}
          </a>
        )}
      </div>

      {others.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="self-start text-xs font-semibold text-primary hover:underline"
        >
          {showAll ? "▲" : "▼"} {t("results.moreStores")} ({others.length})
        </button>
      )}

      {showAll && others.map((s) => {
        const lnk = linkFor(s);
        return (
          <div key={s.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface/50 px-3.5 py-2.5">
            <span className="truncate text-sm font-medium text-foreground">{s.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-foreground">{sym}{s.total.toFixed(2)}</span>
              {lnk?.href && (
                <a href={lnk.href} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-primary hover:underline">
                  {t("results.searchBasket")}
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}





function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-lg font-extrabold text-foreground">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function NutritionBadge({ impact }: { impact: "similar" | "better" | "lower" }) {
  const t = useT();
  const cls = impact === "better"
    ? "bg-success/10 text-success"
    : impact === "lower"
    ? "bg-warning/10 text-warning"
    : "bg-primary/10 text-primary";
  return (
    <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {t(`nutrition.${impact}`)}
    </span>
  );
}

const SOURCE_CLS: Record<ProductSource, string> = {
  "google-shopping": "bg-success/15 text-success",
  amazon: "bg-primary/10 text-primary",
  "retailer-search": "bg-primary/10 text-primary",
  estimated: "bg-warning/15 text-warning-foreground",
};

function ConfidenceDot({ value }: { value: number }) {
  const t = useT();
  const cls = value >= 0.8 ? "bg-success" : value >= 0.55 ? "bg-primary" : "bg-warning";
  return (
    <span title={t("results.confidence", { percent: Math.round(value * 100) })} className={`inline-block size-1.5 rounded-full ${cls}`} />
  );
}

function GroceryRow({
  itemName,
  quantity,
  live,
  sym,
  product,
  country,
  city,
  currency,
  loadingProduct,
  pricing,
}: {
  itemName: string;
  quantity: string;
  live: number;
  sym: string;
  product: ItemResults | null;
  country: string;
  city: string;
  currency: string;
  loadingProduct: boolean;
  pricing: PricingResult | null;
}) {
  const t = useT();
  const [compareOpen, setCompareOpen] = useState(false);
  // Primary record drives the displayed price + Buy button. Rule: the
  // headline price MUST refer to whatever the Buy button opens.
  //   - "real"            → price = primary.price (matches the linked PDP)
  //   - "estimated"       → price = primary.price (manual DB average; badged)
  //   - "fallback-search" → no product behind the link, so we do NOT display
  //                          the price-engine estimate as the headline (that
  //                          would imply the search URL leads to that item at
  //                          that price). Estimate is shown as a small
  //                          "~ €X est." annotation instead.
  const primary = product?.primary ?? null;
  const isReal = primary?.kind === "real";
  const isEstimated = primary?.kind === "estimated";
  const headlinePrice =
    isReal ? primary.price
    : isEstimated ? primary.price
    : null; // fallback-search → no trustworthy headline price
  const sideEstimate = !isReal && live > 0 ? live : null;
  // Hide the side estimate if it diverges >50% from a known real price.
  const sideEstimateOk =
    sideEstimate != null &&
    (headlinePrice == null || Math.abs(sideEstimate - headlinePrice) / headlinePrice <= 0.5);
  const fallbackLink = buildShoppingLink({ itemName, city, country });
  const displayRetailer = primary?.retailer ?? fallbackLink.retailerName;
  const retailerSearchUrl =
    primary?.retailerId === "amazon-fresh"
      ? amazonSearchUrl(itemName, country)
      : (primary?.retailerId && RETAILERS[primary.retailerId as keyof typeof RETAILERS]?.searchUrl(itemName))
        ?? fallbackLink.searchUrl;
  const sourceCls = primary ? SOURCE_CLS[primary.source] : null;
  const sourceLabel = primary ? t(`source.${primary.source}`) : null;

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-surface/50 px-3 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <div className="size-1.5 shrink-0 rounded-full bg-primary/40" />
          <span className="truncate font-medium text-foreground">{primary?.productName ?? itemName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">{quantity}</span>
          <span className="min-w-[3ch] text-right font-semibold text-foreground">
            {loadingProduct && !pricing
              ? <Skeleton className="inline-block h-4 w-12 rounded" />
              : headlinePrice != null
                ? `${sym}${headlinePrice.toFixed(2)}`
                : "—"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 pl-3.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>at <span className="font-medium text-foreground">{displayRetailer}</span></span>
          {sourceCls && sourceLabel && (
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-semibold ${sourceCls}`}>
              {primary && <ConfidenceDot value={primary.confidence} />}
              {sourceLabel}
            </span>
          )}
          {sideEstimateOk && (
            <span className="text-muted-foreground/80">· ~{sym}{sideEstimate!.toFixed(2)} {t("results.est")}</span>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pl-3.5">
        {isReal && primary.url && (
          <a
            href={primary.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground transition hover:opacity-90"
          >
            <ExternalLink className="size-3" />
            {t("results.viewProduct")}
          </a>
        )}
        <a
          href={retailerSearchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
        >
          <ExternalLink className="size-3" />
          {isReal ? t("results.openRetailer") : t("buyOnline.searchProduct")}
        </a>
        <a
          href={googleShoppingUrl(itemName, country)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
        >
          <ExternalLink className="size-3" />
          {t("results.buyOnline")}
        </a>
        <a
          href={amazonSearchUrl(itemName, country)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
        >
          <ExternalLink className="size-3" />
          Amazon
        </a>
        <button
          type="button"
          onClick={() => setCompareOpen(true)}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] font-semibold text-foreground transition hover:border-primary hover:text-primary"
        >
          <Store className="size-3" />
          {t("buyOnline.compare")}
        </button>
      </div>
      <CompareOptionsDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        itemName={itemName}
        quantity={quantity}
        country={country}
        city={city}
        currency={currency}
        sym={sym}
        product={product}
        live={live}
      />
    </div>
  );
}

/* ─────────────────── Buy Online: Compare Options dialog ──────────────── */

function CompareOptionsDialog({
  open,
  onOpenChange,
  itemName,
  quantity,
  country,
  city,
  currency,
  sym,
  product,
  live,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemName: string;
  quantity: string;
  country: string;
  city: string;
  currency: string;
  sym: string;
  product: ItemResults | null;
  live: number;
}) {
  const t = useT();
  const options = useMemo(
    () =>
      buildBuyOptions({
        itemName,
        quantity,
        country,
        city,
        currency,
        product,
        estimatedPrice: live > 0 ? live : null,
      }),
    [itemName, quantity, country, city, currency, product, live],
  );
  const cheapest = cheapestOption(options);
  const fastest = fastestDeliveryOption(options);
  // Buy Online v2 ordering: Amazon → delivery marketplaces → online supermarkets → Google Shopping.
  const sections: Array<{ title: string; type: BuyOnlineResult["retailerType"] }> = [
    { title: t("buyOnline.amazon"), type: "amazon" },
    { title: t("buyOnline.delivery"), type: "delivery" },
    { title: t("buyOnline.supermarkets"), type: "supermarket" },
    { title: "Google Shopping", type: "marketplace" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("buyOnline.compareTitle", { item: itemName })}</DialogTitle>
          <DialogDescription>{t("buyOnline.disclaimer")}</DialogDescription>
        </DialogHeader>
        {(cheapest || fastest) && (
          <div className="flex flex-wrap gap-2">
            {cheapest && (
              <BuyHighlight label={t("buyOnline.cheapest")} option={cheapest} sym={sym} />
            )}
            {fastest && (
              <BuyHighlight label={t("buyOnline.fastest")} option={fastest} sym={sym} />
            )}
          </div>
        )}
        <div className="mt-2 flex flex-col gap-4">
          {sections.map((sec) => {
            const rows = options.filter((o) => o.retailerType === sec.type);
            if (rows.length === 0) return null;
            return (
              <div key={sec.type}>
                <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {sec.title}
                </div>
                <div className="flex flex-col gap-1.5">
                  {rows.map((o) => (
                    <BuyOptionRow key={`${o.retailerId}-${o.sourceType}-${o.searchUrl}`} option={o} sym={sym} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BuyHighlight({ label, option, sym }: { label: string; option: BuyOnlineResult; sym: string }) {
  return (
    <a
      href={option.productUrl ?? option.searchUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex-1 min-w-[140px] rounded-2xl border border-primary bg-primary/5 px-3 py-2 text-xs transition hover:bg-primary/10"
    >
      <div className="text-[10px] font-bold uppercase tracking-wide text-primary">{label}</div>
      <div className="mt-0.5 font-semibold text-foreground">{option.retailer}</div>
      {option.price != null && (
        <div className="font-display text-sm font-bold text-foreground">{sym}{option.price.toFixed(2)}</div>
      )}
    </a>
  );
}

function BuyOptionRow({ option, sym }: { option: BuyOnlineResult; sym: string }) {
  const t = useT();
  const isDirect = option.sourceType === "direct_product_url";
  const isEstimate = option.sourceType === "estimated_fallback";
  const label = isDirect ? t("buyOnline.buyProduct") : t("buyOnline.searchProduct");
  // Precise source tag so users can tell a direct product URL from a retailer
  // search, an aggregator (Google Shopping / Amazon) or an estimated fallback.
  const sourceTag = isDirect
    ? t("buyOnline.tag.product")
    : option.sourceType === "retailer_search_url"
    ? t("buyOnline.tag.retailerSearch")
    : option.sourceType === "amazon_search" || option.sourceType === "google_shopping"
    ? t("buyOnline.tag.aggregator")
    : option.sourceType === "delivery_search"
    ? t("buyOnline.tag.deliverySearch")
    : t("buyOnline.tag.estimated");
  const badge = option.price != null && !isEstimate
    ? t("buyOnline.live")
    : isEstimate ? t("buyOnline.estimated") : null;
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-surface/40 px-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{option.retailer}</div>
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {option.price != null ? <span>{sym}{option.price.toFixed(2)}</span> : <span>—</span>}
          {option.etaLabel && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{option.etaLabel}</span>
          )}
          {badge && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{badge}</span>}
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-semibold text-muted-foreground">{sourceTag}</span>
        </div>
      </div>
      {isEstimate ? (
        <span className="text-[10px] text-muted-foreground">—</span>
      ) : (
        <a
          href={option.productUrl ?? option.searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3 py-1 text-[11px] font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <ExternalLink className="size-3" />
          {label}
        </a>
      )}
    </div>
  );
}

/* ─────────────────── Buy Online: full-basket section ─────────────────── */

function BuyOnlineBasket({
  items,
  country,
  city,
  estimatedBasketCost,
  currency,
}: {
  items: { name: string }[];
  country: string;
  city: string;
  estimatedBasketCost: number;
  currency: string;
}) {
  const t = useT();
  const providers = useMemo(
    () => buildBasketProviders(items, country, city, estimatedBasketCost, currency),
    [items, country, city, estimatedBasketCost, currency],
  );
  // Buy Online v2 priority: marketplaces → delivery → online supermarkets.
  const groups: Array<{ title: string; type: "amazon" | "marketplace" | "delivery" | "supermarket" }> = [
    { title: t("buyOnline.amazon"), type: "amazon" },
    { title: t("buyOnline.delivery"), type: "delivery" },
    { title: t("buyOnline.supermarkets"), type: "supermarket" },
  ];
  if (providers.length === 0) {
    return (
      <div className="mt-5 rounded-2xl border border-border bg-surface/50 p-4 text-[11px] text-muted-foreground">
        {t("buyOnline.empty")}
      </div>
    );
  }
  const basketLabel = estimatedBasketCost > 0
    ? `${currency}${estimatedBasketCost.toFixed(0)}`
    : null;
  return (
    <div className="mt-5 rounded-2xl border border-border bg-surface/50 p-4">
      <div className="flex items-center gap-2">
        <ShoppingCart className="size-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">{t("buyOnline.title")}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{t("buyOnline.desc")}</p>
      {basketLabel && (
        <p className="mt-1 text-[11px] font-semibold text-foreground">
          {t("buyOnline.estBasket", { amount: basketLabel })}
        </p>
      )}
      <div className="mt-3 flex flex-col gap-3">
        {groups.map((g) => {
          const rows = providers.filter((p) => p.type === g.type);
          if (rows.length === 0) return null;
          return (
            <div key={g.type}>
              <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {g.title}
              </div>
              <div className="flex flex-col gap-1.5">
                {rows.map((p) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition hover:opacity-90 ${
                      g.type === "amazon"
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background text-foreground hover:border-primary hover:text-primary"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">
                        {p.isDirectBasket
                          ? t("buyOnline.buyAt", { retailer: p.name })
                          : t("buyOnline.searchAt", { retailer: p.name })}
                      </span>
                    </span>
                    {p.etaLabel && (
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        g.type === "amazon"
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-primary/10 text-primary"
                      }`}>
                        {p.etaLabel}
                      </span>
                    )}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-muted-foreground">{t("buyOnline.disclaimer")}</p>
    </div>
  );
}



function CategoryIcon({ category }: { category: string }) {
  const iconClass = "size-4 text-primary";
  if (category === "Proteins") return <Package className={iconClass} />;
  if (category === "Vegetables") return <Leaf className={iconClass} />;
  if (category === "Carbohydrates") return <BarChart3 className={iconClass} />;
  return <Coins className={iconClass} />;
}

function SavingsIcon({ index }: { index: number }) {
  const icons = [
    <Package key={0} className="size-4 text-primary" />,
    <Leaf key={1} className="size-4 text-primary" />,
    <Coins key={2} className="size-4 text-primary" />,
    <TrendingDown key={3} className="size-4 text-primary" />,
  ];
  return icons[index] || <Check className="size-4 text-primary" />;
}

function BudgetRowLine({ label, value, type }: { label: string; value: string; type: "total" | "spend" | "savings" | "over" | "unavailable" }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-display text-base font-bold ${
        type === "savings" ? "text-success" : type === "over" ? "text-accent" : type === "unavailable" ? "text-muted-foreground" : "text-foreground"
      }`}>{value}</span>
    </div>
  );
}

function LowBudget({ plan, profile, onKeep, onOptimize, onRestart }: {
  plan: Plan; profile: UserProfile; onKeep: () => void; onOptimize: () => void; onRestart: () => void;
}) {
  const t = useT();
  const sym = CURRENCIES[profile.currency];
  // Recompute against current pricing if available; for the low-budget view
  // we fall back to the plan's own recommendation fields when present.
  const results = useMemo(
    () => computeResults({ profile, plan, pricing: null }),
    [profile, plan],
  );
  const minB = results.minimumBudget ?? plan.minimumBudget ?? 0;
  const recB = results.recommendedBudget ?? plan.recommendedBudget ?? 0;
  return (
    <div className="flex flex-1 flex-col pb-6">
      <div className="mt-6 grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning">
        <AlertTriangle className="size-7" />
      </div>
      <h2 className="mt-4 font-display text-2xl font-bold">{t("low.title")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        {t("low.subtitle", { household: profile.household || t("low.yourHousehold"), city: profile.city || t("results.yourArea") })}
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <BudgetRow label={t("low.yourBudget")} value={`${sym}${(Number(profile.budget) || 0).toFixed(2)}`} muted />
        {minB > 0 && <BudgetRow label={t("low.estimatedMin")} value={`${sym}${minB.toFixed(2)}`} />}
        {recB > 0 && <BudgetRow label={t("low.recommended")} value={`${sym}${recB.toFixed(2)}`} highlight />}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">{plan.budgetAnalysis}</p>

      <div className="mt-auto flex flex-col gap-3 pt-8">
        <Button onClick={onOptimize} className="h-14 rounded-2xl bg-gradient-primary text-base font-semibold shadow-glow">
          {t("low.optimize")}
        </Button>
        <Button onClick={onKeep} variant="outline" className="h-12 rounded-2xl">
          {t("low.keep")}
        </Button>
        <Button onClick={onRestart} variant="ghost" className="h-12 rounded-2xl text-muted-foreground">
          {t("low.startOver")}
        </Button>
      </div>
    </div>
  );
}

function BudgetRow({ label, value, highlight, muted }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between rounded-2xl border px-5 py-4 ${
      highlight ? "border-primary bg-primary/10" : "border-border bg-card"
    }`}>
      <span className={`text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}>{label}</span>
      <span className={`font-display text-lg font-bold ${highlight ? "text-primary" : "text-foreground"}`}>{value}</span>
    </div>
  );
}

function Card({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h3 className="font-display text-base font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/* ──────────────── CityCombobox (searchable worldwide) ──────────────────── */

function CityCombobox({
  value,
  onTextChange,
  onPick,
}: {
  value: string;
  onTextChange: (v: string) => void;
  onPick: (c: CityResult) => void;
}) {
  const t = useT();
  const [results, setResults] = useState<CityResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = (value ?? "").trim();
    if (q.length < 2) { setResults([]); setOpen(false); setLoading(false); return; }
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      (async () => {
        try {
          const rows = await searchCities(q, ac.signal);
          if (ac.signal.aborted) return;
          setResults(rows);
          setOpen(true);
        } catch {
          if (ac.signal.aborted) return;
          setResults([]);
          setOpen(true);
        } finally {
          if (!ac.signal.aborted) setLoading(false);
        }
      })();
    }, 250);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  return (
    <div className="relative">
      <Input
        autoFocus
        placeholder={t("step.location.placeholder")}
        value={value}
        onChange={(e) => onTextChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        className="h-14 rounded-2xl text-base"
      />
      {open && (
        <div className="relative z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-2xl border border-border bg-card shadow-lg">
          {loading && (
            <div className="px-4 py-3 text-xs text-muted-foreground">{t("location.searching")}</div>
          )}
          {!loading && results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => { onPick(c); setOpen(false); }}
              className="flex w-full items-start gap-2 border-b border-border/50 px-4 py-2 text-left text-sm last:border-b-0 hover:bg-surface/60"
            >
              <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block font-semibold text-foreground">{c.name}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {[c.region, c.country].filter(Boolean).join(", ")}
                  {c.postcode ? ` · ${c.postcode}` : ""}
                </span>
              </span>
            </button>
          ))}
          {!loading && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-muted-foreground">{t("location.noResults")}</div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────── NearbyStoresCard (GPS-driven) ────────────────────────── */

function NearbyStoresCard({ country, city }: { country: string; city: string }) {
  const t = useT();
  const [loc, setLoc] = useState<ResolvedLocation | null>(() => loadResolvedLocation());
  const [radiusKm, setRadiusKm] = useState<1 | 3 | 5 | 10>(5);
  const [stores, setStores] = useState<NearbyStore[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);

  // If we already have a manual city pick but no coords, the resolved
  // location from city pick already includes lat/lon.
  useEffect(() => {
    if (loc) return;
    // Try silent GPS once on mount.
    let alive = true;
    (async () => {
      const fresh = await detectLocation();
      if (!alive) return;
      if (fresh) { saveResolvedLocation(fresh); setLoc(fresh); }
      else setDenied(true);
    })();
    return () => { alive = false; };
  }, [loc]);

  useEffect(() => {
    if (!loc) return;
    let alive = true;
    setLoading(true);
    searchNearbyStores({ lat: loc.lat, lon: loc.lon, radiusM: radiusKm * 1000, limit: 40 })
      .then((rows) => { if (alive) setStores(rows); })
      .catch(() => { if (alive) setStores([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loc, radiusKm]);

  const delivery = useMemo(() => deliveryProvidersFor(country, loc?.city ?? city), [country, city, loc]);

  if (denied && !loc) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-4 text-xs text-muted-foreground">
        {t("nearby.noGps")}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-surface/50 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Store className="size-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{t("nearby.title")}</span>
        </div>
        <div className="flex gap-1">
          {([1, 3, 5, 10] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRadiusKm(r)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                radiusKm === r ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >{r} km</button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {loading
          ? t("nearby.searching")
          : stores
            ? t("nearby.found", { count: String(stores.length), radius: String(radiusKm) })
            : t("nearby.searching")}
      </p>
      {stores && stores.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {stores.slice(0, 8).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl bg-card px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-foreground">{s.name}</div>
                <div className="text-[11px] text-muted-foreground capitalize">
                  {s.category}{s.address ? ` · ${s.address}` : ""}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] font-semibold text-primary">{s.distanceKm.toFixed(1)} km</span>
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20"
                >{t("nearby.directions")}</a>
              </div>
            </li>
          ))}
        </ul>
      )}
      {delivery.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {t("nearby.delivery")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {delivery.map((d) => (
              <a
                key={d.id}
                href={d.url("groceries")}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-card px-3 py-1 text-[11px] font-semibold text-foreground hover:bg-primary/10"
              >{d.name}</a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Heuristic ingredient mapping: scan the dish name for keywords and match
 *  grocery-list rows that contain those keywords. Not a real recipe database,
 *  but useful enough to show the user which basket items power the meal. */
function deriveRecipeIngredients(
  dishName: string,
  groceryList: Plan["groceryList"],
): Plan["groceryList"] {
  const lc = dishName.toLowerCase();
  const keywords: string[] = [];
  const KEYS = [
    "pasta", "rice", "bread", "toast", "oats", "porridge", "quinoa", "noodle", "pizza", "flour",
    "chicken", "salmon", "tuna", "beef", "lamb", "cod", "egg", "lentil", "chickpea", "bean",
    "feta", "parmesan", "yogurt", "cheese",
    "tomato", "salad", "pepper", "mushroom", "carrot", "onion", "garlic", "avocado", "asparagus", "veg",
    "olive oil", "butter", "nut",
  ];
  for (const k of KEYS) if (lc.includes(k)) keywords.push(k);
  if (keywords.length === 0) return [];
  return groceryList.filter((g) => {
    const n = g.name.toLowerCase();
    return keywords.some((k) => n.includes(k));
  });
}

function estimatePrepMinutes(name: string, mealType: "breakfast" | "lunch" | "dinner"): number {
  const lc = name.toLowerCase();
  if (mealType === "breakfast") return /smoothie|toast|yogurt|oats|porridge/.test(lc) ? 8 : 15;
  if (/roast|tagine|risotto|ragu|slow|stew|shepherd|sukiyaki/.test(lc)) return 60;
  if (/grill|pan|stir fry|salad|wrap|bowl/.test(lc)) return 20;
  return mealType === "lunch" ? 15 : 30;
}

function RecipeDetailsDialog({
  open, onOpenChange, entry, plan, profile, results, sym, priceByName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entry: { dayIndex: number; day: string; mealType: "breakfast" | "lunch" | "dinner"; name: string } | null;
  plan: Plan;
  profile: UserProfile;
  results: ComputedResults;
  sym: string;
  priceByName: Map<string, number>;
}) {
  const t = useT();
  const { language } = useI18n();
  const setPlanGlobal = useSession((s) => s.setPlan);
  const household = Math.max(1, parseInt((profile.household || "4").replace("+", ""), 10) || 4);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState(false);

  const isZSD = entry ? /zero spend/i.test(entry.name) : false;

  useEffect(() => {
    if (!entry || isZSD) { setRecipe(null); return; }
    let alive = true;
    setLoading(true);
    setRecipe(null);
    getRecipe(entry.name, {
      servings: household,
      language,
      mealType: entry.mealType,
      allergies: profile.allergies ?? [],
    })
      .then((r) => { if (alive) setRecipe(r); })
      .catch((err) => console.warn("[recipe] load failed", err))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [entry, household, language, isZSD, profile.allergies]);

  if (!entry) return null;

  const totalMeals = plan.mealPlan.length * 3;
  const planPerMeal = totalMeals > 0 ? results.estimatedSpend / totalMeals : 0;

  // Real per-recipe cost: sum priced ingredients matched against the
  // grocery list, then split across the meals that share each ingredient.
  // Falls back to the plan average when nothing matches.
  const recipeCost = (() => {
    if (!recipe || recipe.ingredients.length === 0) return planPerMeal;
    let sum = 0;
    let matched = 0;
    for (const ing of recipe.ingredients) {
      const key = ing.name.toLowerCase().trim();
      const direct = priceByName.get(key);
      const partial = direct ?? Array.from(priceByName.entries())
        .find(([k]) => k.includes(key) || key.includes(k))?.[1];
      if (typeof partial === "number" && partial > 0) {
        // assume each priced ingredient is shared across ~3 meals on average
        sum += partial / 3;
        matched += 1;
      }
    }
    if (matched < Math.max(2, Math.floor(recipe.ingredients.length / 3))) return planPerMeal;
    return sum;
  })();
  const perMeal = recipeCost;
  const perServing = perMeal > 0 ? perMeal / household : 0;
  const perServingLabel = perServing > 0 ? `${sym}${perServing.toFixed(2)}` : t("results.priceUnavailable");
  const totalMin = recipe ? recipe.prepMinutes + recipe.cookMinutes : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
        {/* Hero image */}
        {!isZSD && (
          <div className="relative h-48 w-full overflow-hidden rounded-t-3xl bg-gradient-joy">
            {recipe?.image && (
              // eslint-disable-next-line jsx-a11y/img-redundant-alt
              <img
                src={recipe.image}
                alt={recipe.title}
                className="h-full w-full object-cover"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-4 py-3 text-white">
              <div className="text-[10px] font-semibold uppercase tracking-wide opacity-90">
                {t(`results.mealType.${entry.mealType}`)} · {entry.day}
              </div>
              <div className="text-lg font-bold leading-tight">{recipe?.title || entry.name}</div>
            </div>
          </div>
        )}

        <div className="space-y-4 px-5 pb-5 pt-4">
          <DialogHeader className="space-y-1">
            {isZSD && (
              <>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">
                  {t(`results.mealType.${entry.mealType}`)} · {entry.day}
                </div>
                <DialogTitle className="text-left text-xl">{entry.name}</DialogTitle>
              </>
            )}
            <DialogDescription className="text-left">
              {isZSD ? t("recipe.zsdDescription") : t("recipe.description")}
            </DialogDescription>
          </DialogHeader>

          {loading && !isZSD && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("recipe.loading")}
            </div>
          )}

          {/* Quick-stats */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <Stat label={t("recipe.servings")} value={String(household)} />
            <Stat label={t("recipe.prep")} value={recipe ? `${recipe.prepMinutes}m` : "—"} />
            <Stat label={t("recipe.cook")} value={recipe ? `${recipe.cookMinutes}m` : "—"} />
            <Stat label={t("recipe.total")} value={totalMin ? `${totalMin}m` : "—"} />
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Stat label={t("recipe.difficulty")} value={recipe ? recipe.difficulty : "—"} />
            <Stat label={t("recipe.calories")} value={recipe ? `${recipe.nutrition.calories}` : "—"} />
            <Stat label={t("recipe.perServing")} value={perServingLabel} />
          </div>

          {/* Ingredients */}
          {!isZSD && recipe && recipe.ingredients.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("recipe.ingredients")}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {recipe.ingredients.map((ing, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-surface/50 px-3 py-1.5 text-sm">
                    <span className="truncate text-foreground">{ing.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ing.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Method */}
          {!isZSD && recipe && recipe.steps.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recipe.method")}</h4>
              <ol className="flex flex-col gap-2">
                {recipe.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 rounded-lg bg-surface/50 px-3 py-2 text-sm leading-snug">
                    <span className="shrink-0 size-5 rounded-full bg-primary text-[11px] font-bold text-primary-foreground grid place-items-center">{i + 1}</span>
                    <span className="text-foreground">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Nutrition */}
          {recipe && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recipe.nutritionPerServing")}</h4>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <Stat label={t("recipe.kcal")} value={String(recipe.nutrition.calories)} />
                <Stat label={t("recipe.protein")} value={`${recipe.nutrition.protein}g`} />
                <Stat label={t("recipe.carbs")} value={`${recipe.nutrition.carbs}g`} />
                <Stat label={t("recipe.fat")} value={`${recipe.nutrition.fat}g`} />
              </div>
            </div>
          )}

          {/* Allergens */}
          {recipe && recipe.allergens.length > 0 && (
            <div>
              <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("recipe.allergens")}</h4>
              <div className="flex flex-wrap gap-1.5">
                {recipe.allergens.map((a) => (
                  <span key={a} className="rounded-full bg-butter px-2.5 py-0.5 text-[11px] font-semibold text-foreground">{a}</span>
                ))}
              </div>
            </div>
          )}

          {/* Cost */}
          <div className="rounded-xl bg-surface/60 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("recipe.estCost")}</span>
              <span className="font-bold text-foreground">{sym}{perMeal.toFixed(2)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t("recipe.perServing")}</span>
              <span className="font-bold text-foreground">{perServingLabel}</span>
            </div>
          </div>

          {recipe?.source === "ai" && (
            <p className="text-[10px] text-muted-foreground">{t("recipe.aiGenerated")}</p>
          )}
          {recipe?.sourceUrl && (
            <a href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary underline">{t("recipe.viewOriginal")}</a>
          )}

          {!isZSD && entry && (
            <button
              type="button"
              disabled={swapping}
              onClick={async () => {
                setSwapping(true);
                try {
                  const alt = pickAlternativeMeal(profile, entry.mealType, entry.name);
                  if (alt === entry.name) {
                    toast(t("recipe.noAlternative"));
                    return;
                  }
                  const newPlan = await swapMealSlot(plan, profile, entry.dayIndex, entry.mealType, alt, language);
                  setPlanGlobal(newPlan);
                  toast.success(t("recipe.swappedTo", { alt }));
                  onOpenChange(false);
                } catch (err) {
                  toast.error(friendlyMessage(err));
                } finally {
                  setSwapping(false);
                }
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm font-semibold text-foreground transition hover:bg-primary/20 disabled:opacity-60"
            >
              {swapping ? <Loader2 className="size-4 animate-spin" /> : <Replace className="size-4" />}
              {swapping ? t("recipe.swapping") : t("recipe.swapMeal")}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface/60 p-2">
      <div className="text-[10px] font-semibold uppercase text-muted-foreground truncate">{label}</div>
      <div className="mt-0.5 text-sm font-bold capitalize text-foreground">{value}</div>
    </div>
  );
}

