/**
 * Quanti dei tre milioni sono vivi, e quanti dichiarano il prezzo.
 *
 * LA DOMANDA
 * ----------
 * «Ho davvero tre milioni di prodotti con link e prezzi validi?»
 *
 * Aprirli tutti per saperlo sarebbe l'unica risposta certa, e non si puo':
 * tre milioni di pagine a otto per volta sono sei giorni e mezzo di richieste
 * continue ai negozi. Sarebbe anche inutile — il prezzo di oggi scade domani —
 * e soprattutto scortese verso chi quelle pagine le ospita.
 *
 * COME SI RISPONDE COMUNQUE
 * -------------------------
 * Campionando, che e' come si risponde a questa classe di domande da sempre.
 * Si aprono N schede prese A CASO dal catalogo di ogni insegna e si conta
 * quante rispondono e quante dichiarano il prezzo. Quelle quote, moltiplicate
 * per il catalogo di quell'insegna, danno una stima con un margine noto.
 *
 * A caso e non le prime: l'inizio di una sitemap e' spesso una categoria sola
 * — pentolame, vini — e misurerebbe quella invece dell'insegna.
 *
 * QUANTO E' AFFIDABILE
 * --------------------
 * Con 120 schede per insegna il margine sta intorno a ±9 punti nel caso
 * peggiore (quota vicina al 50%) e molto meno agli estremi, che e' dove
 * cadono quasi tutte le insegne: o il prezzo lo pubblicano quasi sempre, o
 * quasi mai. Per decidere quali insegne tenere in prima fila e cosa dire a un
 * cliente, e' piu' che sufficiente.
 *
 * Il rapporto scrive sempre il numero di schede su cui la stima si regge: una
 * percentuale senza il suo campione e' un numero che non si puo' controllare.
 *
 * COSTO
 * -----
 * 144 insegne x 120 schede = circa 17.000 pagine, poco piu' di un'ora. E' un
 * millesimo di quel che costerebbe verificarle tutte, e risponde alla stessa
 * domanda.
 *
 * Uso:
 *   npx tsx scripts/campiona-tutto.ts                 tutte le insegne
 *   npx tsx scripts/campiona-tutto.ts --schede 60     campione piu' piccolo
 *   npx tsx scripts/campiona-tutto.ts --solo ES,DE    solo questi paesi
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { nomeDaUrl } from "../src/catalogo.js";
import { verifyProductPage } from "../src/price-page.js";
import { salvaPrezzi, type PrezzoSalvato } from "../src/prezzi-magazzino.js";

const CARTELLA = "diario/raccolto";
const DOVE = "diario/campione-europa.json";

/** Quante schede aprire per insegna. Vedi l'intestazione sul margine. */
const SCHEDE = 120;
/** Quante insieme. Otto, come ovunque: non si va piu' forte perche' e' notte. */
const INSIEME = 8;
const PAUSA_MS = 120;

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));
const n = (x: number) => x.toLocaleString("it-IT");
const perc = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

async function aBrani<T>(cose: T[], quante: number, lavoro: (c: T) => Promise<void>) {
  let prossima = 0;
  const lavoratore = async () => {
    while (prossima < cose.length) await lavoro(cose[prossima++]);
  };
  await Promise.all(Array.from({ length: Math.min(quante, cose.length) }, lavoratore));
}

/**
 * Un campione sparso su tutto il catalogo, non un blocco.
 *
 * Passo costante invece di numeri casuali: cosi' il campione e' ripetibile —
 * due giri sulla stessa insegna misurano le stesse schede e le differenze che
 * si vedono sono del negozio, non del sorteggio.
 */
function sparso<T>(tutti: T[], quanti: number): T[] {
  if (tutti.length <= quanti) return tutti;
  const passo = tutti.length / quanti;
  const fuori: T[] = [];
  for (let i = 0; i < quanti; i++) fuori.push(tutti[Math.floor(i * passo)]);
  return fuori;
}

interface Esito {
  paese: string;
  insegna: string;
  inCatalogo: number;
  campione: number;
  siAprono: number;
  conPrezzo: number;
  quotaVive: number;
  quotaConPrezzo: number;
  stimaVive: number;
  stimaConPrezzo: number;
  secondi: number;
}

