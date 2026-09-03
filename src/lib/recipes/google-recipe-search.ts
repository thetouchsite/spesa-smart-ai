/** Google-style web recipe search.
 *
 *  Pipeline:
 *    1. Search the web (DuckDuckGo HTML — no API key) for trusted recipe results.
 *    2. Fetch the top result page text.
 *    3. Have the AI extract a complete, structured `Recipe` from that page,
 *       preserving the real source URL and website name.
 *    4. If extraction fails or no usable result is found, fall back to an
 *       AI-generated recipe marked `web-ai` ("AI-assisted from web result").
 *
 *  All work runs server-side via a TanStack server function so we can hit
 *  external sites without CORS and keep the API key off the client.
 */

import { createServerFn } from "@tanstack/react-start";
import { generateText, Output } from "ai";
import { z } from "zod";

const TRUSTED_HOSTS = [
  "allrecipes.com",
  "bbcgoodfood.com",
  "seriouseats.com",
  "foodnetwork.com",
  "simplyrecipes.com",
  "bonappetit.com",
  "epicurious.com",
  "nytimes.com",
  "giallozafferano.it",
  "giallozafferano.com",
  "kikkoman.com",
  "justonecookbook.com",
  "minimalistbaker.com",
  "thespruceeats.com",
  "delish.com",
  "tasteofhome.com",
  "jamieoliver.com",
];

const Input = z.object({
  dishName: z.string().min(1),
  cuisine: z.string().optional(),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  servings: z.number().min(1).max(12).default(4),
  language: z.string().default("en"),
  country: z.string().default(""),
  city: z.string().default(""),
  allergies: z.array(z.string()).default([]),
});

const RecipeOut = z.object({
  title: z.string(),
  sourceWebsite: z.string(),
  sourceUrl: z.string(),
  image: z.string(),
  servings: z.number(),
  prepMinutes: z.number(),
  cookMinutes: z.number(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  cuisine: z.string(),
  ingredients: z.array(z.object({ name: z.string(), quantity: z.string() })),
  steps: z.array(z.string()),
  nutrition: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  }),
  allergens: z.array(z.string()),
  extractionMode: z.enum(["extracted", "ai-assisted"]),
});

export type GoogleRecipeResult = z.infer<typeof RecipeOut>;

interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

