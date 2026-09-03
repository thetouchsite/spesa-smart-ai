/**
 * WhatsApp share — builds a localized share message and a wa.me URL.
 *
 * No external API: wa.me opens the WhatsApp web/app share sheet with the
 * pre-filled text. Works on mobile (deep link) and desktop (WhatsApp Web).
 */

import type { Plan } from "@/lib/models/plan-schema";
import type { UserProfile } from "@/lib/models";
import type { Language } from "@/lib/i18n/translations";
import { formatMoney } from "@/lib/country";

interface ShareInput {
  plan: Plan;
  profile: UserProfile;
  estimatedSpend: number;
  savings: number;
  language: Language;
  appUrl?: string;
}

interface Strings {
  title: string;
  budget: string;
  spend: string;
  savings: string;
  list: string;
  cta: string;
}

const STRINGS: Record<Language, Strings> = {
  en: { title: "🛒 My Spesa Smart plan", budget: "Budget", spend: "Estimated spend", savings: "Expected savings", list: "Shopping list", cta: "Build your own plan" },
  it: { title: "🛒 Il mio piano Spesa Smart", budget: "Budget", spend: "Spesa stimata", savings: "Risparmio previsto", list: "Lista della spesa", cta: "Crea il tuo piano" },
  fr: { title: "🛒 Mon plan Spesa Smart", budget: "Budget", spend: "Dépense estimée", savings: "Économies prévues", list: "Liste de courses", cta: "Créez votre plan" },
  es: { title: "🛒 Mi plan Spesa Smart", budget: "Presupuesto", spend: "Gasto estimado", savings: "Ahorro previsto", list: "Lista de la compra", cta: "Crea tu plan" },
  de: { title: "🛒 Mein Spesa-Smart-Plan", budget: "Budget", spend: "Geschätzte Ausgaben", savings: "Erwartete Ersparnis", list: "Einkaufsliste", cta: "Erstelle deinen Plan" },
};

export function buildWhatsAppMessage(input: ShareInput): string {
  const { plan, profile, estimatedSpend, savings, language, appUrl } = input;
  const s = STRINGS[language] ?? STRINGS.en;
  const fmt = (n: number) => formatMoney(n, profile.currency, language);
  const top = plan.groceryList.slice(0, 12).map((g) => `• ${g.name} (${g.quantity})`).join("\n");
  const url = appUrl || (typeof window !== "undefined" ? window.location.origin : "https://spesa-smart-ai-pilot.lovable.app");
  const budget = Number(profile.budget) || 0;
  return [
    s.title,
    "",
    `${s.budget}: ${fmt(budget)}`,
    `${s.spend}: ${fmt(estimatedSpend)}`,
    `${s.savings}: ${fmt(Math.max(0, savings))}`,
    "",
    `${s.list}:`,
    top,
    "",
    `👉 ${s.cta}: ${url}`,
  ].join("\n");
}

export function buildWhatsAppUrl(input: ShareInput): string {
  return `https://wa.me/?text=${encodeURIComponent(buildWhatsAppMessage(input))}`;
}
