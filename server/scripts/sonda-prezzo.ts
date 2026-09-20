/**
 * Dove sta il prezzo, in una pagina che sembra non averlo.
 *
 * IL PROBLEMA CHE RISOLVE
 * -----------------------
 * Seicentosessantaseimila indirizzi del nostro catalogo aprono una pagina viva
 * e non danno un prezzo — piu' di quanti prodotti prezzati abbiamo in tutto. Non
 * e' che quei negozi il prezzo lo nascondano: lo servono da un'API e la pagina
 * lo disegna dopo, mentre il nostro lettore guarda l'HTML dove non c'e' niente.
 *
 * `prezzi-api.ts` esiste apposta e dice che aggiungere un lettore sono quindici
 * righe. Vero — ma solo DOPO aver scoperto dove il negozio tiene il prezzo, e
 * quella scoperta a mano e' mezza giornata per insegna: aprire la pagina,
 * guardare il traffico, indovinare l'indirizzo dell'API, capire il formato.
 *
 * Questo comando fa quella mezza giornata in trenta secondi. Non scrive il
 * lettore: dice dove guardare, che e' la parte difficile.
 *
 * DOVE UN NEGOZIO TIENE IL PREZZO, IN ORDINE DI FREQUENZA
 * ------------------------------------------------------
 *   JSON-LD        un blocco `application/ld+json` con `offers.price`. E' lo
 *                  standard che Google chiede per le schede prodotto, quindi
 *                  ce l'hanno in tanti — ed e' il caso piu' fortunato, perche'
 *                  si legge dall'HTML e non serve nemmeno un'API.
 *   __NEXT_DATA__  i siti fatti con Next.js incollano nella pagina tutto lo
 *                  stato del server, prezzo compreso. Stessa fortuna.
 *   meta           `product:price:amount`, `og:price:amount`, `itemprop=price`.
 *   API            nessuna delle precedenti: il prezzo arriva da una chiamata
 *                  separata. Qui la sonda mostra gli indirizzi che la pagina
 *                  nomina, perche' e' fra quelli.
 *
 * PERCHE' NON BASTA GUARDARE UNA PAGINA SOLA
 * Perche' una scheda esaurita, o una di una categoria strana, non ha il prezzo
 * nemmeno dove gli altri ce l'hanno. Si guardano piu' schede sparse e si dice
 * in quante il segnale c'era: «tre su cinque» e' un fatto, «una su una» e' un
 * aneddoto.
 *
 *   npx tsx --env-file-if-exists=.env scripts/sonda-prezzo.ts Naturitas
 *   npx tsx --env-file-if-exists=.env scripts/sonda-prezzo.ts --url https://...
 *   npx tsx --env-file-if-exists=.env scripts/sonda-prezzo.ts --tutte
 */

import { gunzipSync } from "node:zlib";
import { cataloghi, fonti, prezzi } from "../src/base/db.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const unUrl = arg("--url");
const tutte = process.argv.includes("--tutte");
const chiesta = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : undefined;

/** Quante schede per insegna: abbastanza da distinguere un fatto da un caso. */
const QUANTE = 5;

const INTESTAZIONE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
};

const n = (v: number) => v.toLocaleString("it-IT");

/** Un numero plausibile per la spesa: sotto un centesimo o sopra mille, no. */
function sensato(x: unknown): number | null {
  const v = typeof x === "string" ? Number.parseFloat(x.replace(",", ".")) : Number(x);
  return Number.isFinite(v) && v > 0.01 && v < 1000 ? v : null;
}

/**
 * Cerca una chiave che somigli a un prezzo, dentro un oggetto di forma ignota.
 *
 * Si scende in profondita' perche' nessuno mette il prezzo in cima: sta sotto
 * `props.pageProps.product.offers.price` o giu' di li', e la strada cambia da
 * un sito all'altro. Quel che non cambia e' come si chiama la chiave.
 */
function cercaPrezzo(
  o: unknown,
  strada: string[] = [],
  trovati: Array<{ strada: string; valore: number }> = [],
  profondita = 0,
): Array<{ strada: string; valore: number }> {
  if (profondita > 12 || trovati.length >= 6) return trovati;
  if (Array.isArray(o)) {
    for (let i = 0; i < Math.min(o.length, 4); i++) {
      cercaPrezzo(o[i], [...strada, `${i}`], trovati, profondita + 1);
    }
    return trovati;
  }
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      /* «price», «prezzo», «amount», «value» quando stanno accanto a una
         valuta. Si escludono le varianti che quasi sempre non sono il prezzo
         da pagare: barrato, consigliato, al chilo. */
      const sembra = /^(price|prezzo|precio|preis|prix|amount|value|current|salePrice|finalPrice)$/i.test(k);
      const daScartare = /(old|list|was|unit|kilo|per|rrp|strike|regular|compare)/i.test(k);
      if (sembra && !daScartare) {
        const x = sensato(v);
        if (x !== null) trovati.push({ strada: [...strada, k].join("."), valore: x });
      }
      if (v && typeof v === "object") cercaPrezzo(v, [...strada, k], trovati, profondita + 1);
    }
  }
  return trovati;
}

