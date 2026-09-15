/**
 * Chi dichiara le promozioni, e con quale nome di campo?
 *
 * PERCHE' NON BASTA GUARDARE IL CODICE
 * ------------------------------------
 * `readPrices` cerca gia' il listino barrato sotto quattro nomi — listPrice,
 * regularPrice, originalPrice, strikePrice — piu' `discount` come importo. Ma
 * cercare non e' trovare: se un'insegna il prezzo pieno non lo scrive affatto,
 * o lo scrive sotto un nome che non sta in quell'elenco, le sue promozioni non
 * arrivano all'utente e nessuno se ne accorge, perche' una promozione che
 * manca non da' errore: da' solo un prezzo piu' alto.
 *
 * Questo script apre un pugno di schede per insegna e guarda TUTTI i campi che
 * somigliano a un prezzo. Serve a rispondere a due domande diverse:
 *
 *   - questa insegna le promozioni le dichiara?
 *   - se si', con che nome? (e quindi: lo stiamo gia' leggendo?)
 *
 * Il risultato non e' un'opinione sul codice, e' un conteggio su pagine vere.
 */

import { CATALOGHI } from "../dist/catalogo-it.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/** I nomi che `readPrices` cerca oggi. Il resto sarebbe roba che ci sfugge. */
const GIA_LETTI = new Set([
  "price",
  "lowPrice",
  "salePrice",
  "listPrice",
  "regularPrice",
  "originalPrice",
  "strikePrice",
  "discount",
]);

async function prendi(url, ms = 25000) {
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
      headers: { "User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9" },
    });
    return r.ok ? await r.text() : "";
  } catch {
    return "";
  }
}

/** La finestra dove stanno i dati: su Coop il ld+json comincia al byte 838.000. */
function porzione(html) {
  const testa = html.slice(0, 120_000);
  const i = html.search(/application\/ld\+json/i);
  return i < 0 || i < 120_000 ? testa : `${testa}\n${html.slice(i, i + 200_000)}`;
}

/** Tutti i campi che sembrano un prezzo, col loro nome. */
function campiPrezzo(htmlIntero) {
  const html = porzione(htmlIntero);
  const trovati = new Map();
  for (const m of html.matchAll(/"([a-zA-Z_]*(?:[Pp]rice|[Pp]rezzo|[Dd]iscount|[Ss]conto)[a-zA-Z_]*)"\s*:\s*"?(\d+[.,]\d{1,2})"?/g)) {
    const nome = m[1];
    const valore = Number(m[2].replace(",", "."));
    if (!Number.isFinite(valore) || valore <= 0) continue;
    if (!trovati.has(nome)) trovati.set(nome, valore);
  }
  return trovati;
}

const QUANTE = 6;

for (const cat of CATALOGHI.filter((c) => c.paese === "IT" && c.prezzoLeggibile)) {
  // Gli indirizzi si prendono dalla sitemap, come fa il catalogo vero.
  const xml = await prendi(cat.sitemap, 45000);
  let loc = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
  if (/<sitemapindex/i.test(xml)) {
    const figlie = loc.slice(0, 3);
    loc = [];
    for (const f of figlie) {
      const y = await prendi(f, 45000);
      loc.push(...[...y.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim()));
    }
  }
  const prodotti = loc.filter((u) => cat.slug.test(u));
  if (!prodotti.length) {
    console.log(cat.nome.padEnd(18), "nessun prodotto in sitemap");
    continue;
  }

  // Sparsi, non i primi: i primi sono spesso atipici.
  const passo = Math.max(1, Math.floor(prodotti.length / QUANTE));
  const campione = Array.from({ length: QUANTE }, (_, i) => prodotti[i * passo]).filter(Boolean);

  let conPrezzo = 0;
  let conPromo = 0;
  const nomiVisti = new Map();

  for (const u of campione) {
    const html = await prendi(u);
    if (!html) continue;
    const campi = campiPrezzo(html);
    if (!campi.size) continue;
    conPrezzo++;

    const base = campi.get("price") ?? [...campi.values()][0];
    let promo = false;
    for (const [nome, valore] of campi) {
      if (nome === "price") continue;
      nomiVisti.set(nome, (nomiVisti.get(nome) ?? 0) + 1);
      // Un campo che vale PIU' del prezzo e' il listino barrato: c'e' sconto.
      if (valore > base * 1.02) promo = true;
    }
    if (promo) conPromo++;
  }

  const sconosciuti = [...nomiVisti.keys()].filter((n) => !GIA_LETTI.has(n));
  console.log(
    cat.nome.padEnd(18),
    `${conPrezzo}/${campione.length} con prezzo`.padEnd(18),
    `${conPromo} in promozione`.padEnd(18),
    sconosciuti.length ? `campi NON letti: ${sconosciuti.slice(0, 5).join(", ")}` : "tutti i campi gia' letti",
  );
}
