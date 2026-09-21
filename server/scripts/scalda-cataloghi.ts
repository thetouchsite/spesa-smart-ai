/**
 * Porta i cataloghi grossi sul disco, una volta, con calma.
 *
 * IL PROBLEMA, MISURATO
 * ---------------------
 * Atlas nel piano gratuito da' cento kilobyte al secondo. Non e' il nostro
 * codice: e' la banda del piano, e non si aggira scrivendo meglio.
 *
 *     AR|Disco            4.302 KB    45 secondi
 *     CO|Carulla          5.543 KB    57 secondi
 *     AE|Carrefour UAE   20.000 KB   oltre tre minuti
 *
 * Il lettore, per ogni giro, rimonta la coda: rilegge i cataloghi delle
 * insegne che ha in mano. Con cinque cataloghi grossi sono quattro minuti di
 * attesa PRIMA di aprire una pagina, ogni volta — e il tetto di memoria butta
 * via quelli appena letti, quindi al giro dopo si ripaga tutto.
 *
 * Il lettore la cache su disco ce l'ha gia' e funziona: quarantacinque
 * secondi diventano cinque millisecondi. Ma la riempie leggendo, cioe'
 * PAGANDO, e se il giro finisce prima non la riempie affatto — il che e'
 * esattamente cio' che succede quando il catalogo e' grosso.
 *
 * Questo comando la riempie e basta. Non apre nessuna pagina di negozio, non
 * scrive niente sul database: scarica, mette sul disco, esce. Si lancia una
 * volta prima dei lettori, o dopo aver rifatto un catalogo.
 *
 * PERCHE' NON PASSA DA `catalogoSalvato`
 * --------------------------------------
 * Perche' quello ha novanta secondi di tetto, ed e' giusto che ce li abbia:
 * sta dietro a una richiesta di un utente. Qui non aspetta nessuno, quindi si
 * aspetta finche' serve — e infatti i cinque cataloghi piu' grossi che
 * abbiamo, per `catalogoSalvato`, sono tutti «illeggibili».
 *
 *   npx tsx --env-file-if-exists=.env scripts/scalda-cataloghi.ts
 *   npx tsx --env-file-if-exists=.env scripts/scalda-cataloghi.ts --paese AR
 *   npx tsx --env-file-if-exists=.env scripts/scalda-cataloghi.ts --minimo 50000
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cataloghi } from "../src/base/db.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const soloPaese = (arg("--paese") ?? "").toUpperCase();
/** Sotto questa soglia il lettore se li scarica da solo senza che si noti. */
const MINIMO = Number(arg("--minimo") ?? 20000);

/* LA STESSA CARTELLA E LO STESSO NOME DEL LETTORE.
   Se cambiassero, questo comando riempirebbe una cache che nessuno legge — e
   sarebbe un lavoro che sembra fatto. Vedi `CACHE` in `prezzi-continuo.ts`. */
const CACHE = "diario/cataloghi";
const sulDisco = (paese: string, insegna: string) =>
  `${CACHE}/${paese}-${insegna.replace(/[^\p{L}\p{N}]+/gu, "_")}`;

const n = (v: number) => v.toLocaleString("it-IT");
const C = await cataloghi();

const filtro: Record<string, unknown> = {};
if (soloPaese) filtro.paese = soloPaese;

const elenco = (await C.find(filtro as never)
  .project({ paese: 1, insegna: 1, prodotti: 1, pezzi: 1, aggiornato: 1 })
  .toArray()) as Array<{
  _id: string;
  paese: string;
  insegna: string;
  prodotti?: number;
  pezzi?: number;
  aggiornato?: Date;
}>;

const grossi = elenco
  .filter((x) => !String(x._id).includes("#"))
  .filter((x) => Number(x.prodotti ?? 0) >= MINIMO)
  .sort((a, b) => Number(b.prodotti ?? 0) - Number(a.prodotti ?? 0));

