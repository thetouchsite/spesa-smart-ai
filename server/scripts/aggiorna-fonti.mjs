/**
 * Porta il raccolto dentro l'app: riscrive `src/catalogo-fonti.ts`.
 *
 * PERCHE' SERVE UN PASSAGGIO APPOSTA
 * ----------------------------------
 * La ricognizione e la raccolta misurano, e basta: scrivono in `diario/` e non
 * toccano niente. Va bene cosi' finche' si guarda, ma l'app legge le fonti da
 * `catalogo-fonti.ts`, e finche' quel file non cambia tutto il lavoro resta
 * un rapporto.
 *
 * COSA CAMBIA, CONCRETAMENTE
 * --------------------------
 *   stimati   erano stime prese campionando, e sbagliavano di molto: Mercator
 *             diceva 336 e ne ha 17.241. Ora e' il conto vero, indirizzo per
 *             indirizzo.
 *   resa      misurata aprendo trenta schede, non piu' un valore di comodo.
 *             E' il numero che decide quali insegne provare per prime, e la
 *             Spagna ha gia' mostrato quanto pesa: con l'ordine sbagliato le
 *             voci con prezzo erano scese da quattro a una su nove.
 *   insegne   quelle nuove entrano, con la loro sitemap gia' verificata.
 *
 * COSA NON SI BUTTA
 * -----------------
 * Le fonti che c'erano e che la raccolta non ha ripreso — o che quella notte
 * non hanno risposto — restano come sono. Un'insegna che stasera e' muta
 * domani parla, e cancellarla per un silenzio di passaggio vuol dire perdere
 * un paese per sempre.
 *
 * CHI RESTA FUORI
 * ---------------
 * I generalisti. Galaxus promette tre milioni e settecentomila prodotti e li
 * darebbe pure, ma sono scarpe Nike, sedie da ufficio e switch di rete: in un
 * catalogo per la spesa non aggiungono un prodotto utile, aggiungono rumore
 * in cui i prodotti utili si perdono. Il numero grosso non vale il danno.
 *
 * Non riscrive niente finche' non glielo si dice: senza `--scrivi` mostra solo
 * cosa cambierebbe.
 *
 * Uso:
 *   node scripts/aggiorna-fonti.mjs            mostra il confronto
 *   node scripts/aggiorna-fonti.mjs --scrivi   riscrive il file
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";

const FONTI_TS = "src/catalogo-fonti.ts";
const RACCOLTA = "diario/raccolta-europa.json";

/**
 * Quanti indirizzi bastano perche' un'insegna valga un posto.
 *
 * Duecento: sotto, e' quasi sempre un frammento di catalogo o una sitemap
 * laterale, e un'insegna con trenta prodotti nel confronto non entra mai.
 */
const MINIMO = 200;

/**
 * Vendono di tutto tranne la spesa: fuori. Vedi l'intestazione.
 *
 * I NEGOZI PER ANIMALI SONO IL CASO PIU' INSIDIOSO.
 * Non sembrano generalisti — vendono cibo, e il cibo ha nomi da cibo. Misurato
 * su Londra: alla voce «Tuna tin» rispondeva «Thrive complete wet adult cat
 * food tuna 6 tin» di Pets at Home, 6,69 sterline, verificato e con il link
 * funzionante. Tutto vero tranne che era scatolette per gatti.
 *
 * Il filtro sui nomi non basta a tenerli fuori, perche' il nome e' giusto:
 * c'e' scritto tonno. Si tolgono alla radice.
 */
const GENERALISTI = new Set([
  // negozi per animali
  "Pets at Home",
  "Zooplus",
  "Zooplus Italia",
  "Zooplus France",
  "Fressnapf",
  "Arcaplanet",
  "Tiendanimal",
  "Kiwoko",

  "Galaxus",
  "Trendyol",
  "Hepsiburada",
  "Allegro",
  "eMAG",
  "Rozetka",
  "Bol.com",
  "Cdiscount",
  "Otto",
  "Alza",
  "Skroutz",
  "Amazon Italia",
  "Amazon España",
  "Amazon France",
  "Amazon Deutschland",
  "Amazon UK",
  "Amazon Portugal",
  "Amazon Polska",
  "Amazon NL",
  "Amazon Belgio",
]);

