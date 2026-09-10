/**
 * Le 118 insegne del censimento, aperte una per una.
 *
 * PERCHÉ NON BASTA IL CSV
 * -----------------------
 * Il CSV dice «prezzi visibili: sì» per 117 righe su 118, ma è una
 * dichiarazione fatta a mano: nessuno può fidarsene per promettere qualcosa a
 * un cliente. Qui ogni indirizzo viene aperto davvero e si guarda cosa
 * risponde.
 *
 * COSA SI PUÒ E COSA NON SI PUÒ CONCLUDERE
 * ----------------------------------------
 * Aprire la home dice con certezza se il sito ESISTE e se ci lascia entrare.
 * Non dice se i prezzi si vedono: quasi tutti i supermercati moderni sono
 * applicazioni che si disegnano nel browser, e la pagina che arriva al server
 * è un guscio vuoto. Quindi "prezzo trovato" è una buona notizia; "prezzo non
 * trovato" NON è una cattiva notizia, è un non-so.
 *
 * Gli esiti sono quattro, e vanno letti così:
 *
 *   prezzi-in-chiaro  la pagina contiene già dei prezzi: certezza
 *   sito-vivo         risponde e ci lascia entrare, prezzi da confermare
 *   bloccato          403/429: il sito c'è, respinge i robot, non noi utenti
 *   irraggiungibile   404, dominio morto, timeout: questo è un problema vero
 *
 * Uso:  node scripts/verifica-insegne.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";

const CSV = process.argv[2] ?? "C:/Users/anton/Downloads/supermercati_online_europa_2026.csv";

/**
 * Ci presentiamo come un browser.
 *
 * Non è un trucco per entrare dove non si potrebbe: è la stessa richiesta che
 * farebbe l'utente. Dichiararsi come uno script farebbe rispondere 403 a siti
 * che a una persona si aprono, e misureremmo il nostro travestimento invece
 * del loro sito.
 */
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Un prezzo scritto in una qualunque delle valute che ci interessano. */
const PREZZO = /(?:€|£|CHF|kr|zł|Kč|Ft|lei|лв|₺|₴|₽|\bEUR\b|\bGBP\b)\s?\d{1,4}[.,]\d{2}|\d{1,4}[.,]\d{2}\s?(?:€|£|CHF|kr|zł|Kč|Ft|lei|лв|₺|₴|₽)/;

function righeCsv(testo) {
  // Il file ha campi con virgole dentro le virgolette: un `split(",")` secco
  // spezzerebbe le note e sposterebbe tutte le colonne.
  const righe = [];
  let campo = "", riga = [], dentroVirgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (dentroVirgolette) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') dentroVirgolette = false;
      else campo += c;
    } else if (c === '"') dentroVirgolette = true;
    else if (c === ",") { riga.push(campo); campo = ""; }
    else if (c === "\n") { riga.push(campo); righe.push(riga); riga = []; campo = ""; }
    else if (c !== "\r") campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  const intestazione = righe.shift().map((h) => h.replace(/^\uFEFF/, "").trim());
  return righe
    .filter((r) => r.length >= intestazione.length && r[0])
    .map((r) => Object.fromEntries(intestazione.map((h, i) => [h, (r[i] ?? "").trim()])));
}

async function apri(url) {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "it,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(25_000),
    });
    const ms = Date.now() - t0;

    if (res.status === 403 || res.status === 429) {
      return { esito: "bloccato", stato: res.status, ms, finale: res.url };
    }
    if (!res.ok) {
      return { esito: "irraggiungibile", stato: res.status, ms, finale: res.url };
    }

    // Solo l'inizio: bastano per trovare dei prezzi e non si scaricano
    // megabyte di pagina per ogni sito.
    const html = (await res.text()).slice(0, 400_000);
    const prezzo = html.match(PREZZO);
    // Un catalogo con i prezzi lo si riconosce anche dai dati strutturati:
    // è la stessa cosa che legge il nostro verificatore in produzione.
    const strutturati = /"@type"\s*:\s*"(?:Product|Offer)"|itemprop=["']price["']/i.test(html);

    return {
      esito: prezzo || strutturati ? "prezzi-in-chiaro" : "sito-vivo",
      stato: res.status,
      ms,
      finale: res.url,
      esempio: prezzo ? prezzo[0].trim() : strutturati ? "dati strutturati" : "",
      byte: html.length,
    };
  } catch (err) {
    const m = String(err?.message ?? err);
    return {
      esito: "irraggiungibile",
      stato: /timed? ?out|abort/i.test(m) ? "timeout" : "rete",
      ms: Date.now() - t0,
      dettaglio: m.slice(0, 70),
    };
  }
}

/** Otto alla volta: rispettoso per i siti, e centodiciotto controlli in un minuto. */
async function aBrani(elementi, quantiInsieme, lavoro) {
  const esiti = [];
  for (let i = 0; i < elementi.length; i += quantiInsieme) {
    esiti.push(...(await Promise.all(elementi.slice(i, i + quantiInsieme).map(lavoro))));
  }
  return esiti;
}

const SIMBOLO = {
  "prezzi-in-chiaro": "PREZZI",
  "sito-vivo": "vivo  ",
  bloccato: "BLOCCA",
  irraggiungibile: "MORTO ",
};

async function main() {
  const righe = righeCsv(readFileSync(CSV, "utf8"));
  console.log(`${righe.length} insegne da controllare\n`);

  const esiti = await aBrani(righe, 8, async (r) => {
    const url = r.URL;
    if (!/^https?:\/\//.test(url)) {
      return { ...r, esito: "irraggiungibile", stato: "senza indirizzo" };
    }
    const e = await apri(url);
    console.log(
      `${SIMBOLO[e.esito]}  ${r.Paese.padEnd(24).slice(0, 24)} ${r.Negozio_Piattaforma.padEnd(30).slice(0, 30)} ` +
        `${String(e.stato).padStart(7)}  ${e.esempio ?? e.dettaglio ?? ""}`.slice(0, 130),
    );
    return { paese: r.Paese, negozio: r.Negozio_Piattaforma, url, dichiarato: r.Prezzi_visibili, ...e };
  });

  const conta = (v) => esiti.filter((e) => e.esito === v).length;
  console.log("\n" + "═".repeat(68));
  console.log("  ESITO");
  console.log("═".repeat(68));
  console.log(`  prezzi già in chiaro nella pagina   ${conta("prezzi-in-chiaro")}`);
  console.log(`  sito vivo, prezzi da confermare     ${conta("sito-vivo")}`);
  console.log(`  respinge i robot (403/429)          ${conta("bloccato")}`);
  console.log(`  IRRAGGIUNGIBILE                     ${conta("irraggiungibile")}`);
  const buoni = conta("prezzi-in-chiaro") + conta("sito-vivo") + conta("bloccato");
  console.log(`\n  in piedi: ${buoni}/${esiti.length} (${Math.round((buoni / esiti.length) * 100)}%)`);

  const rotti = esiti.filter((e) => e.esito === "irraggiungibile");
  if (rotti.length) {
    console.log("\n  DA CORREGGERE NEL CENSIMENTO:");
    for (const r of rotti) console.log(`    ${r.paese} — ${r.negozio}  (${r.stato})  ${r.url}`);
  }

  const dove = new URL("../diario/verifica-insegne.json", import.meta.url);
  writeFileSync(dove, JSON.stringify(esiti, null, 2), "utf8");
  console.log(`\nDettaglio in ${decodeURIComponent(dove.pathname)}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