interface Esito {
  dove: string;
  come: string;
  prezzo: number;
}

function analizza(html: string): { esiti: Esito[]; api: string[] } {
  const esiti: Esito[] = [];

  /* 1. JSON-LD: il posto che Google chiede, quindi il piu' diffuso. */
  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const dati = JSON.parse(m[1].trim());
      for (const t of cercaPrezzo(dati)) {
        esiti.push({ dove: "JSON-LD", come: t.strada, prezzo: t.valore });
      }
    } catch {
      /* un blocco malformato non e' una notizia: ce ne sono altri */
    }
  }

  /* 2. Lo stato del server incollato nella pagina. */
  for (const [nome, re] of [
    ["__NEXT_DATA__", /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i],
    ["__NUXT__", /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i],
    ["__INITIAL_STATE__", /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i],
    ["apolloState", /window\.__APOLLO_STATE__\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/i],
  ] as Array<[string, RegExp]>) {
    const m = re.exec(html);
    if (!m) continue;
    try {
      for (const t of cercaPrezzo(JSON.parse(m[1]))) {
        esiti.push({ dove: nome, come: t.strada, prezzo: t.valore });
      }
    } catch {
      /* spesso non e' JSON puro ma una funzione: si dice lo stesso che c'e' */
      esiti.push({ dove: nome, come: "presente ma non e' JSON puro", prezzo: 0 });
    }
  }

  /* 3. I meta tag, che sono la strada piu' corta quando ci sono. */
  for (const [nome, re] of [
    ["meta product:price", /<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)["']/i],
    ["meta og:price", /<meta[^>]+property=["']og:price:amount["'][^>]+content=["']([^"']+)["']/i],
    ["itemprop=price", /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i],
  ] as Array<[string, RegExp]>) {
    const v = sensato(re.exec(html)?.[1]);
    if (v !== null) esiti.push({ dove: nome, come: "attributo content", prezzo: v });
  }

  /* 4. Se non c'e' niente: gli indirizzi che la pagina nomina. Il prezzo
        arrivera' da uno di questi, e averli in elenco e' il grosso del lavoro
        di scoperta. */
  const api = [
    ...new Set(
      [...html.matchAll(/["'](https?:\/\/[^"']*(?:api|graphql|services|search)[^"']{0,80})["']/gi)]
        .map((m) => m[1])
        .filter((u) => !/\.(png|jpg|jpeg|svg|gif|webp|css|woff2?)(\?|$)/i.test(u))
        .slice(0, 40),
    ),
  ].slice(0, 8);

  return { esiti, api };
}

/* ── quali insegne guardare ──────────────────────────────────────────── */

async function indirizziDi(paese: string, insegna: string): Promise<string[]> {
  const doc = (await (await cataloghi()).findOne({ _id: `${paese}|${insegna}` })) as {
    dati?: { buffer: Buffer };
  } | null;
  if (!doc?.dati) return [];
  try {
    return gunzipSync(Buffer.from(doc.dati.buffer))
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((r) => (r.indexOf("\t") > 0 ? r.slice(0, r.indexOf("\t")) : r))
      .filter((u) => /^https?:\/\//.test(u));
  } catch {
    return [];
  }
}

async function sonda(etichetta: string, indirizzi: string[]): Promise<void> {
  console.log("");
  console.log(`━━ ${etichetta} ━━`);

  const passo = Math.max(1, Math.floor(indirizzi.length / QUANTE));
  const campione: string[] = [];
  for (let i = 0; i < indirizzi.length && campione.length < QUANTE; i += passo) {
    campione.push(indirizzi[i]);
  }
  if (campione.length === 0) {
    console.log("  nessun indirizzo nel catalogo");
    return;
  }

  const conteggio = new Map<string, { volte: number; esempio: Esito }>();
  const apiViste = new Set<string>();
  let risposte = 0;

  for (const url of campione) {
    try {
      const r = await fetch(url, { headers: INTESTAZIONE, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) {
        console.log(`  HTTP ${r.status}  ${url.slice(0, 70)}`);
        continue;
      }
      risposte++;
      const { esiti, api } = analizza(await r.text());
      for (const a of api) apiViste.add(a);
      /* Una sola voce per posto: se il prezzo compare otto volte nello stesso
         JSON-LD e' comunque un posto solo. */
      const visti = new Set<string>();
      for (const e of esiti) {
        const chiave = `${e.dove}|${e.come}`;
        if (visti.has(chiave)) continue;
        visti.add(chiave);
        const g = conteggio.get(chiave) ?? { volte: 0, esempio: e };
        g.volte++;
        conteggio.set(chiave, g);
      }
    } catch (err) {
      console.log(`  non risponde: ${err instanceof Error ? err.message.slice(0, 40) : err}`);
    }
  }

  if (risposte === 0) {
    console.log("  nessuna pagina si e' aperta: il catalogo e' vecchio o il sito ci blocca");
    return;
  }

  const ordinati = [...conteggio.entries()].sort((a, b) => b[1].volte - a[1].volte);
  if (ordinati.length === 0) {
    console.log(`  ${risposte}/${campione.length} pagine aperte · IL PREZZO NON E' NELL'HTML`);
    if (apiViste.size > 0) {
      console.log("  Indirizzi che la pagina nomina — il prezzo arriva da uno di questi:");
      for (const a of apiViste) console.log(`    ${a.slice(0, 96)}`);
    } else {
      console.log("  e la pagina non nomina nessun indirizzo utile: serve guardare il traffico a mano");
    }
    return;
  }

  console.log(`  ${risposte}/${campione.length} pagine aperte · il prezzo si legge dall'HTML:`);
  for (const [chiave, g] of ordinati.slice(0, 5)) {
    const [dove, come] = chiave.split("|");
    console.log(
      `    ${String(g.volte).padStart(2)}/${risposte}  ${dove.padEnd(16)} ${come.slice(0, 52).padEnd(52)} es. ${g.esempio.prezzo}`,
    );
  }
  console.log("  → si legge senza API: basta insegnare al lettore questa strada.");
}

/* ── partenza ────────────────────────────────────────────────────────── */

if (unUrl) {
  await sonda(unUrl, [unUrl]);
  process.exit(0);
}

const F = (await (await fonti()).find({ esclusa: { $exists: false } }).toArray()) as Array<{
  id?: number;
  insegna: string;
  paese: string;
}>;

const C = (await (await cataloghi())
  .find({})
  .project({ paese: 1, insegna: 1, prodotti: 1 })
  .toArray()) as Array<{ paese?: string; insegna?: string; prodotti?: number }>;
const linkDi = new Map(C.map((c) => [`${c.paese}|${c.insegna}`, c.prodotti ?? 0]));

const agg = (await (await prezzi())
  .aggregate([
    { $group: { _id: "$c", tot: { $sum: 1 }, senza: { $sum: { $cond: [{ $eq: ["$p", null] }, 1, 0] } } } },
  ])
  .toArray()) as Array<{ _id: number; tot: number; senza: number }>;
const misure = new Map(agg.map((a) => [a._id, a]));

let elenco = F;
if (chiesta) {
  elenco = F.filter((f) => f.insegna.toLowerCase().includes(chiesta.toLowerCase()));
} else if (tutte) {
  /* In ordine di quanto c'e' da guadagnare: aperte senza prezzo piu' quelle
     che nessuno ha ancora toccato. */
  elenco = F.map((f) => {
    const m = typeof f.id === "number" ? misure.get(f.id) : undefined;
    const link = linkDi.get(`${f.paese}|${f.insegna}`) ?? 0;
    const senza = m?.senza ?? 0;
    const mai = Math.max(0, link - (m?.tot ?? 0));
    return { f, vale: senza + mai };
  })
    .filter((x) => x.vale >= 5000)
    .sort((a, b) => b.vale - a.vale)
    .map((x) => x.f);
} else {
  console.error("");
  console.error("  Serve un'insegna:  scripts/sonda-prezzo.ts Naturitas");
  console.error("  Oppure --tutte per quelle che valgono almeno cinquemila indirizzi,");
  console.error("  oppure --url https://... per una pagina sola.");
  console.error("");
  process.exit(1);
}

if (elenco.length === 0) {
  console.error(`\n  Nessuna insegna trovata per «${chiesta}».\n`);
  process.exit(1);
}

console.log("");
console.log(`SONDA PREZZO · ${elenco.length} insegne · ${QUANTE} schede ciascuna`);

for (const f of elenco) {
  const link = linkDi.get(`${f.paese}|${f.insegna}`) ?? 0;
  const m = typeof f.id === "number" ? misure.get(f.id) : undefined;
  const vale = (m?.senza ?? 0) + Math.max(0, link - (m?.tot ?? 0));
  await sonda(`${f.paese} ${f.insegna} — ${n(vale)} indirizzi da recuperare`, await indirizziDi(f.paese, f.insegna));
}

console.log("");
process.exit(0);
