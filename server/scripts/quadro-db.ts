/**
 * COSA SERVIRA' L'API DOMANI MATTINA. Letto dal database, non dalle stime.
 *
 * PERCHE' ESISTE
 * --------------
 * Il cruscotto dei dati mostrava 1.872.278 prodotti, e quel numero era la
 * somma del campo `stimati` di `catalogo-fonti.ts` — cioe' di conteggi scritti
 * a mano, alcuni vecchi di mesi. Nessuno l'aveva mai confrontato con quel che
 * c'e' davvero salvato.
 *
 * Confrontato il 16 settembre 2026, e non torna in nessuna direzione:
 *
 *   stimato in `catalogo-fonti.ts`        1.902.334
 *   grezzo sul database                   2.644.440   piu' del doppio di certe insegne
 *   SERVIBILE (insegne ancora in elenco)  1.716.324
 *
 * Il terzo e' l'unico che descrive il prodotto. Gli altri due descrivono
 * rispettivamente cosa credevamo e cosa abbiamo accumulato.
 *
 * Fra le differenze: Carrefour Brasile e' scritto a 80.000 prodotti e ne
 * conta ZERO; il magazzino teneva 100.000 articoli di Marks & Spencer, che
 * vende vestiti, e 34.785 di cibo per cani.
 *
 * COSA MISURA, E PERCHE' DUE MAGAZZINI E NON UNO
 * ----------------------------------------------
 *   CATALOGO   gli indirizzi: quanti prodotti sappiamo che esistono e dove.
 *              Vale trenta ore, lo riscrive il lavoro notturno.
 *   PREZZI     quanti di quegli indirizzi hanno un prezzo letto e ancora
 *              valido. Vale ventiquattro ore.
 *
 * Un catalogo pieno e un magazzino prezzi vuoto non e' mezzo servizio: e'
 * un'app che per ogni voce apre le pagine dal vivo mentre l'utente aspetta.
 * Per questo le due colonne stanno accanto e non si sommano.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/quadro-db.ts
 *   npx tsx --env-file-if-exists=.env scripts/quadro-db.ts --json diario/quadro.json
 */

import { writeFileSync } from "node:fs";
import { cataloghi, prezzi } from "../src/base/db.js";
import { caricaFontiDalDb, fontiEscluse, tutteLeFonti } from "../src/api/catalogo-fonti.js";
import { FRESCHEZZA_MS } from "../src/api/prezzi-magazzino.js";

/** Trenta ore: quanto vale un catalogo salvato. */
const VALIDITA_CATALOGO_MS = 30 * 3_600_000;

interface RigaPaese {
  paese: string;
  insegneInElenco: number;
  insegneNelDb: number;
  link: number;
  linkFreschi: number;
  prezzi: number;
  prezziConCifra: number;
  /** Col prezzo E ancora validi: quel che l'API serve senza riaprire niente. */
  vendibili: number;
}