async function ddgSearch(query: string): Promise<SearchHit[]> {
  try {
    const res = await fetch(
      `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept": "text/html",
        },
      }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const hits: SearchHit[] = [];
    // DuckDuckGo HTML result blocks.
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) && hits.length < 12) {
      const raw = decodeURIComponent(m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0]);
      const url = raw.startsWith("http") ? raw : `https:${raw}`;
      hits.push({
        url,
        title: stripTags(m[2]),
        snippet: stripTags(m[3]),
      });
    }
    return hits;
  } catch (err) {
    console.warn("[google-recipe-search] ddg failed:", err);
    return [];
  }
}

function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreHit(h: SearchHit): number {
  try {
    const host = new URL(h.url).hostname.replace(/^www\./, "");
    let s = 0;
    if (TRUSTED_HOSTS.some((t) => host.endsWith(t))) s += 10;
    if (/recipe/i.test(h.title) || /recipe/i.test(h.snippet)) s += 3;
    if (/ingredient/i.test(h.snippet)) s += 2;
    return s;
  } catch {
    return 0;
  }
}

async function fetchPageText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6_000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept": "text/html",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Prefer JSON-LD Recipe blocks when present — they're already structured.
    const jsonLdBlocks: string[] = [];
    const ldRe = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = ldRe.exec(html))) jsonLdBlocks.push(m[1]);
    const ld = jsonLdBlocks.join("\n").slice(0, 60_000);

    // Extract OpenGraph image
    const ogImg = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ?? "";

    // Strip the rest down to readable text.
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 25_000);

    return `URL: ${url}\nOG_IMAGE: ${ogImg}\n\nJSON-LD:\n${ld}\n\nTEXT:\n${body}`;
  } catch (err) {
    console.warn("[google-recipe-search] fetch failed:", url, err);
    return "";
  }
}

function buildQuery(dishName: string, cuisine?: string, mealType?: string): string {
  const parts = [dishName.trim(), "recipe", "ingredients", "instructions"];
  if (cuisine) parts.unshift(cuisine);
  if (mealType && !dishName.toLowerCase().includes(mealType)) parts.push(mealType);
  return parts.join(" ");
}

export const searchGoogleRecipe = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }): Promise<GoogleRecipeResult | null> => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      console.warn("[google-recipe-search] LOVABLE_API_KEY missing — skipping web search");
      return null;
    }

    const query = buildQuery(data.dishName, data.cuisine, data.mealType);
    const hits = await ddgSearch(query);
    const ranked = hits
      .map((h) => ({ h, s: scoreHit(h) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.h);

    // Try the top 2 trusted-ish hits for page extraction.
    let pageContext = "";
    let chosenHit: SearchHit | null = null;
    for (const hit of ranked.slice(0, 3)) {
      const text = await fetchPageText(hit.url);
      if (text && text.length > 1500) {
        pageContext = text;
        chosenHit = hit;
        break;
      }
    }

    const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
    const gateway = createLovableAiGatewayProvider(key);

    const sharedRules = `
Servings: ${data.servings}.
CRITICAL LANGUAGE: Write ALL output — title, ingredient names, step instructions, allergen labels — in language code "${data.language}". If the source page or dish name is in another language, translate it naturally. Never emit English text when the target language is not English.
${data.country ? `COUNTRY CONTEXT: household is in ${data.country}${data.city ? ` (${data.city})` : ""}. Adapt ingredients, brands, cuts and preparations to what is common and easily bought in ${data.country}. Prefer the local/native version of the dish.` : ""}
Avoid allergens/diets: ${data.allergies.join(", ") || "none"}.
${data.cuisine ? `Cuisine constraint: stay strictly within ${data.cuisine} tradition.` : ""}
Ingredients MUST be a complete realistic list with metric quantities (g, ml, pcs).
Steps MUST be 4-10 numbered, cookable instructions for a home cook.
Nutrition is approximate per serving.
If the dish is "Pizza Margherita" the recipe MUST include: flour, water, yeast, tomato sauce (or San Marzano tomatoes), mozzarella, fresh basil, olive oil, salt.
Return JSON matching the schema exactly.`;

    try {
      if (pageContext && chosenHit) {
        const host = new URL(chosenHit.url).hostname.replace(/^www\./, "");
        const prompt = `You extract structured recipes from a web page.

Source URL: ${chosenHit.url}
Source website: ${host}

Below is the raw text/JSON-LD of the page. Convert it into a COMPLETE cookable recipe.
Use the page's real title, real ingredients with real quantities, real steps, and real image URL when present (prefer JSON-LD or OG_IMAGE). Fill nutrition with a realistic estimate if absent.
Set extractionMode = "extracted", sourceUrl = "${chosenHit.url}", sourceWebsite = "${host}", image = OG_IMAGE or "", and cuisine = the best matching cuisine label or "".
${sharedRules}

PAGE:
${pageContext}`;
        const { experimental_output } = await generateText({
          model: gateway("google/gemini-3-flash-preview"),
          experimental_output: Output.object({ schema: RecipeOut }),
          prompt,
        });
        if (experimental_output.ingredients.length >= 3 && experimental_output.steps.length >= 3) {
          return experimental_output;
        }
      }
    } catch (err) {
      console.warn("[google-recipe-search] extraction failed:", err);
    }

    // AI-assisted fallback — still grounded by the search snippets so it
    // matches what a real cook would find online.
    try {
      const snippetSummary = ranked
        .slice(0, 5)
        .map((h, i) => `${i + 1}. ${h.title} — ${h.snippet} (${h.url})`)
        .join("\n");
      const top = ranked[0];
      const host = top ? new URL(top.url).hostname.replace(/^www\./, "") : "web";
      const prompt = `Write a complete, authentic recipe for "${data.dishName}".
You searched the web with query "${query}" and got these results:

${snippetSummary || "(no results)"}

Synthesize a real, classic version of this dish as a home cook would prepare it from the best of these sources.
Set extractionMode = "ai-assisted", sourceWebsite = "${host}", sourceUrl = "${top?.url ?? ""}", image = "", and cuisine = the best matching cuisine label or "".
${sharedRules}`;
      const { experimental_output } = await generateText({
        model: gateway("google/gemini-3-flash-preview"),
        experimental_output: Output.object({ schema: RecipeOut }),
        prompt,
      });
      return experimental_output;
    } catch (err) {
      console.warn("[google-recipe-search] AI fallback failed:", err);
      return null;
    }
  });
