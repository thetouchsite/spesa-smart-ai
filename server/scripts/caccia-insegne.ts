/**
 * Insegne nuove per un paese: le cerca, le prova, e dice quali valgono.
 *
 * PERCHE' SERVE PROPRIO QUESTO
 * ----------------------------
 * Perche' dai cataloghi che abbiamo non c'e' piu' niente da spremere, ed e'
 * misurato: su centosedici insegne vive, UNA sola non ha catalogo e DUE stanno
 * sotto il settanta per cento di quel che pubblicano. Rileggere meglio le
 * sitemap non porta un prodotto in piu'. Se i numeri di un paese devono
 * crescere, devono crescere di insegne.
 *
 * LE TRE PROVE, IN QUEST'ORDINE
 * -----------------------------
 *   1. SI PUO'?   si legge il `robots.txt`. Se dice di no, l'insegna finisce
 *                 qui e non si guarda nemmeno quanto e' grossa. L'API si vende
 *                 a un cliente: la diffida arriva a lui, non a noi.
 *   2. QUANTO?    si raccoglie con `daUnaFonte`, LO STESSO codice che poi fara'
 *                 il lavoro vero. Un conteggio fatto da un secondo giro di
 *                 sitemap, scritto apposta per la caccia, da' numeri che poi
 *                 non si avverano: cosi' invece il numero stampato e' quello
 *                 che otterrai davvero.
 *   3. RENDE?     si aprono per davvero alcune schede e si guarda quante il
 *                 prezzo ce l'hanno, con `verifyProductPage` — di nuovo, il
 *                 lettore vero.
 *
 * IL TERZO PASSO E' QUELLO CHE CONTA, E COSTA CARO IMPARARLO.
 * In Spagna, aggiungendo quattro catene, le voci con prezzo sono SCESE da
 * quattro a una su nove. Mercadona pubblica 4.316 indirizzi e ci ha dato 34
 * prezzi; Aldi Espana 2.072 indirizzi e 20 prezzi. Li abbiamo, e rendono zero:
 * gonfiano il catalogo, tengono occupati i lettori, e in cambio non danno
 * niente. Contare gli indirizzi senza aprirli fa credere di aver guadagnato
 * mentre si e' perso.
 *
 * COSA SCRIVE, E QUANDO
 * ---------------------
 * Con `--scrivi` mette le promosse fra le fonti, con la resa MISURATA e gli
 * stimati CONTATI. Per questo `--scrivi` pretende anche `--fondo`: la prova
 * veloce si ferma a poche migliaia di indirizzi per non farti aspettare, e un
 * numero che non hai misurato per intero non si scrive su un campo che poi
 * qualcuno leggera' come verita'.
 *
 *   npx tsx --env-file-if-exists=.env scripts/caccia-insegne.ts IT
 *   npx tsx --env-file-if-exists=.env scripts/caccia-insegne.ts ES --fondo --scrivi
 *   npx tsx --env-file-if-exists=.env scripts/caccia-insegne.ts IT --dominio "Todis=www.todis.it"
 *   npx tsx --env-file-if-exists=.env scripts/caccia-insegne.ts IT --da mie-insegne.txt
 */

import { readFileSync } from "node:fs";
import { fonti } from "../src/base/db.js";
import { posso, robotsDi } from "../src/base/robots.js";
import { verifyProductPage } from "../src/api/price-page.js";

const paese = (process.argv[2] ?? "").toUpperCase();
const scrivi = process.argv.includes("--scrivi");
const fondo = process.argv.includes("--fondo");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

/* La prova veloce si ferma presto: serve a scartare, non a raccogliere.
   Va impostata PRIMA di aprire `catalogo`, che legge il tetto una volta sola
   quando viene caricato — per questo l'import sta qui e non in cima. */
if (!fondo) process.env.CATALOGO_MAX_INSEGNA = "4000";
const { daUnaFonte } = await import("../src/api/catalogo.js");

