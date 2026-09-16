/**
 * La raccolta vera: ogni indirizzo, contato uno per uno.
 *
 * COSA FA DI DIVERSO DALLA RICOGNIZIONE
 * -------------------------------------
 * `scoperta-europa.mjs` risponde a «questa insegna vale la pena?», e per
 * rispondere CAMPIONA: apre sei figlie di un indice, conta, moltiplica. E'
 * giusto cosi' — serve a scegliere, e in quaranta minuti passa tutta Europa.
 *
 * Ma una stima non si porta a una call. «Circa ventottomila prodotti, credo»
 * e' esattamente il genere di numero che non regge una domanda.
 *
 * Qui invece si scende in TUTTO l'albero: ogni sitemap figlia, ogni figlia
 * della figlia, ogni indirizzo dentro, tolti i doppioni. Il numero che esce
 * non e' una proporzione: e' quanti indirizzi di prodotto quell'insegna
 * pubblica. Per questo ci vogliono ore invece di minuti.
 *
 * E gli indirizzi non si buttano: finiscono compressi in `diario/raccolto/`.
 * Chi vuole verificare apre il file e li prova.
 *
 * SUI PREZZI
 * ----------
 * Non si apre un milione di pagine — sarebbe scortese verso i negozi e
 * inutile per noi, visto che il prezzo si rilegge comunque quando l'utente
 * genera il piano. Si aprono TRENTA schede sparse per insegna, e da quelle si
 * misura la quota che il prezzo lo dichiara.
 *
 * Quindi il totale onesto e' a due voci, e vanno dette tutt'e due:
 *
 *   indirizzi      contati uno per uno, pubblicati dai negozi stessi
 *   prezzi         misurati su un campione, non su ogni singola scheda
 *
 * QUANDO SI FERMA
 * ---------------
 * Da sola, quando ha finito. Oppure al tetto di ore passato con `--ore`: si
 * lascia la notte e la mattina c'e' quel che e' entrato nel tempo dato, con le
 * insegne piu' grosse per prime — cosi' se il tempo finisce, manca la coda.
 *
 * Salva dopo ogni insegna. Rilanciandola riprende, e quelle gia' fatte le
 * salta.
 *
 * Uso:
 *   node scripts/raccolta-europa.mjs --ore 4
 *   node scripts/raccolta-europa.mjs --solo ES,PT --ore 1
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

const INTESTAZIONE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9,it;q=0.8",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Upgrade-Insecure-Requests": "1",
};

/** Quante schede aprire per misurare quanto rende un'insegna. */
const CAMPIONE = 30;
/** Quante sitemap aprire al massimo per insegna: oltre, c'e' un ciclo. */
const TETTO_SITEMAP = 400;
/** Quanti indirizzi tenere per insegna. Mezzo milione e' gia' oltre il vero. */
const TETTO_INDIRIZZI = 500_000;

const attendi = (ms) => new Promise((r) => setTimeout(r, ms));

async function prendi(url, { binario = false, ms = 40_000 } = {}) {
  try {
    const res = await fetch(url, {
      headers: INTESTAZIONE,
      redirect: "follow",
      signal: AbortSignal.timeout(ms),
    });
    if (!res.ok) return null;
    return binario ? Buffer.from(await res.arrayBuffer()) : await res.text();
  } catch {
    return null;
  }
}

async function scarica(url) {
  if (url.endsWith(".gz")) {
    const b = await prendi(url, { binario: true, ms: 70_000 });
    if (!b) return null;
    try {
      return gunzipSync(b).toString("utf8");
    } catch {
      return null;
    }
  }
  return prendi(url, { ms: 70_000 });
}

const indirizzi = (x) => [...x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);

const SEGMENTI_PRODOTTO =
  /\/(p|pd|dp|prod|product|products|producto|productos|produkt|produkte|produkty|prodotto|prodotti|produit|produits|artikel|artikelen|item|items|urun|toode|tooted|prece|preces|prekes|proizvod|termek|izdelek|vara|varer|varor|tuote|tuotteet|pdp|proizvodi)\//i;

const paScheda = (u) =>
  SEGMENTI_PRODOTTO.test(u) || /[a-z]{3,}(?:-[a-z0-9]{2,}){2,}[/_-]\d{5,}/i.test(u);

