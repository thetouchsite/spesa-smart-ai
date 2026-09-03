/**
 * Ricerca web per le ricette — con fornitore sostituibile.
 *
 * PERCHÉ ESISTE QUESTA ASTRAZIONE
 * -------------------------------
 * Il prototipo interrogava DuckDuckGo leggendone l'HTML con un'espressione
 * regolare. Verificato a settembre 2026: DuckDuckGo risponde `HTTP 202` con
 * una pagina anti-bot, il regex trova zero risultati, e — poiché 202 supera
 * il controllo `res.ok` — il codice prosegue senza segnalare nulla. Risultato:
 * l'app mostrava ricette inventate dal modello attribuendole a siti reali.
 *
 * Qui il fornitore è dietro un'interfaccia. Oggi gira `ddg` (gratis, funziona
 * quando funziona) e in caso di zero risultati il chiamante lo sa e degrada in
 * modo dichiarato. Attivare Brave è impostare due variabili d'ambiente:
 * nessuna modifica al codice, nessun rilascio.
 *
 *   SEARCH_PROVIDER=brave
 *   BRAVE_SEARCH_API_KEY=...
 */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  id: string;
  /** Restituisce [] quando non trova nulla o quando il fornitore è bloccato. */
  search(query: string): Promise<SearchHit[]>;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

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

/* ───────────────────────── DuckDuckGo (gratis) ───────────────────────── */

const ddgProvider: SearchProvider = {
  id: "ddg",
  async search(query) {
    try {
      const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": UA, Accept: "text/html" },
        signal: AbortSignal.timeout(8_000),
      });
      // 202 = pagina anti-bot. `res.ok` la considera valida, quindi il
      // controllo dev'essere esplicito sullo status, non su `ok`.
      if (res.status !== 200) {
        console.warn(`[search:ddg] status ${res.status} — probabile blocco anti-bot`);
        return [];
      }
      const html = await res.text();
      const hits: SearchHit[] = [];
      const re =
        /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && hits.length < 12) {
        const raw = decodeURIComponent(
          m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, "").split("&")[0],
        );
        hits.push({
          url: raw.startsWith("http") ? raw : `https:${raw}`,
          title: stripTags(m[2]),
          snippet: stripTags(m[3]),
        });
      }
      if (hits.length === 0) console.warn("[search:ddg] 0 risultati — formato cambiato o blocco");
      return hits;
    } catch (err) {
      console.warn("[search:ddg] fallita:", err);
      return [];
    }
  },
};

/* ────────────────────── Brave Search (a pagamento) ────────────────────── */

const braveProvider: SearchProvider = {
  id: "brave",
  async search(query) {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) {
      console.warn("[search:brave] BRAVE_SEARCH_API_KEY assente");
      return [];
    }
    try {
      const url = new URL("https://api.search.brave.com/res/v1/web/search");
      url.searchParams.set("q", query);
      url.searchParams.set("count", "10");
      const res = await fetch(url, {
        headers: { Accept: "application/json", "X-Subscription-Token": key },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        console.warn(`[search:brave] HTTP ${res.status}`);
        return [];
      }
      const json = (await res.json()) as {
        web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
      };
      return (json.web?.results ?? [])
        .filter((r) => r.url)
        .map((r) => ({
          url: r.url!,
          title: stripTags(r.title ?? ""),
          snippet: stripTags(r.description ?? ""),
        }));
    } catch (err) {
      console.warn("[search:brave] fallita:", err);
      return [];
    }
  },
};

const PROVIDERS: Record<string, SearchProvider> = {
  ddg: ddgProvider,
  brave: braveProvider,
};

export function searchProvider(): SearchProvider {
  const id = process.env.SEARCH_PROVIDER ?? "ddg";
  return PROVIDERS[id] ?? ddgProvider;
}

/* ───────────────────────── Lettura della pagina ───────────────────────── */

const TRUSTED_HOSTS = [
  "allrecipes.com", "bbcgoodfood.com", "seriouseats.com", "foodnetwork.com",
  "simplyrecipes.com", "bonappetit.com", "epicurious.com", "nytimes.com",
  "giallozafferano.it", "giallozafferano.com", "kikkoman.com", "justonecookbook.com",
  "minimalistbaker.com", "thespruceeats.com", "delish.com", "tasteofhome.com",
  "jamieoliver.com", "cucchiaio.it", "misya.info", "fattoincasadabenedetta.it",
];

export function rankHits(hits: SearchHit[]): SearchHit[] {
  return hits
    .map((h) => {
      let score = 0;
      try {
        const host = new URL(h.url).hostname.replace(/^www\./, "");
        if (TRUSTED_HOSTS.some((t) => host.endsWith(t))) score += 10;
      } catch {
        return { h, score: -1 };
      }
      if (/recipe|ricetta/i.test(h.title) || /recipe|ricetta/i.test(h.snippet)) score += 3;
      if (/ingredient/i.test(h.snippet)) score += 2;
      return { h, score };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.h);
}

/**
 * Scarica una pagina e la riduce a contesto per il modello.
 *
 * COSTO: il prototipo inviava fino a 85.000 caratteri per ricetta (60k di
 * JSON-LD + 25k di testo). A 21 ricette per piano erano ~0,15 € a piano di
 * soli token in ingresso. I limiti qui sotto tagliano a ~15.000 caratteri
 * senza perdere nulla di utile: la ricetta strutturata sta quasi sempre nel
 * JSON-LD, e il testo serve solo quando manca. Costo per piano: ~0,05 €.
 */
const MAX_JSONLD = 12_000;
const MAX_BODY = 6_000;

export async function fetchPageContext(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(6_000),
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    if (!res.ok) return "";
    const html = await res.text();

    // I blocchi JSON-LD di tipo Recipe sono già strutturati: si tengono per
    // primi e si scartano gli altri (breadcrumb, organizzazione, video).
    const blocks: string[] = [];
    const re = /<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const raw = m[1];
      if (/"@type"\s*:\s*"?\[?[^"\]]*Recipe/i.test(raw)) blocks.unshift(raw);
      else blocks.push(raw);
    }
    const ld = blocks.join("\n").slice(0, MAX_JSONLD);

    const ogImage = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ?? "";

    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_BODY);

    return `URL: ${url}\nOG_IMAGE: ${ogImage}\n\nJSON-LD:\n${ld}\n\nTEXT:\n${body}`;
  } catch (err) {
    console.warn("[search] lettura pagina fallita:", url, err);
    return "";
  }
}