/**
 * Quante schede si aprono per misurare la resa.
 *
 * Venti: bastano a distinguere «zero» da «quasi tutte», che e' la sola
 * distinzione su cui si decide. Il valore fine lo dara' poi il lettore vero,
 * che le apre tutte.
 */
const CAMPIONE = 20;

/**
 * Le catene alimentari note che il censimento non ha, paese per paese.
 *
 * Gli indirizzi qui sotto sono un punto di partenza, non un dato acquisito: un
 * dominio sbagliato costa una richiesta fallita e viene detto in chiaro. Meglio
 * un elenco largo provato dalla macchina che uno stretto scelto a mano.
 */
const CANDIDATI: Record<string, Array<{ nome: string; dominio: string }>> = {
  IT: [
    { nome: "Despar", dominio: "www.despar.it" },
    { nome: "Crai", dominio: "www.craishop.it" },
    { nome: "Famila", dominio: "spesaonline.famila.it" },
    { nome: "MD", dominio: "www.mdspa.it" },
    { nome: "Todis", dominio: "www.todis.it" },
    { nome: "Penny Italia", dominio: "www.penny.it" },
    { nome: "In's Mercato", dominio: "www.insmercato.it" },
    { nome: "Il Gigante", dominio: "spesaonline.ilgigante.net" },
    { nome: "Tosano", dominio: "www.tosanospesaonline.it" },
    { nome: "Metro Italia", dominio: "www.metro.it" },
    { nome: "Emisfero", dominio: "www.emisfero.it" },
    { nome: "Deco", dominio: "www.decoitalia.it" },
    { nome: "Sigma", dominio: "www.supermercatisigma.it" },
    { nome: "Iper La Grande i", dominio: "www.iper.it" },
    { nome: "Risparmio Casa", dominio: "www.risparmiocasa.com" },
    { nome: "Gulliver", dominio: "www.gulliverspesaonline.it" },
    { nome: "Dok", dominio: "www.dokspesaonline.it" },
    { nome: "Rossetto", dominio: "www.rossettospesaonline.it" },
    { nome: "Everli", dominio: "www.everli.com" },
    { nome: "Ipercoop", dominio: "www.ipercoop.it" },
  ],
  ES: [
    { nome: "Eroski", dominio: "supermercado.eroski.es" },
    { nome: "Condis", dominio: "www.condisline.com" },
    { nome: "Ahorramas", dominio: "www.ahorramas.com" },
    { nome: "Carrefour Espana", dominio: "www.carrefour.es" },
    { nome: "El Corte Ingles", dominio: "www.elcorteingles.es" },
    { nome: "Lidl Espana", dominio: "www.lidl.es" },
    { nome: "Dia", dominio: "www.dia.es" },
    { nome: "Hipercor", dominio: "www.hipercor.es" },
    { nome: "Froiz", dominio: "www.froiz.com" },
    { nome: "Gadis", dominio: "www.gadis.es" },
    { nome: "Coviran", dominio: "www.covirandomicilio.es" },
    { nome: "BM Supermercados", dominio: "www.bmsupermercados.es" },
    { nome: "Caprabo", dominio: "www.caprabo.com" },
    { nome: "Alimerka", dominio: "www.alimerka.es" },
    { nome: "HiperDino", dominio: "www.hiperdino.es" },
    { nome: "Family Cash", dominio: "www.familycash.es" },
    { nome: "Masymas", dominio: "www.masymas.com" },
    { nome: "Supercor", dominio: "www.supercor.es" },
  ],
  FR: [
    { nome: "Intermarche", dominio: "www.intermarche.com" },
    { nome: "Auchan", dominio: "www.auchan.fr" },
    { nome: "Leclerc", dominio: "www.e.leclerc" },
    { nome: "Monoprix", dominio: "www.monoprix.fr" },
    { nome: "Franprix", dominio: "www.franprix.fr" },
    { nome: "Cora", dominio: "www.cora.fr" },
    { nome: "Super U", dominio: "www.coursesu.com" },
    { nome: "Casino", dominio: "www.casino.fr" },
  ],
  DE: [
    { nome: "Rewe", dominio: "shop.rewe.de" },
    { nome: "Edeka24", dominio: "www.edeka24.de" },
    { nome: "Kaufland", dominio: "www.kaufland.de" },
    { nome: "Netto", dominio: "www.netto-online.de" },
    { nome: "Penny", dominio: "www.penny.de" },
    { nome: "Bringmeister", dominio: "www.bringmeister.de" },
    { nome: "Flaschenpost", dominio: "www.flaschenpost.de" },
  ],
};