async function main() {
  const arg = (nome: string) =>
    process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

  const quante = Number(arg("--schede") ?? SCHEDE);
  const filtro = arg("--solo")
    ? new Set(
        arg("--solo")!
          .split(",")
          .map((s) => s.trim().toUpperCase()),
      )
    : null;

  const file = readdirSync(CARTELLA)
    .filter((f) => f.endsWith(".txt.gz"))
    .filter((f) => !filtro || filtro.has(f.slice(0, 2).toUpperCase()));

  console.log(
    `${file.length} insegne · ${quante} schede ciascuna · ` +
      `circa ${n(file.length * quante)} pagine da aprire\n`,
  );

  /* SI RIPRENDE DA DOVE SI ERA ARRIVATI.
     Cinque ore di lavoro non possono dipendere dal fatto che nessuno chiuda
     il terminale. Le insegne gia' misurate stanno nel file: si saltano, e
     rilanciare costa solo quel che manca. */
  let esiti: Esito[] = [];
  if (existsSync(DOVE) && !process.argv.includes("--riparti")) {
    try {
      esiti = (JSON.parse(readFileSync(DOVE, "utf8")).perInsegna ?? []) as Esito[];
    } catch {
      esiti = [];
    }
  }
  const gia = new Set(esiti.map((e) => `${e.paese}|${e.insegna}`));
  if (gia.size > 0) console.log(`${gia.size} insegne gia' misurate: le salto
`);

  const inizio = Date.now();

  for (const f of file) {
    const paese = f.slice(0, 2).toUpperCase();
    const insegna = f.slice(3).replace(/\.txt\.gz$/, "").replace(/_/g, " ").trim();
    if (gia.has(`${paese}|${insegna}`)) continue;
    const t = Date.now();

    const tutti = gunzipSync(readFileSync(`${CARTELLA}/${f}`))
      .toString("utf8")
      .split("\n")
      .filter(Boolean);
    const campione = sparso(tutti, quante);

    let siAprono = 0;
    let conPrezzo = 0;
    let fatte = 0;
    const daSalvare: PrezzoSalvato[] = [];

    await aBrani(campione, INSIEME, async (url) => {
      /* Un'insegna sola sono centoventi pagine e qualche minuto: senza una
         riga ogni tanto, un lavoro da un'ora sembra fermo — e se muore non si
         sa nemmeno dove. E' successo: il primo giro e' morto in silenzio
         perche' si stampava solo a insegna finita. */
      if (++fatte % 30 === 0) {
        console.log(`   ${paese} ${insegna}: ${fatte}/${campione.length}`);
      }

      /* Una scheda che fa esplodere il lettore non deve portarsi via l'intero
         giro: si conta come non raggiungibile e si tira dritto. */
      let v: Awaited<ReturnType<typeof verifyProductPage>>;
      try {
        v = await verifyProductPage(url);
      } catch {
        return;
      }
      if (v.status !== "non-raggiungibile") siAprono++;
      if (v.page?.current != null) conPrezzo++;

      /* Il campione finisce anche in magazzino: sono pagine aperte comunque,
         e buttarne il risultato vorrebbe dire riaprirle domani per sapere
         quello che gia' sappiamo. */
      daSalvare.push({
        url,
        prezzo: v.page?.current ?? null,
        valuta: v.page?.currency ?? "",
        nome: nomeDaUrl(url) ?? "",
        insegna,
        verifica: v.status,
        visto: new Date(),
      });
      await attendi(PAUSA_MS);
    });

    await salvaPrezzi(daSalvare);

    const quotaVive = siAprono / campione.length;
    const quotaConPrezzo = conPrezzo / campione.length;
    const e: Esito = {
      paese,
      insegna,
      inCatalogo: tutti.length,
      campione: campione.length,
      siAprono,
      conPrezzo,
      quotaVive: Number(quotaVive.toFixed(3)),
      quotaConPrezzo: Number(quotaConPrezzo.toFixed(3)),
      stimaVive: Math.round(tutti.length * quotaVive),
      stimaConPrezzo: Math.round(tutti.length * quotaConPrezzo),
      secondi: Math.round((Date.now() - t) / 1000),
    };
    esiti.push(e);

    console.log(
      `${paese}  ${insegna.padEnd(26).slice(0, 26)} ` +
        `${n(tutti.length).padStart(8)} in catalogo · ` +
        `vive ${String(perc(siAprono, campione.length)).padStart(3)}% · ` +
        `prezzo ${String(perc(conPrezzo, campione.length)).padStart(3)}% · ` +
        `stima ${n(e.stimaConPrezzo).padStart(8)} con prezzo`,
    );

    // Si salva a ogni insegna: un'ora di lavoro non deve dipendere dall'ultima riga.
    writeFileSync(DOVE, JSON.stringify(riepilogo(esiti, inizio), null, 2), "utf8");
  }

  const r = riepilogo(esiti, inizio);
  console.log("\n" + "═".repeat(74));
  console.log("  QUANTO VALE DAVVERO IL CATALOGO");
  console.log("═".repeat(74));
  console.log(`  indirizzi in catalogo         ${n(r.totali.inCatalogo)}`);
  console.log(
    `  di cui vivi (stima)           ${n(r.totali.stimaVive)}  (${r.totali.quotaVive}%)`,
  );
  console.log(
    `  CON PREZZO LEGGIBILE (stima)  ${n(r.totali.stimaConPrezzo)}  (${r.totali.quotaConPrezzo}%)`,
  );
  console.log(`\n  misurato aprendo davvero      ${n(r.totali.schedeAperte)} schede`);
  console.log(`  tempo                         ${Math.round(r.totali.secondi / 60)} minuti`);
  console.log(`\n  dettaglio in ${DOVE}\n`);
  process.exit(0);
}