const FUORI_TEMA =
  /recipe|recept|rezept|ricett|blog|news|article|video|magazin|hjelp|help|service|klantenservice|store-?locator|filial|winkel|jobs|career|press|sitemap-?misc/i;

/**
 * Tutto l'albero, senza campionare.
 *
 * Si va in ampiezza e non in profondita': un indice puo' avere cento figlie e
 * scendere ricorsivamente sulla prima significa arrivare tardissimo alle
 * altre. In ampiezza, se il tempo finisce, cio' che si e' preso e' sparso su
 * tutto il catalogo invece che ammucchiato in un angolo.
 */
async function raccogli(radice, scadenza) {
  const trovati = new Set();
  const daAprire = [radice];
  const visti = new Set();
  let sitemapAperte = 0;

  while (daAprire.length > 0) {
    if (Date.now() > scadenza) break;
    if (sitemapAperte >= TETTO_SITEMAP || trovati.size >= TETTO_INDIRIZZI) break;

    const url = daAprire.shift();
    if (visti.has(url)) continue;
    visti.add(url);

    const xml = await scarica(url);
    sitemapAperte++;
    // Una pausa fra un file e l'altro: sono cataloghi interi, non una pagina.
    await attendi(250);
    if (!xml) continue;

    const voci = indirizzi(xml);
    if (voci.length === 0) continue;

    if (/<sitemapindex/i.test(xml)) {
      for (const f of voci) if (!FUORI_TEMA.test(f) && !visti.has(f)) daAprire.push(f);
      continue;
    }
    for (const u of voci) {
      if (paScheda(u)) trovati.add(u);
      if (trovati.size >= TETTO_INDIRIZZI) break;
    }
  }
  return { indirizzi: [...trovati], sitemapAperte, finita: daAprire.length === 0 };
}