/** Dove sta una sitemap quando il `robots.txt` non la dichiara. */
const POSTI_SOLITI = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemaps.xml",
  "/sitemap/sitemap.xml",
  "/sitemap/index.xml",
  "/product-sitemap.xml",
  "/sitemap-products.xml",
  "/media/sitemap.xml",
  "/pub/sitemap.xml",
];

/** Una sitemap che nel nome parla di prodotti vale piu' di una che parla di pagine. */
const SA_DI_PRODOTTI = /(product|produkt|producto|prodott|artikel|item|shop|catalog)/i;

/**
 * Quante radici provare per un'insegna prima di lasciar perdere.
 *
 * SE NE PROVAVA UNA SOLA, ED ERA UN ERRORE.
 * Un sito dichiara spesso cinque o sei sitemap — pagine, categorie, articoli,
 * negozi, e in mezzo quella dei prodotti. Prendendo la prima e fermandosi, sei
 * insegne italiane su venti risultavano «sitemap trovata ma nessuna scheda
 * prodotto dentro»: il catalogo stava nel file accanto, dichiarato, e non lo
 * apriva nessuno. Un candidato scartato per un difetto nostro sembra
 * identico a uno che non ha catalogo, e non torna piu' indietro.
 */
const RADICI_DA_PROVARE = 6;

/** Le radici da cui puo' partire il catalogo, in ordine di quanto promettono. */
async function radiciPossibili(dominio: string): Promise<string[]> {
  const origine = `https://${dominio}`;
  const viste = new Set<string>();

  /* Prima quelle che il sito DICHIARA: e' il posto piu' affidabile, e per
     giunta e' il sito stesso a indicarlo. Fra quelle, prima le sitemap che
     nel nome parlano di prodotti. */
  const r = await robotsDi(origine);
  for (const s of r.sitemap.slice().sort((a, b) => (SA_DI_PRODOTTI.test(a) ? 0 : 1) - (SA_DI_PRODOTTI.test(b) ? 0 : 1))) {
    viste.add(s);
  }

  for (const via of POSTI_SOLITI) {
    if (viste.size >= RADICI_DA_PROVARE) break;
    try {
      const u = `${origine}${via}`;
      if (viste.has(u)) continue;
      const risposta = await fetch(u, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MealMintBot/1.0)" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!risposta.ok) continue;
      /* Un sito che risponde 200 a qualunque indirizzo esiste: si guarda che
         dentro ci sia davvero una sitemap, non la pagina di benvenuto. */
      const testo = (await risposta.text()).slice(0, 2000);
      if (/<(urlset|sitemapindex)/i.test(testo)) viste.add(u);
    } catch {
      /* un posto che non risponde non e' una notizia: si prova il prossimo */
    }
  }
  return [...viste].slice(0, RADICI_DA_PROVARE);
}

/* ── chi abbiamo gia' ────────────────────────────────────────────────── */

const collezione = await fonti();
const gia = (await collezione
  .find({})
  .project({ insegna: 1, dominio: 1, paese: 1 })
  .toArray()) as Array<{ insegna: string; dominio?: string; paese: string }>;
const host = (d: string) => d.replace(/^www\./, "").toLowerCase();
const domini = new Set(gia.map((x) => host(String(x.dominio ?? ""))));
const nomi = new Set(gia.map((x) => `${x.paese}|${String(x.insegna).toLowerCase()}`));

/* ── chi provare ─────────────────────────────────────────────────────── */

let lista = CANDIDATI[paese] ?? [];

