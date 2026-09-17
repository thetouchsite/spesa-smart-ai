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
import { statoMagazzino } from "../src/api/prezzi-magazzino.js";

const n = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

const MINUTI = Number(arg("--minuti") ?? process.env.LETTORE_MINUTI ?? 30);
const QUANTI_PAESI = Number(arg("--paesi") ?? process.env.LETTORE_PAESI ?? 6);
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

  /* Si riparte da dove si era arrivati: senza, i primi sei paesi verrebbero
     letti per sempre e gli altri non li vedrebbe mai nessuno. */
  let da = 0;
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
    const daCui = liberi.length > 0 ? liberi : disponibili;

    const scelti: string[] = [];
    for (let i = 0; i < Math.min(QUANTI_PAESI, daCui.length); i++) {
      scelti.push(daCui[(da + i) % daCui.length]);
    }
    da = (da + scelti.length) % Math.max(1, daCui.length);
    giro++;

    if (liberi.length === 0) {
      console.log(`  [${ora()}] tutti i ${disponibili.length} paesi sono presi: aspetto`);
      await new Promise((r) => setTimeout(r, PAUSA_MS));
      continue;
    }

    /* «chiedo» e non l'elenco secco: i paesi si prenotano, e se un altro
       lettore ne ha gia' in mano qualcuno questo giro ne lavorera' meno di
       quelli scritti qui. Il giro stesso lo dice nella riga dopo. */
    console.log(`  [${ora()}] giro ${giro}: chiedo ${scelti.join(" ")}`);
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
