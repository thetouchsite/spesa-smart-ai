/**
 * Il lettore, acceso e lasciato andare.
 *
 * A COSA SERVE, VISTO CHE `giro-continuo.ts` C'ERA GIA'
 * -----------------------------------------------------
 * Quello fa UN giro e poi esce: va bene per una prova, non per tenere
 * popolato un magazzino. Questo non esce: finito un giro ne comincia un
 * altro, cambiando paesi, e se qualcosa esplode aspetta un minuto e riparte
 * invece di lasciare il terminale con uno stack trace e il lavoro fermo fino
 * a domani.
 *
 * PERCHE' SUL PC E NON SU RENDER
 * ------------------------------
 * Perche' su Render non ci sta. Il montaggio della coda legge e decomprime i
 * cataloghi, ed e' la parte che consuma di piu': su un piano da mezzo giga il
 * processo viene ucciso prima di aprire una pagina. Si vedeva «partito» e poi
 * silenzio. Un PC fisso ha memoria vera e una rete che non si addormenta, e
 * il lavoro e' proprio quello per cui un PC fisso e' fatto.
 *
 * E SI VEDE LO STESSO DAL PANNELLO
 * --------------------------------
 * Il pannello non guarda il processo: guarda il database. `GiroInCorso`
 * scrive un battito ogni cinque secondi con il nome della macchina, e la
 * pagina su Render lo legge da li'. Non c'e' niente da configurare — basta
 * che `MONGODB_URI` sia lo stesso, e lo e' perche' e' lo stesso `.env`.
 *
 * Nella stessa occasione il battito legge gli ordini: il pulsante «ferma» del
 * pannello lascia un biglietto sul database, e questo lettore lo raccoglie
 * entro pochi secondi. Fermarsi si', avviarsi no — un biglietto lo puo'
 * leggere solo un processo che gia' gira.
 *
 * COME SI CHIAMA QUESTA MACCHINA
 * ------------------------------
 * `NOME_MACCHINA` nel `.env`. Senza, si usa il nome del computer, che nel
 * pannello accanto a «render-xxxx» e' comunque riconoscibile ma dice poco.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/lettore.ts
 *   npx tsx --env-file-if-exists=.env scripts/lettore.ts --minuti 45 --paesi 6
 *   npx tsx --env-file-if-exists=.env scripts/lettore.ts --solo IT,ES,FR
 */

import { hostname } from "node:os";
import {
  caricaFontiDalDb,
  paesiConCatalogo,
  tutteLeFonti,
} from "../src/api/catalogo-fonti.js";
import { giroContinuo } from "../src/api/prezzi-continuo.js";
import { chiTieneIPaesi } from "../src/api/turni.js";
import { contiPesanti } from "../src/api/statistiche.js";
import { battitoDiAttesa, chiStaLavorando } from "../src/api/giri.js";
import { statoMagazzino } from "../src/api/prezzi-magazzino.js";

const n = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

const MINUTI = Number(arg("--minuti") ?? process.env.LETTORE_MINUTI ?? 30);
/**
 * Quanti paesi per giro.
 *
 * DUE, E NON DODICI
 * -----------------
 * Con dodici paesi in mano un lettore ne sfiora tanti e non ne finisce
 * nessuno: ogni giro prende le prime duemila schede di ogni insegna, e con
 * sessanta insegne in coda il tempo finisce prima di aver fatto un passo vero
 * da nessuna parte. Con due, la coda e' piccola, si svuota, e il giro dopo
 * riparte da dove era arrivato: l'Italia la fa uno solo, tutta, e quando ha
 * finito passa ad altro.
 *
 * E i paesi non restano scoperti: sono i biglietti a distribuirli, e chi
 * finisce ne prende altri. Due per volta non vuol dire due in tutto.
 *
 * La concorrenza si adatta da sola: con poche insegne in coda `giroContinuo`
 * abbassa le pagine in parallelo, perche' il tetto che conta e' quante
 * richieste arrivano al SINGOLO negozio, non quante ne regge la nostra
 * macchina.
 */
const QUANTI_PAESI = Number(arg("--paesi") ?? process.env.LETTORE_PAESI ?? 2);
const SOLO = (arg("--solo") ?? "")
  .split(",")
  .map((p) => p.trim().toUpperCase())
  .filter(Boolean);

/** Respiro fra un giro e l'altro: niente di tecnico, e' cortesia verso i negozi. */
const PAUSA_MS = 20_000;
/** Dopo un errore si aspetta di piu': se la rete e' giu', riprovare subito non aiuta. */
const PAUSA_ERRORE_MS = 60_000;

function ora(): string {
  return new Date().toLocaleTimeString("it-IT", { hour12: false });
}