const unoSolo = arg("--dominio");
if (unoSolo) {
  const [nome, dominio] = unoSolo.split("=");
  if (!dominio) {
    console.error('Serve  --dominio "Nome=dominio.it"');
    process.exit(1);
  }
  lista = [{ nome, dominio }];
}

const daFile = arg("--da");
if (daFile) {
  lista = readFileSync(daFile, "utf8")
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r && !r.startsWith("#"))
    .map((r) => {
      const [nome, dominio] = r.split("=");
      return { nome: (nome ?? "").trim(), dominio: (dominio ?? "").trim() };
    })
    .filter((x) => x.nome && x.dominio);
}

if (!paese || lista.length === 0) {
  console.error("");
  console.error(`  Nessun candidato per «${paese || "(nessun paese)"}».`);
  console.error(`  Paesi con un elenco pronto: ${Object.keys(CANDIDATI).sort().join(", ")}`);
  console.error(`  Per gli altri:  scripts/caccia-insegne.ts XX --dominio "Nome=dominio.xx"`);
  console.error("");
  process.exit(1);
}

if (scrivi && !fondo) {
  console.error("");
  console.error("  --scrivi vuole anche --fondo.");
  console.error("  La prova veloce si ferma a quattromila indirizzi: scrivere quel numero");
  console.error("  come «stimati» vorrebbe dire mettere in archivio una cifra che descrive");
  console.error("  il tetto della prova, non il catalogo dell'insegna.");
  console.error("");
  process.exit(1);
}

/* ── la caccia ───────────────────────────────────────────────────────── */

const n = (v: number) => v.toLocaleString("it-IT");
console.log("");
console.log(
  `CACCIA INSEGNE · ${paese} · ${lista.length} candidati${fondo ? " · a fondo" : " · prova veloce"}`,
);
console.log("");

const promosse: Array<{ nome: string; dominio: string; sitemap: string; link: number; resa: number }> = [];
const rese: Array<{ nome: string; link: number }> = [];

for (const c of lista) {
  const eti = `  ${c.nome.padEnd(22).slice(0, 22)}`;

  if (domini.has(host(c.dominio)) || nomi.has(`${paese}|${c.nome.toLowerCase()}`)) {
    console.log(`${eti} ce l'abbiamo gia'`);
    continue;
  }

  const radici = await radiciPossibili(c.dominio);
  if (radici.length === 0) {
    console.log(`${eti} nessuna sitemap trovata su ${c.dominio}`);
    continue;
  }

  /* IL PERMESSO SI CHIEDE PRIMA DI CONTARE, NON DOPO.
     Se si contasse prima, un catalogo grosso metterebbe addosso la voglia di
     trovare un modo — ed e' esattamente la voglia da non avere. */
  const via = await posso(radici[0]);
  if (!via.ok) {
    console.log(`${eti} VIETATO dal robots.txt · ${via.regola}`);
    continue;
  }

  let voci: Array<{ url: string; nome: string }> = [];
  let sitemap = radici[0];
  let errore = "";
  for (const radice of radici) {
    try {
      const prova = await daUnaFonte({
        paese,
        insegna: c.nome,
        dominio: c.dominio,
        sitemap: radice,
        resa: 1,
        stimati: 0,
      });
      /* Si tiene la radice che rende di piu', non la prima che rende: capita
         che una sitemap secondaria dia quattro schede e quella buona
         quarantamila, e fermarsi alla prima le farebbe passare per un negozio
         minuscolo. */
      if (prova.length > voci.length) {
        voci = prova;
        sitemap = radice;
      }
    } catch (err) {
      errore = err instanceof Error ? err.message : String(err);
    }
  }

  if (voci.length === 0) {
    console.log(
      `${eti} ${radici.length} sitemap provate, nessuna scheda prodotto dentro` +
        (errore ? ` (${errore.slice(0, 40)})` : ""),
    );
    continue;
  }

  /* Il campione si prende sparso, non in testa: le sitemap sono ordinate, e le
     prime voci di un catalogo somigliano fra loro piu' del resto — spesso sono
     una categoria sola, e misurarla darebbe la resa di quella, non del negozio. */
  const passo = Math.max(1, Math.floor(voci.length / CAMPIONE));
  const campione: Array<{ url: string; nome: string }> = [];
  for (let i = 0; i < voci.length && campione.length < CAMPIONE; i += passo) campione.push(voci[i]);

  let conPrezzo = 0;
  let aperte = 0;
  for (const v of campione) {
    try {
      const esito = await verifyProductPage(v.url);
      if (esito.status === "verificato" || esito.status === "pagina-ok") aperte++;
      if (esito.page && typeof esito.page.current === "number") conPrezzo++;
    } catch {
      /* una scheda che non si apre e' gia' un dato: conta come non resa */
    }
  }
  const resa = campione.length > 0 ? conPrezzo / campione.length : 0;

  console.log(
    `${eti} ${n(voci.length).padStart(7)} link${fondo ? " " : "+"} · ` +
      `resa ${String(Math.round(resa * 100)).padStart(3)}% (${conPrezzo}/${campione.length}) · ` +
      `${aperte}/${campione.length} pagine aperte` +
      (via.assente ? " · robots.txt assente" : ""),
  );

  if (resa > 0) promosse.push({ nome: c.nome, dominio: c.dominio, sitemap, link: voci.length, resa });
  else rese.push({ nome: c.nome, link: voci.length });
}