function leggiPrezzo(html) {
  const schemi = [
    /"price"\s*:\s*"?([\d.,]+)"?/i,
    /"lowPrice"\s*:\s*"?([\d.,]+)"?/i,
    /"salePrice"\s*:\s*"?([\d.,]+)"?/i,
    /itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i,
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["'][^>]+content=["']\s*([\d.,]+)/i,
    /"(?:currentPrice|finalPrice|unitPrice|sellingPrice|grossPrice)"\s*:\s*"?([\d.,]+)"?/i,
    /data-(?:product-)?price(?:-amount)?=["']\s*([\d.,]+)["']/i,
  ];
  for (const re of schemi) {
    const m = html.match(re);
    if (!m) continue;
    const n = Number.parseFloat(String(m[1]).replace(",", "."));
    if (Number.isFinite(n) && n > 0.01 && n < 100_000) return n;
  }
  return null;
}

/** Trenta schede sparse su tutto il catalogo, non le prime trenta. */
async function misuraPrezzi(tutti) {
  const passo = Math.max(1, Math.floor(tutti.length / CAMPIONE));
  const campione = [];
  for (let i = 0; i < tutti.length && campione.length < CAMPIONE; i += passo) {
    campione.push(tutti[i]);
  }

  let aperte = 0;
  let conPrezzo = 0;
  const esempi = [];
  for (const u of campione) {
    const html = await prendi(u, { ms: 30_000 });
    if (html && html.length > 2000) {
      aperte++;
      const p = leggiPrezzo(html);
      if (p != null) {
        conPrezzo++;
        if (esempi.length < 5) esempi.push({ url: u, prezzo: p });
      }
    }
    await attendi(350);
  }
  return { campione: campione.length, aperte, conPrezzo, esempi };
}

/* ══════════════════════════════════════════════════════════════════ */

const DOVE = "diario/raccolta-europa.json";
const STATO = "diario/raccolta-stato.json";
const CARTELLA = "diario/raccolto";

const orologio = (s) =>
  `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;

function scriviStato(avvio, scadenza, esiti, totale) {
  const trascorsi = (Date.now() - avvio) / 1000;
  const utili = esiti.filter((e) => e.indirizzi > 0);
  const raccolti = utili.reduce((n, e) => n + e.indirizzi, 0);

  const perPaese = {};
  for (const e of utili) {
    perPaese[e.paese] ??= { insegne: 0, indirizzi: 0 };
    perPaese[e.paese].insegne++;
    perPaese[e.paese].indirizzi += e.indirizzi;
  }

  writeFileSync(
    STATO,
    JSON.stringify(
      {
        avvio: new Date(avvio).toISOString(),
        aggiornato: new Date().toISOString(),
        trascorso: orologio(trascorsi),
        siFermaAlle: new Date(scadenza).toISOString(),
        restano: orologio(Math.max(0, (scadenza - Date.now()) / 1000)),
        avanzamento: `${esiti.length}/${totale}`,
        INDIRIZZI_RACCOLTI: raccolti,
        insegneRaccolte: utili.length,
        paesi: Object.keys(perPaese).length,
        schedeAperteDavvero: esiti.reduce((n, e) => n + (e.aperte ?? 0), 0),
        prezziLettiDavvero: esiti.reduce((n, e) => n + (e.conPrezzo ?? 0), 0),
        ritmoAllOra: trascorsi > 120 ? Math.round((raccolti / trascorsi) * 3600) : null,
        perPaese,
        ultime: esiti.slice(-8).map((e) => ({
          paese: e.paese,
          insegna: e.insegna,
          indirizzi: e.indirizzi,
          resa: e.campione ? `${Math.round((e.conPrezzo / e.campione) * 100)}%` : null,
          minuti: Math.round(e.secondi / 60),
        })),
      },
      null,
      2,
    ),
    "utf8",
  );
}

/** Le insegne che la ricognizione ha promosso. */
function promosse() {
  if (!existsSync("diario/scoperta-europa.json")) return [];
  return JSON.parse(readFileSync("diario/scoperta-europa.json", "utf8"))
    .filter((e) => e.esito === "PRODOTTI" && e.sitemap && e.apertura >= 0.5)
    .map((e) => ({ paese: e.paese, insegna: e.nome, sitemap: e.sitemap, atteso: e.stimati }));
}

/**
 * Le fonti che l'app gia' usa: si raccolgono anche quelle, per il conto vero.
 *
 * Si leggono DAL DATABASE, che dal 16 settembre 2026 e' l'unico posto dove
 * l'elenco vive. Prima si leggevano dal sorgente TypeScript a colpi di
 * espressione regolare, perche' `node` un `.ts` non lo apre e `dist/` poteva
 * essere vecchio; adesso quel file i dati non ce li ha piu'.
 *
 * Se il database non risponde si torna a mani vuote e il giro prosegue senza
 * le fonti gia' in uso: e' peggio, ma e' onesto. La prima versione le perdeva
 * in silenzio dentro un `try`, e cinquantasette insegne sparivano dal totale
 * della notte senza che nessuno se ne accorgesse.
 */
async function fontiInUso() {
  try {
    const { caricaFontiDalDb, tutteLeFonti } = await import("../dist/api/catalogo-fonti.js");
    const quante = await caricaFontiDalDb();
    if (quante === 0) {
      console.warn("[raccolta] il database non ha insegne: giro senza le fonti in uso");
      return [];
    }
    return tutteLeFonti().map((f) => ({
      paese: f.paese,
      insegna: f.insegna,
      sitemap: f.sitemap,
      atteso: f.stimati,
    }));
  } catch (e) {
    console.warn(`[raccolta] fonti non lette dal database: ${e.message}`);
    return [];
  }
}

async function main() {
  const ore = process.argv.includes("--ore")
    ? Number(process.argv[process.argv.indexOf("--ore") + 1])
    : 4.5;
  const filtro = process.argv.includes("--solo")
    ? new Set(
        process.argv[process.argv.indexOf("--solo") + 1]
          .split(",")
          .map((s) => s.trim().toUpperCase()),
      )
    : null;

  const avvio = Date.now();
  const scadenza = avvio + ore * 3600 * 1000;
  mkdirSync(CARTELLA, { recursive: true });

  const fatti = existsSync(DOVE) ? JSON.parse(readFileSync(DOVE, "utf8")) : [];
  const gia = new Set(fatti.map((f) => `${f.paese}|${f.insegna}`));

  const tutte = new Map();
  for (const f of [...(await fontiInUso()), ...promosse()]) {
    const chiave = `${f.paese}|${f.insegna}`;
    if (!tutte.has(chiave)) tutte.set(chiave, f);
  }

  /* LE PIU' GROSSE PER PRIME.
     Se la notte finisce prima dell'elenco, quel che manca dev'essere la coda
     leggera, non il catalogo che da solo vale un quinto del totale. */
  const coda = [...tutte.values()]
    .filter((f) => !filtro || filtro.has(f.paese))
    .filter((f) => !gia.has(`${f.paese}|${f.insegna}`))
    .sort((a, b) => (b.atteso ?? 0) - (a.atteso ?? 0));

  console.log(
    `${tutte.size} insegne in tutto · ${fatti.length} gia' raccolte · ` +
      `${coda.length} da fare · mi fermo fra ${ore} ore\n`,
  );

  const esiti = [...fatti];
  scriviStato(avvio, scadenza, esiti, tutte.size);

  /* TRE INSEGNE ALLA VOLTA.
     Non di piu': ognuna scarica decine di file da megabyte e apre trenta
     pagine, e sopra le tre la rete diventa il collo di bottiglia — si aspetta
     di piu' e si raccoglie di meno. */
  const lavoratore = async () => {
    while (coda.length > 0 && Date.now() < scadenza) {
      const f = coda.shift();
      const inizio = Date.now();

      const r = await raccogli(f.sitemap, scadenza);
      let prezzi = { campione: 0, aperte: 0, conPrezzo: 0, esempi: [] };
      if (r.indirizzi.length > 0) {
        prezzi = await misuraPrezzi(r.indirizzi);
        // Gli indirizzi si tengono: chi vuole controllare apre il file.
        writeFileSync(
          `${CARTELLA}/${f.paese}-${f.insegna.replace(/[^a-zA-Z0-9]+/g, "_")}.txt.gz`,
          gzipSync(r.indirizzi.join("\n")),
        );
      }

      const e = {
        paese: f.paese,
        insegna: f.insegna,
        sitemap: f.sitemap,
        indirizzi: r.indirizzi.length,
        atteso: f.atteso ?? 0,
        sitemapAperte: r.sitemapAperte,
        completa: r.finita,
        ...prezzi,
        secondi: Math.round((Date.now() - inizio) / 1000),
      };
      esiti.push(e);

      const resa = e.campione ? Math.round((e.conPrezzo / e.campione) * 100) : 0;
      console.log(
        `${e.paese}  ${e.insegna.padEnd(24).slice(0, 24)} ` +
          `${e.indirizzi.toLocaleString("it-IT").padStart(9)} indirizzi · ` +
          `prezzo ${e.conPrezzo}/${e.campione} (${resa}%) · ` +
          `${Math.round(e.secondi / 60)}m${e.completa ? "" : " [troncata]"}`,
      );

      writeFileSync(DOVE, JSON.stringify(esiti, null, 2), "utf8");
      scriviStato(avvio, scadenza, esiti, tutte.size);
    }
  };

  await Promise.all([lavoratore(), lavoratore(), lavoratore()]);

  const utili = esiti.filter((e) => e.indirizzi > 0);
  const totale = utili.reduce((n, e) => n + e.indirizzi, 0);

  console.log("\n" + "═".repeat(74));
  console.log("  RACCOLTO");
  console.log("═".repeat(74));
  console.log(`  indirizzi contati uno per uno   ${totale.toLocaleString("it-IT")}`);
  console.log(`  insegne                         ${utili.length}`);
  console.log(`  paesi                           ${new Set(utili.map((e) => e.paese)).size}`);
  console.log(
    `  schede aperte per misurare      ${esiti.reduce((n, e) => n + (e.aperte ?? 0), 0)}, ` +
      `con prezzo ${esiti.reduce((n, e) => n + (e.conPrezzo ?? 0), 0)}`,
  );
  console.log(`  tempo                           ${orologio((Date.now() - avvio) / 1000)}`);
  console.log(`\n  indirizzi in ${CARTELLA}/, dettaglio in ${DOVE}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
