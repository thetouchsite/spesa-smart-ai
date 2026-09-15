/**
 * MealMint Insights — pure derivations from plan + form state.
 *
 * Returns i18n-ready payloads (`key` + `params`) rather than pre-formatted
 * English strings so the UI can render them in the user's selected language.
 */

export interface InsightInput {
  city: string;
  currency: string;
  frequency: "weekly" | "monthly";
  estimatedSpend: number;
  budget: number;
  ingredientsReused: number;
  zeroSpendDay: boolean;
  familySize: number;
}

export interface Insight {
  id: string;
  key: string;
  params: Record<string, string | number>;
}

const LOCAL_WEEKLY_AVG: Record<string, number> = {
  london: 135,
  naples: 95,
  berlin: 110,
  dubai: 165,
};

import { formatMoney } from "@/lib/country";

export function buildInsights(i: InsightInput): Insight[] {
  const fmt = (n: number) => formatMoney(n, i.currency);
  const weeks = i.frequency === "monthly" ? 30 / 7 : 1;
  const weeklySpend = i.estimatedSpend / weeks;
  const avg = LOCAL_WEEKLY_AVG[i.city.toLowerCase()] ?? 120;
  const pctBelow = Math.max(0, Math.round(((avg - weeklySpend) / avg) * 100));

  const annualSavings = Math.max(0, (i.budget - i.estimatedSpend)) *
    (i.frequency === "monthly" ? 12 : 52);
  const zeroSpendWeekly = i.zeroSpendDay
    ? Math.round((weeklySpend / 7) * 100) / 100
    : 0;

  const out: Insight[] = [];
  if (pctBelow > 0) {
    out.push({
      id: "vs-local",
      key: "insight.vsLocal",
      params: { pct: pctBelow, city: i.city || "" },
    });
  }
  if (i.ingredientsReused > 0) {
    out.push({
      id: "reuse",
      key: "insight.reuse",
      params: { count: i.ingredientsReused },
    });
  }
  if (annualSavings > 0) {
    out.push({
      id: "annual",
      key: "insight.annual",
      params: { family: i.familySize, amount: fmt(annualSavings) },
    });
  }
  if (zeroSpendWeekly > 0) {
    out.push({
      id: "zsd",
      key: "insight.zsd",
      params: { amount: fmt(zeroSpendWeekly) },
    });
  }
  return out;
}