/** Le fonti attuali, lette dal sorgente: non serve compilare per guardarle. */
function fontiAttuali() {
  if (!existsSync(FONTI_TS)) return [];
  const testo = readFileSync(FONTI_TS, "utf8");
  const fuori = [];
  for (const riga of testo.split("\n")) {
    const paese = /paese:\s*"([A-Z]{2})"/.exec(riga);
    const insegna = /insegna:\s*"([^"]+)"/.exec(riga);
    const dominio = /dominio:\s*"([^"]+)"/.exec(riga);
    const sitemap = /sitemap:\s*"([^"]+)"/.exec(riga);
    if (!paese || !insegna || !sitemap) continue;
    const stimati = /stimati:\s*(\d+)/.exec(riga);
    const resa = /resa:\s*([\d.]+)/.exec(riga);
    fuori.push({
      paese: paese[1],
      insegna: insegna[1],
      dominio: dominio ? dominio[1] : new URL(sitemap[1]).hostname,
      sitemap: sitemap[1],
      resa: resa ? Number(resa[1]) : undefined,
      stimati: stimati ? Number(stimati[1]) : 0,
    });
  }
  return fuori;
}

function raccolto() {
  if (!existsSync(RACCOLTA)) return [];
  return JSON.parse(readFileSync(RACCOLTA, "utf8"))
    .filter((r) => r.indirizzi >= MINIMO && !GENERALISTI.has(r.insegna))
    .map((r) => ({
      paese: r.paese,
      insegna: r.insegna,
      dominio: new URL(r.sitemap).hostname,
      sitemap: r.sitemap,
      resa: r.campione ? Number((r.conPrezzo / r.campione).toFixed(2)) : 0,
      stimati: r.indirizzi,
      misurata: true,
    }));
}

function componi(fonti) {
  const perPaese = new Map();
  for (const f of fonti) {
    if (!perPaese.has(f.paese)) perPaese.set(f.paese, []);
    perPaese.get(f.paese).push(f);
  }

  const blocchi = [];
  for (const paese of [...perPaese.keys()].sort()) {
    const righe = perPaese
      .get(paese)
      .sort((a, b) => b.stimati - a.stimati)
      .map(
        (f) =>
          `  { paese: ${JSON.stringify(f.paese)}, insegna: ${JSON.stringify(f.insegna)}, ` +
          `dominio: ${JSON.stringify(f.dominio)}, sitemap: ${JSON.stringify(f.sitemap)}, ` +
          `resa: ${f.resa ?? 0.5}, stimati: ${f.stimati} },`,
      );
    blocchi.push(righe.join("\n"));
  }

  const totale = fonti.reduce((n, f) => n + f.stimati, 0);
  const paesi = perPaese.size;

  return `/**
 * Da dove viene il catalogo: una riga per insegna.
 *
 * Generato da \`scripts/aggiorna-fonti.mjs\` — non si scrive a mano, si
 * rigenera dopo una passata di raccolta.
 *
 * ${fonti.length} insegne · ${paesi} paesi · ${totale.toLocaleString("it-IT")} prodotti
 *
 * I NUMERI SONO CONTATI, NON STIMATI
 * ----------------------------------
 * \`stimati\` e' quanti indirizzi di prodotto quell'insegna pubblica davvero,
 * contati uno per uno scendendo in tutto l'albero delle sitemap. La versione
 * precedente campionava e moltiplicava, e sbagliava di molto: Mercator
 * risultava con 336 prodotti e ne ha 17.241.
 *
 * LA RESA E' LA COSA PIU' IMPORTANTE DI QUESTO FILE
 * -------------------------------------------------
 * \`resa\` e' la quota di schede che il prezzo lo dichiara, misurata aprendone
 * trenta per insegna. Serve a decidere chi provare per primo, e non e' un
 * dettaglio: in Spagna, aggiungendo quattro catene, le voci con prezzo erano
 * SCESE da quattro a una su nove, perche' i candidati si concentravano sulle
 * insegne mute. Un catalogo grande non e' un catalogo utile.
 *
 * CHI NON C'E'
 * ------------
 * Chi nel \`robots.txt\` vieta le schede prodotto — Tesco, Sainsbury's, Lidl
 * Spagna e Polonia, Pingo Doce, Ahorramas, Hipercor, Walmart. E i generalisti
 * tipo Galaxus: hanno milioni di prodotti e non sono roba da mangiare.
 */

export interface FonteCatalogo {
  /** Sigla del paese, due lettere. */
  paese: string;
  insegna: string;
  dominio: string;
  /** La radice da cui parte la scansione: puo' essere un indice di sitemap. */
  sitemap: string;
  /**
   * Quota di schede che espongono il prezzo, da 0 a 1.
   *
   * Misurata su trenta schede sparse per il catalogo. Decide l'ordine in cui
   * si provano le insegne quando una voce della lista ha piu' candidati.
   */
  resa: number;
  /** Indirizzi di prodotto pubblicati, contati. */
  stimati: number;
}

export const FONTI: FonteCatalogo[] = [
${blocchi.join("\n\n")}
];

/** I paesi per cui esiste almeno una fonte. */
export function paesiConCatalogo(): string[] {
  return [...new Set(FONTI.map((f) => f.paese))].sort();
}

/** Le fonti di un paese, le piu' generose per prime. */
export function fontiDi(paese: string): FonteCatalogo[] {
  return FONTI.filter((f) => f.paese === paese.toUpperCase()).sort((a, b) => b.resa - a.resa);
}

/**
 * Le parti successive di una sitemap numerata.
 *
 * Certi negozi spezzano il catalogo in \`...-part1.xml\`, \`...-part2.xml\` e non
 * pubblicano un indice che le elenchi: senza questo si caricherebbe un pezzo
 * solo credendo di avere tutto.
 */
export function partiSuccessive(sitemap: string, quante = 12): string[] {
  const m = /^(.*?)(\\d+)(\\.xml(?:\\.gz)?)$/i.exec(sitemap);
  if (!m) return [];
  const [, prefisso, numero, coda] = m;
  const primo = Number(numero);
  return Array.from({ length: quante }, (_, i) => \`\${prefisso}\${primo + i + 1}\${coda}\`);
}
`;
}