async function main() {
  /* Le insegne stanno sul database come tutto il resto: qui si leggono, non si
     importano da un file. E' il punto di tutta la riorganizzazione del 16
     settembre 2026 — un elenco solo non puo' divergere da se stesso. */
  const quante = await caricaFontiDalDb();
  if (quante === 0) {
    console.error("  il database non ha insegne: `semina-fonti` non e' mai girato?");
    process.exit(1);
  }
  const FONTI = tutteLeFonti();
  const fuori = await fontiEscluse();

  const inElenco = new Map(FONTI.map((f) => [`${f.paese}|${f.insegna}`, f]));
  const escluse = new Set(fuori.map((f) => `${f.paese}|${f.insegna}`));

  const docCat = (await (await cataloghi())
    .find({}, { projection: { _id: 1, paese: 1, insegna: 1, prodotti: 1, aggiornato: 1 } })
    .toArray()) as Array<{ paese: string; insegna: string; prodotti?: number; aggiornato?: Date }>;

  /* Nella forma stretta la riga porta il NUMERO dell'insegna, non il nome:
     `c` invece di `insegna`, `p` invece di `prezzo`, `t` invece di `visto`.
     Ottanta megabyte di differenza su cinque milioni di righe. */
  /* IL CONTO LO FA MONGO, NON QUESTO COMPUTER.
     Prima si tiravano giu' tutte le righe dei prezzi - novecentotrentottomila,
     e domani cinque milioni - per poi contarle qui. Su Atlas vuol dire portarsi
     l'intera collezione attraverso la rete: lo script ci metteva piu' di otto
     minuti e finiva ammazzato dal tempo massimo, lasciando il cruscotto fermo
     alla settimana prima senza che nessuno se ne accorgesse.

     Raggruppare per insegna e per freschezza e' esattamente il lavoro per cui
     un database esiste. Tornano indietro un centinaio di righe invece di un
     milione, e il tempo passa da minuti a un paio di secondi. */
  /* QUATTRO NUMERI, NON DUE, PERCHE' SONO QUATTRO DOMANDE DIVERSE.
     «Quanti prodotti ho» e «quanti ne posso servire adesso» non sono la
     stessa cosa, e nemmeno «quante schede ho aperto». Tenerle insieme e'
     esattamente il modo in cui un cruscotto mente:

       quante     schede aperte, col prezzo e senza
       conCifra   quelle che un prezzo ce l'hanno       <- i prodotti veri
       fresche    aperte di recente
       vendibili  col prezzo E ancora valide            <- quel che l'API da'

     Il numero su cui si decide se il progetto sta in piedi e' `conCifra`.
     Quello che l'app serve stamattina e' `vendibili`. Il secondo e' sempre
     piu' piccolo del primo, e va bene: vuol dire solo che qualche prezzo e'
     da rinfrescare, non che il prodotto non c'e'. */
  const soglia = new Date(Date.now() - FRESCHEZZA_MS);
  const perInsegna = (await (await prezzi())
    .aggregate([
      {
        $group: {
          _id: "$c",
          quante: { $sum: 1 },
          conCifra: { $sum: { $cond: [{ $ne: ["$p", null] }, 1, 0] } },
          fresche: { $sum: { $cond: [{ $gte: ["$t", soglia] }, 1, 0] } },
          vendibili: {
            $sum: {
              $cond: [{ $and: [{ $ne: ["$p", null] }, { $gte: ["$t", soglia] }] }, 1, 0],
            },
          },
        },
      },
    ])
    .toArray()) as Array<{
    _id: number;
    quante: number;
    conCifra: number;
    fresche: number;
    vendibili: number;
  }>;

  const { fonti: collezioneFonti } = await import("../src/base/db.js");
  const paeseDelNumero = new Map<number, string>();
  for (const r of await (await collezioneFonti()).find({}, { projection: { id: 1, paese: 1 } }).toArray()) {
    if (typeof r.id === "number") paeseDelNumero.set(r.id, r.paese);
  }

  const ora = Date.now();
  const perPaese = new Map<string, RigaPaese>();
  const riga = (p: string) => {
    let r = perPaese.get(p);
    if (!r) {
      r = { paese: p, insegneInElenco: 0, insegneNelDb: 0, link: 0, linkFreschi: 0, prezzi: 0, prezziConCifra: 0, vendibili: 0 };
      perPaese.set(p, r);
    }
    return r;
  };

  for (const f of FONTI) riga(f.paese).insegneInElenco++;

  /* SOLO LE INSEGNE ANCORA IN ELENCO.
     Un catalogo salvato di un'insegna che non chiediamo piu' non e' servizio:
     e' spazio occupato. Tenerlo nel conto e' esattamente l'errore che questo
     strumento esiste per non fare piu'. */
  let orfaneLink = 0;
  let orfane = 0;
  for (const d of docCat) {
    const chiave = `${d.paese}|${d.insegna}`;
    if (!inElenco.has(chiave)) {
      if (!escluse.has(chiave)) {
        orfane++;
        orfaneLink += d.prodotti ?? 0;
      }
      continue;
    }
    const r = riga(d.paese);
    r.insegneNelDb++;
    r.link += d.prodotti ?? 0;
    if (d.aggiornato && ora - new Date(d.aggiornato).getTime() < VALIDITA_CATALOGO_MS) {
      r.linkFreschi += d.prodotti ?? 0;
    }
  }

  /* Ogni riga porta gia' i suoi quattro conti, fatti da Mongo: qui si
     sommano per paese e basta. */
  for (const d of perInsegna) {
    const p = paeseDelNumero.get(d._id);
    if (!p) continue;
    const r = riga(p);
    r.prezzi += d.quante;
    r.prezziConCifra += d.conCifra;
    r.vendibili += d.vendibili;
  }

  const righe = [...perPaese.values()].filter((r) => r.link > 0 || r.prezzi > 0);
  righe.sort((a, b) => b.link - a.link);

  const tot = righe.reduce(
    (a, r) => ({
      link: a.link + r.link,
      freschi: a.freschi + r.linkFreschi,
      prezzi: a.prezzi + r.prezzi,
      cifre: a.cifre + r.prezziConCifra,
      vendibili: a.vendibili + r.vendibili,
    }),
    { link: 0, freschi: 0, prezzi: 0, cifre: 0, vendibili: 0 },
  );

  /* QUANTE PAGINE ABBIAMO APERTO SENZA TROVARE UN PREZZO.
     Serve al cruscotto per la resa, e senza di questo quel numero e' una
     bugia: la resa si faceva `righe con cifra / righe totali`, giusta finche'
     una pagina senza prezzo lasciava una riga vuota. Da quando non la lascia
     piu' quel rapporto vale SEMPRE cento per cento, e il cruscotto prometteva
     «il 100% aveva un prezzo» proiettando quattro milioni e mezzo di prodotti
     — cioe' il numero degli indirizzi.

     Il denominatore giusto e' quante pagine si sono APERTE: quelle che un
     prezzo l'hanno dato piu' quelle che si sono aperte senza. */
  const { quantiScarti } = await import("../src/api/scarti.js");
  const scartate = [...(await quantiScarti()).values()].reduce((a, x) => a + x, 0);

  const n = (x: number) => x.toLocaleString("it-IT");

  console.log("\n  QUEL CHE L'API SERVE OGGI, letto dal database\n");
  console.log(`  ${"paese".padEnd(7)}${"insegne".padStart(9)}${"link".padStart(12)}${"freschi".padStart(12)}${"prezzi".padStart(9)}${"con cifra".padStart(11)}`);
  console.log("  " + "─".repeat(60));
  for (const r of righe) {
    console.log(
      `  ${r.paese.padEnd(7)}${`${r.insegneNelDb}/${r.insegneInElenco}`.padStart(9)}` +
        `${n(r.link).padStart(12)}${n(r.linkFreschi).padStart(12)}` +
        `${n(r.prezzi).padStart(9)}${n(r.prezziConCifra).padStart(11)}`,
    );
  }
  console.log("  " + "─".repeat(60));
  console.log(
    `  ${"TOTALE".padEnd(16)}${n(tot.link).padStart(12)}${n(tot.freschi).padStart(12)}` +
      `${n(tot.prezzi).padStart(9)}${n(tot.cifre).padStart(11)}`,
  );

  const stimati = FONTI.reduce((a, f) => a + f.stimati, 0);
  const aperte = tot.cifre + scartate;
  console.log(
    `\n  pagine aperte                : ${n(aperte)}` +
      `  (${n(tot.cifre)} con prezzo, ${n(scartate)} senza)`,
  );
  if (aperte > 0) {
    console.log(`  resa vera                    : ${Math.round((tot.cifre / aperte) * 100)}%`);
  }
  console.log(`\n  stimato in catalogo-fonti.ts : ${n(stimati)}`);
  console.log(`  servibile dal database       : ${n(tot.link)}`);
  const scarto = tot.link - stimati;
  console.log(`  scarto                       : ${scarto >= 0 ? "+" : ""}${n(scarto)}`);
  if (orfane > 0) {
    console.log(`\n  ancora orfane sul database: ${orfane} insegne, ${n(orfaneLink)} link non servibili`);
  }

  const dove = process.argv.includes("--json")
    ? process.argv[process.argv.indexOf("--json") + 1]
    : "diario/quadro-db.json";
  writeFileSync(
    dove,
    JSON.stringify(
      {
        quando: new Date().toISOString(),
        totale: tot,
        scartate,
        stimati,
        orfane,
        orfaneLink,
        paesi: righe,
        /* Il cruscotto disegna e basta: tutto quel che gli serve sta qui, e non
           tocca ne' il database ne' l'elenco. Un disegnatore che interroga il
           database e' un disegnatore che puo' mostrare numeri diversi da questi. */
        insegneInElenco: FONTI.length,
        mute: FONTI.filter((f) => f.resa === 0).map((f) => ({ paese: f.paese, insegna: f.insegna, stimati: f.stimati })),
        tuttoMuto: [...new Set(FONTI.map((f) => f.paese))].filter(
          (p) => !FONTI.some((f) => f.paese === p && f.resa > 0),
        ),
        fuori: fuori.map((f) => ({ paese: f.paese, insegna: f.insegna, stimati: f.stimati, esclusa: f.esclusa })),
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\n  scritto in ${dove}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