/**
 * I paesi in ordine di quanto rendono, e mai quelli al buio.
 *
 * E' lo stesso criterio del pannello, e non per coerenza estetica: il primo
 * giro lanciato in ordine alfabetico prese BA, BE e CA, dove nessuna insegna
 * pubblica i prezzi. La resa scese dall'80% al 33% — due pagine su tre aperte
 * sapendo gia' che non avrebbero dato niente, e ogni pagina buttata e'
 * comunque una richiesta fatta a un negozio vero.
 */
/**
 * Quanto resta da provare, paese per paese.
 *
 * PERCHE' NON BASTA LA RESA
 * -------------------------
 * `paesiCheRendono` mette in cima chi da' piu' prezzi per pagina aperta, ed e'
 * il criterio giusto per decidere DOVE conviene lavorare. Non dice pero' se li'
 * c'e' ancora qualcosa da fare: un paese con resa altissima e catalogo gia'
 * tutto letto e' il posto peggiore dove andare, perche' si prende il biglietto,
 * si monta la coda, e si scopre che non c'e' niente.
 *
 * Visto dal vero: «giro 1: chiedo SE AR — 0 aperte, 8.947 gia' fresche, 6s».
 * Corretto, e completamente inutile: sei secondi di lavoro per non fare
 * niente, mentre altrove restavano centinaia di migliaia di schede mai
 * provate.
 *
 * I conti per paese ci sono gia' — il pannello li usa, e si rifanno una volta
 * al minuto — quindi qui costano una lettura dalla memoria.
 */
function restaDaFare(): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of contiPesanti().paesi) {
    m.set(r.paese, Math.max(0, r.link - r.prezzi));
  }
  return m;
}

function paesiCheRendono(): string[] {
  const punteggio = new Map<string, number>();
  for (const f of tutteLeFonti()) {
    if (f.resa <= 0) continue;
    punteggio.set(f.paese, (punteggio.get(f.paese) ?? 0) + f.resa * f.stimati);
  }
  const noti = new Set(paesiConCatalogo());
  return [...punteggio.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)
    .filter((p) => noti.has(p));
}

