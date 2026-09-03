/**
 * Google Shopping provider — SerpAPI server function.
 *
 * Activates automatically when `SERPAPI_KEY` is configured as a Cloud secret.
 * Without the key the function returns `{ ok: false, reason: "no_key" }` so
 * the orchestrator falls through to retailer-search / manual-estimate.
 *
 * SerpAPI docs: https://serpapi.com/google-shopping-api
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  query: z.string().min(1).max(120),
  country: z.string().min(2).max(8),
  language: z.string().min(2).max(8).optional(),
  limit: z.number().int().min(1).max(20).default(8),
});

export interface SerpShoppingItem {
  title: string;
  price: number | null;
  currency: string | null;
  source: string;
  link: string;
  productLink: string | null;
  thumbnail: string | null;
}

export type SerpShoppingResult =
  | { ok: true; items: SerpShoppingItem[] }
  | { ok: false; reason: "no_key" | "rate_limited" | "upstream_error"; message?: string };

/** Map ISO country → SerpAPI `gl`/`hl` defaults. */
const COUNTRY_LOCALE: Record<string, { gl: string; hl: string; currency: string }> = {
  IT: { gl: "it", hl: "it", currency: "EUR" },
  UK: { gl: "uk", hl: "en", currency: "GBP" },
  GB: { gl: "uk", hl: "en", currency: "GBP" },
  DE: { gl: "de", hl: "de", currency: "EUR" },
  FR: { gl: "fr", hl: "fr", currency: "EUR" },
  ES: { gl: "es", hl: "es", currency: "EUR" },
  US: { gl: "us", hl: "en", currency: "USD" },
  AE: { gl: "ae", hl: "en", currency: "AED" },
};

const CURRENCY_SYMBOL: Record<string, string> = {
  "€": "EUR", "£": "GBP", "$": "USD", "د.إ": "AED", "AED": "AED",
};

function parsePrice(raw: string | number | undefined | null): { price: number | null; currency: string | null } {
  if (raw == null) return { price: null, currency: null };
  if (typeof raw === "number") return { price: raw, currency: null };
  const s = String(raw).trim();
  // SerpAPI returns e.g. "€2.49" / "£1.20" / "$3.49"
  const symMatch = s.match(/[€£$]|د\.إ|AED/);
  const numMatch = s.replace(/[^0-9.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(numMatch);
  return {
    price: Number.isFinite(n) && n > 0 ? n : null,
    currency: symMatch ? CURRENCY_SYMBOL[symMatch[0]] ?? null : null,
  };
}

export const searchGoogleShopping = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<SerpShoppingResult> => {
    const key = process.env.SERPAPI_KEY;
    if (!key) return { ok: false, reason: "no_key" };

    const locale = COUNTRY_LOCALE[data.country.toUpperCase()] ?? COUNTRY_LOCALE.UK;
    const url = new URL("https://serpapi.com/search.json");
    url.searchParams.set("engine", "google_shopping");
    url.searchParams.set("q", data.query);
    url.searchParams.set("gl", locale.gl);
    url.searchParams.set("hl", data.language ?? locale.hl);
    url.searchParams.set("num", String(data.limit));
    url.searchParams.set("api_key", key);

    try {
      const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
      if (res.status === 429) return { ok: false, reason: "rate_limited" };
      if (!res.ok) {
        return { ok: false, reason: "upstream_error", message: `HTTP ${res.status}` };
      }
      const json = (await res.json()) as {
        shopping_results?: Array<{
          title?: string;
          price?: string;
          extracted_price?: number;
          source?: string;
          link?: string;
          product_link?: string;
          thumbnail?: string;
        }>;
      };
      const raw = json.shopping_results ?? [];
      const items: SerpShoppingItem[] = raw.slice(0, data.limit).map((r) => {
        const { price, currency } = parsePrice(r.extracted_price ?? r.price ?? null);
        return {
          title: r.title ?? data.query,
          price,
          currency: currency ?? locale.currency,
          source: r.source ?? "",
          link: r.product_link ?? r.link ?? "",
          productLink: r.product_link ?? null,
          thumbnail: r.thumbnail ?? null,
        };
      });
      return { ok: true, items };
    } catch (err) {
      return {
        ok: false,
        reason: "upstream_error",
        message: err instanceof Error ? err.message : "unknown",
      };
    }
  });