function main() {
  const scrivi = process.argv.includes("--scrivi");
  const prima = fontiAttuali();
  const nuove = raccolto();

  /* SI FONDE, NON SI SOSTITUISCE.
     Un'insegna che stanotte non ha risposto non e' un'insegna morta: resta
     com'era. Sparirebbe un paese intero per un silenzio di passaggio. */
  const unite = new Map();
  for (const f of prima) unite.set(`${f.paese}|${f.insegna}`, f);
  for (const f of nuove) {
    const chiave = `${f.paese}|${f.insegna}`;
    const vecchia = unite.get(chiave);
    unite.set(chiave, vecchia ? { ...vecchia, ...f } : f);
  }
  /* I generalisti si tolgono anche in uscita, non solo in entrata.
     La fusione tiene le fonti che c'erano gia', ed e' voluto — un'insegna muta
     per una sera non va cancellata. Ma Pets at Home era gia' dentro: filtrarlo
     solo dal raccolto lo avrebbe lasciato al suo posto, e alla voce «Tuna tin»
     avrebbe continuato a rispondere scatolette per gatti. */
  const finali = [...unite.values()].filter((f) => !GENERALISTI.has(f.insegna));

  const somma = (a) => a.reduce((n, f) => n + f.stimati, 0);
  const paesi = (a) => new Set(a.map((f) => f.paese)).size;

  console.log("                 insegne    paesi      prodotti");
  console.log(
    `  prima          ${String(prima.length).padStart(7)}  ${String(paesi(prima)).padStart(7)}  ` +
      `${somma(prima).toLocaleString("it-IT").padStart(12)}`,
  );
  console.log(
    `  dopo           ${String(finali.length).padStart(7)}  ${String(paesi(finali)).padStart(7)}  ` +
      `${somma(finali).toLocaleString("it-IT").padStart(12)}`,
  );

  const nuoviPaesi = [...new Set(finali.map((f) => f.paese))].filter(
    (p) => !prima.some((f) => f.paese === p),
  );
  if (nuoviPaesi.length) console.log(`\n  paesi nuovi: ${nuoviPaesi.join(" ")}`);

  const nuoveInsegne = nuove.filter(
    (f) => !prima.some((p) => p.paese === f.paese && p.insegna === f.insegna),
  );
  console.log(`  insegne nuove: ${nuoveInsegne.length}`);

  const mute = finali.filter((f) => f.resa === 0);
  console.log(`  insegne che non dichiarano mai il prezzo: ${mute.length} (restano, ma per ultime)`);

  if (!scrivi) {
    console.log("\n  Nessun file toccato. Per riscrivere davvero: --scrivi\n");
    return;
  }

  writeFileSync(FONTI_TS, componi(finali), "utf8");
  console.log(`\n  ${FONTI_TS} riscritto.\n`);
}

main();