console.log("");
console.log(`SCALDO ${grossi.length} cataloghi da almeno ${n(MINIMO)} voci`);
console.log("");

mkdirSync(CACHE, { recursive: true });

let scaldati = 0;
let gia = 0;
let falliti = 0;
let byte = 0;
const partito = Date.now();

for (const c of grossi) {
  const quanti = Math.max(1, Number(c.pezzi) || 1);
  const quando = c.aggiornato ? new Date(c.aggiornato).getTime() : 0;
  const eti = `  ${(c.paese + "|" + c.insegna).padEnd(28).slice(0, 28)}`;

  /* Un pezzo alla volta, e quelli gia' sul disco non si riscaricano: dopo la
     prima volta questo comando costa qualche millisecondo. */
  let mancanti = 0;
  for (let i = 0; i < quanti; i++) {
    const base = `${sulDisco(c.paese, c.insegna)}${i === 0 ? "" : "-" + (i + 1)}`;
    try {
      if (existsSync(base + ".gz") && Number(readFileSync(base + ".quando", "utf8")) === quando) {
        continue;
      }
    } catch {
      /* `.quando` illeggibile: si riscarica, che e' il ripiego giusto. */
    }
    mancanti++;
  }

  if (mancanti === 0) {
    gia++;
    continue;
  }

  process.stdout.write(`${eti} ${n(Number(c.prodotti ?? 0)).padStart(8)} voci · ${quanti} pezzi ...`);
  const t = Date.now();
  let presi = 0;
  let suoi = 0;

  for (let i = 0; i < quanti; i++) {
    const id = i === 0 ? `${c.paese}|${c.insegna}` : `${c.paese}|${c.insegna}#${i + 1}`;
    const base = `${sulDisco(c.paese, c.insegna)}${i === 0 ? "" : "-" + (i + 1)}`;
    try {
      if (existsSync(base + ".gz") && Number(readFileSync(base + ".quando", "utf8")) === quando) {
        presi++;
        continue;
      }
    } catch {
      /* si riscarica */
    }
    try {
      /* NESSUN TETTO. E' il punto di tutto il comando: qui non aspetta
         nessuno, e i cataloghi che servono davvero sono proprio quelli che
         non stanno dentro nessun tetto ragionevole. */
      const doc = (await C.findOne({ _id: id } as never)) as { dati?: { buffer: Buffer } } | null;
      if (!doc?.dati) continue;
      const dati = Buffer.from(doc.dati.buffer);
      writeFileSync(base + ".gz", dati);
      writeFileSync(base + ".quando", String(quando));
      presi++;
      suoi += dati.length;
    } catch (err) {
      console.log(`\n${eti} pezzo ${i + 1} non riuscito: ${err instanceof Error ? err.message.slice(0, 60) : err}`);
    }
  }

  byte += suoi;
  const secondi = (Date.now() - t) / 1000;
  if (presi === quanti) {
    scaldati++;
    console.log(
      `\r${eti} ${n(Number(c.prodotti ?? 0)).padStart(8)} voci · ` +
        `${(suoi / 1048576).toFixed(1)} MB in ${secondi.toFixed(0)}s`,
    );
  } else {
    falliti++;
    console.log(`\r${eti} SOLO ${presi}/${quanti} pezzi in ${secondi.toFixed(0)}s`);
  }
}

const minuti = (Date.now() - partito) / 60000;
console.log("");
console.log(
  `  ${scaldati} scaldati · ${gia} gia' sul disco · ${falliti} incompleti · ` +
    `${(byte / 1048576).toFixed(0)} MB in ${minuti.toFixed(1)} minuti`,
);
if (byte > 0) {
  console.log(`  banda vera: ${((byte / 1024) / (minuti * 60)).toFixed(0)} KB/s`);
}
console.log("");
console.log("  Adesso i lettori montano la coda in millisecondi invece che in minuti.");
console.log("");
process.exit(0);