async function main() {
  console.log("");
  console.log("  lettore prezzi — MealMint");
  console.log(`  macchina: ${process.env.NOME_MACCHINA ?? hostname()}`);
  console.log("");

  if (!process.env.MONGODB_URI) {
    console.error("  manca MONGODB_URI nel .env: senza database non c'e' niente da leggere.");
    process.exit(1);
  }
  if ((await caricaFontiDalDb()) === 0) {
    console.error("  il database non ha insegne.");
    process.exit(1);
  }

  const disponibili = SOLO.length > 0 ? SOLO : paesiCheRendono();
  if (disponibili.length === 0) {
    console.error("  nessun paese con insegne che pubblicano prezzi.");
    process.exit(1);
  }

  const prima = await statoMagazzino();
  console.log(`  magazzino: ${JSON.stringify(prima)}`);
  console.log(
    `  ${disponibili.length} paesi in rotazione, ${QUANTI_PAESI} per giro, ${MINUTI} minuti a giro`,
  );
  console.log("  si ferma con Ctrl+C, o dal pulsante «ferma» del pannello.");
  console.log("");

  /* La rotazione non serve piu': l'ordine lo decide quanto resta da fare in
     ogni paese, e un paese finito scende in fondo da solo. */
  let giro = 0;
  let apertesTotali = 0;
  let conPrezzoTotali = 0;

  /* Ctrl+C: si lascia finire la pagina in mano invece di troncare a meta'. Il
     giro chiude il suo battito da solo, e nel pannello la riga sparisce come
     deve invece di restare ambra per due minuti. */
  let uscire = false;
  process.on("SIGINT", () => {
    if (uscire) process.exit(0);
    uscire = true;
    console.log("\n  mi fermo appena finisce il giro in corso… (Ctrl+C di nuovo per uscire subito)");
  });

  for (;;) {
    /* SI CHIEDONO I PAESI LIBERI, NON I PRIMI DELLA CLASSIFICA.
       La rotazione parte dai piu' redditizi, ed e' giusto: se sei solo,
       cominci da dove rende. Ma con quattro lettori accesi i primi quattordici
       sono sempre in mano a qualcuno, e chi riparte li chiede, li trova presi
       e salta il giro — mentre diciassette paesi liberi restano fermi. Visto
       dal vero: il raspberry riacceso chiedeva ES PT IT GB... e non leggeva
       niente.

       Guardare prima chi tiene cosa costa una lettura e cambia il risultato
       da «zero pagine» a «quattordici paesi da lavorare». Fra il momento in
       cui si guarda e quello in cui si prenota un altro lettore puo' averne
       preso uno: non e' un problema, il biglietto resta l'unica verita' e chi
       arriva secondo si tiene il resto. */
    const tenuti = await chiTieneIPaesi();
    const liberi = disponibili.filter((p) => !tenuti.has(p));

    /* FRA I LIBERI, PRIMA QUELLI CHE HANNO ANCORA SCHEDE DA PROVARE.
       Chi non ne ha resta in fondo: non si esclude, perche' fra tre giorni le
       sue schede scadranno e torneranno da rileggere, e un paese escluso per
       sempre e' un pezzo di catalogo che muore in silenzio. */
    const resta = restaDaFare();
    const conLavoro = liberi.filter((p) => (resta.get(p) ?? 0) > 0);
    const daCui = (conLavoro.length > 0 ? conLavoro : liberi.length > 0 ? liberi : disponibili)
      .slice()
      .sort((a, b) => (resta.get(b) ?? 0) - (resta.get(a) ?? 0));

    /* QUANTI NE PUO' PRENDERE UNO SOLO.
       Senza un tetto, il primo lettore acceso si prende quattordici paesi e
       se li tiene per tutti i quarantacinque minuti del giro: chi si accende
       dopo trova solo gli avanzi, e sono gli avanzi a rendere meno. Misurato
       stanotte: il raspberry lavorava su ES e LV al 43%, mentre touchPrice
       teneva Italia e Regno Unito all'82%. Non era il Pi a essere lento, era
       la spartizione a essere ingiusta.

       La quota si ricava da quanti lettori sono vivi, che il registro dei
       giri sa gia'. Si aggiusta da sola: acceso un quarto lettore, ognuno
       prende meno al giro successivo; spento uno, gli altri si allargano. */
    const vivi = await chiStaLavorando();
    const quantiLettori = Math.max(1, new Set(vivi.map((v) => v.macchina + "#" + v.pid)).size);
    const quota = Math.max(1, Math.ceil(disponibili.length / quantiLettori));
    const quanti = Math.min(QUANTI_PAESI, quota, daCui.length);

    const scelti: string[] = [];
    for (let i = 0; i < quanti; i++) scelti.push(daCui[i]);
    giro++;

    if (liberi.length === 0) {
      console.log(`  [${ora()}] tutti i ${disponibili.length} paesi sono presi: aspetto`);
      /* E LO SI DICE ANCHE AL PANNELLO.
         Un lettore che aspetta non apre nessun giro, quindi non scrive nessun
         battito: da fuori sparisce, ed e' identico a uno spento. E' successo
         stanotte al raspberry — acceso, che faceva la cosa giusta, e
         invisibile. `giroContinuo` lo diceva gia' per il suo caso; questo e'
         un secondo punto d'attesa, aggiunto dopo, e si era portato dietro lo
         stesso difetto. */
      await battitoDiAttesa("in attesa: tutti i paesi occupati");
      await new Promise((r) => setTimeout(r, PAUSA_MS));
      continue;
    }

    /* «chiedo» e non l'elenco secco: i paesi si prenotano, e se un altro
       lettore ne ha gia' in mano qualcuno questo giro ne lavorera' meno di
       quelli scritti qui. Il giro stesso lo dice nella riga dopo. */
    const daFare = scelti.reduce((t, p) => t + (resta.get(p) ?? 0), 0);
    console.log(
      `  [${ora()}] giro ${giro}: chiedo ${scelti.join(" ")}` +
        ` (${n(daFare)} schede da provare · ${quantiLettori} lettori, quota ${quota})`,
    );
    try {
      const e = await giroContinuo(scelti, MINUTI, (fatte, con) => {
        const resa = Math.round((con / Math.max(1, fatte)) * 100);
        process.stdout.write(`\r     ${n(fatte)} aperte · ${n(con)} con prezzo (${resa}%)      `);
      });
      apertesTotali += e.aperte;
      conPrezzoTotali += e.conPrezzo;
      const resa = Math.round((e.conPrezzo / Math.max(1, e.aperte)) * 100);
      process.stdout.write("\r");
      console.log(
        `  [${ora()}] giro ${giro} chiuso: ${n(e.aperte)} aperte · ${n(e.conPrezzo)} con prezzo ` +
          `(${resa}%) · ${n(e.saltate)} gia' fresche · ${Math.round(e.secondi)}s`,
      );
      console.log(
        `             da quando e' acceso: ${n(apertesTotali)} aperte, ${n(conPrezzoTotali)} con prezzo`,
      );
    } catch (err) {
      /* Un giro che esplode non deve spegnere il lettore: quasi sempre e' la
         rete che ha singhiozzato, e domattina il magazzino sarebbe fermo alla
         notte prima senza che nessuno se ne sia accorto. */
      process.stdout.write("\r");
      console.error(`  [${ora()}] giro ${giro} caduto:`, err instanceof Error ? err.message : err);
      if (uscire) break;
      console.log(`  [${ora()}] riprovo fra un minuto`);
      await new Promise((r) => setTimeout(r, PAUSA_ERRORE_MS));
      continue;
    }

    if (uscire) break;
    await new Promise((r) => setTimeout(r, PAUSA_MS));
  }

  console.log(`\n  fermato. magazzino: ${JSON.stringify(await statoMagazzino())}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