function riepilogo(esiti: Esito[], inizio: number) {
  const inCatalogo = esiti.reduce((a, e) => a + e.inCatalogo, 0);
  const stimaVive = esiti.reduce((a, e) => a + e.stimaVive, 0);
  const stimaConPrezzo = esiti.reduce((a, e) => a + e.stimaConPrezzo, 0);
  const schedeAperte = esiti.reduce((a, e) => a + e.campione, 0);

  const perPaese = new Map<
    string,
    { insegne: number; inCatalogo: number; stimaConPrezzo: number; campione: number }
  >();
  for (const e of esiti) {
    const c = perPaese.get(e.paese) ?? {
      insegne: 0,
      inCatalogo: 0,
      stimaConPrezzo: 0,
      campione: 0,
    };
    c.insegne++;
    c.inCatalogo += e.inCatalogo;
    c.stimaConPrezzo += e.stimaConPrezzo;
    c.campione += e.campione;
    perPaese.set(e.paese, c);
  }

  return {
    generatoIl: new Date().toISOString(),
    comeSiLegge:
      "le stime vengono da un campione aperto davvero per ogni insegna; " +
      "`schedeAperte` dice su quante schede si reggono",
    totali: {
      insegne: esiti.length,
      paesi: perPaese.size,
      inCatalogo,
      stimaVive,
      stimaConPrezzo,
      quotaVive: perc(stimaVive, inCatalogo),
      quotaConPrezzo: perc(stimaConPrezzo, inCatalogo),
      schedeAperte,
      secondi: Math.round((Date.now() - inizio) / 1000),
    },
    perPaese: [...perPaese.entries()]
      .sort((a, b) => b[1].stimaConPrezzo - a[1].stimaConPrezzo)
      .map(([paese, v]) => ({
        paese,
        insegne: v.insegne,
        inCatalogo: v.inCatalogo,
        stimaConPrezzo: v.stimaConPrezzo,
        quota: perc(v.stimaConPrezzo, v.inCatalogo),
        schedeAperte: v.campione,
      })),
    perInsegna: [...esiti].sort((a, b) => b.stimaConPrezzo - a.stimaConPrezzo),
  };
}

/* Un errore che nessuno raccoglie fa uscire Node in silenzio, e un lavoro da
   un'ora sparisce senza dire perche'. Qui si stampa e si prosegue: una pagina
   storta non vale il giro intero. */
process.on("unhandledRejection", (motivo) => {
  console.error("[scarto una promessa rotta]", motivo);
});

main().catch((e) => {
  console.error("[morto]", e);
  process.exit(1);
});