console.log("");
if (rese.length > 0) {
  console.log("SCARTATE: hanno il catalogo ma il prezzo non lo scrivono in pagina.");
  console.log("Prenderle vorrebbe dire far lavorare i lettori per niente.");
  for (const x of rese) console.log(`  ${x.nome.padEnd(22).slice(0, 22)} ${n(x.link).padStart(7)} link · resa 0%`);
  console.log("");
}

if (promosse.length === 0) {
  console.log("Nessuna insegna nuova da aggiungere.");
  process.exit(0);
}

console.log(`DA AGGIUNGERE: ${promosse.length} insegne, ${n(promosse.reduce((a, b) => a + b.link, 0))} link`);
for (const p of promosse.sort((a, b) => b.link * b.resa - a.link * a.resa)) {
  console.log(
    `  ${p.nome.padEnd(22).slice(0, 22)} ${n(p.link).padStart(7)} link · resa ${Math.round(p.resa * 100)}%` +
      ` → circa ${n(Math.round(p.link * p.resa))} prezzi`,
  );
}
console.log("");

if (!scrivi) {
  console.log(`Niente e' stato scritto. Per aggiungerle:  ... caccia-insegne.ts ${paese} --fondo --scrivi`);
  process.exit(0);
}

/* Il numero dell'insegna serve alle righe dei prezzi, che portano quello invece
   del nome per non riscriverlo cinque milioni di volte. Si prende il primo
   LIBERO, non il conteggio delle fonti: le cancellazioni lasciano buchi, e
   riusare un numero vorrebbe dire attribuire a un negozio i prezzi di un altro. */
const usati = new Set(
  ((await collezione.find({}).project({ id: 1 }).toArray()) as Array<{ id?: number }>)
    .map((x) => x.id)
    .filter((x): x is number => typeof x === "number"),
);
let prossimo = 1;
const libero = () => {
  while (usati.has(prossimo)) prossimo++;
  usati.add(prossimo);
  return prossimo;
};

for (const p of promosse) {
  const id = libero();
  await collezione.insertOne({
    _id: `${paese}|${p.nome}`,
    id,
    paese,
    insegna: p.nome,
    dominio: p.dominio,
    sitemap: p.sitemap,
    resa: Math.round(p.resa * 100) / 100,
    stimati: p.link,
    nota:
      `trovata da caccia-insegne il ${new Date().toLocaleDateString("it-IT")}; ` +
      `resa misurata su ${CAMPIONE} schede aperte davvero`,
  } as never);
  console.log(`  aggiunta  ${paese}|${p.nome}  (numero ${id})`);
}

console.log("");
console.log("Ora il catalogo va raccolto per davvero:");
console.log(`  npx tsx --env-file-if-exists=.env scripts/carica-catalogo-db.ts ${paese}`);
process.exit(0);
