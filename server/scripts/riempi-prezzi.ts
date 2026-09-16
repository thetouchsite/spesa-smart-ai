/**
 * Riempire il magazzino dei prezzi, adesso, a mano.
 *
 * IL LAVORO VERO STA IN `src/api/prezzi-notturni.ts`.
 * Questo file e' solo la maniglia: legge gli argomenti, chiama, stampa. E'
 * stato spostato li' perche' finche' stava qui dentro lo lanciava una persona
 * quando se ne ricordava — e il magazzino dei prezzi restava vuoto tutte le
 * altre notti. Ora lo chiama anche il lavoro notturno, da solo.
 *
 * Serve ancora per due cose: riempire un paese subito senza aspettare
 * mezzanotte, e vedere i numeri mentre scorrono.
 *
 * IL DATABASE VA ACCESO A MANO, QUI.
 * Il server legge il `.env` con il flag di Node (`--env-file-if-exists`), non
 * con una libreria: lanciando lo script senza quel flag `MONGODB_URI` non
 * esiste, il magazzino si spegne da solo e il lavoro finisce in memoria — cioe'
 * nel nulla. Non da' errore, e questo e' il punto: sembra funzionare.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/riempi-prezzi.ts
 *   ... --solo ES,IT      solo questi paesi
 *   ... --voci 100        quante voci per paese
 */

import { riempiPrezzi } from "../src/api/prezzi-notturni.js";
import { statoMagazzino } from "../src/api/prezzi-magazzino.js";

const orologio = (s: number) =>
  `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;

async function main() {
  const arg = (nome: string) =>
    process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;

  const quante = Number(arg("--voci") ?? 60);
  const paesi = (arg("--solo") ?? "IT,ES,FR,GB,PT,DE")
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);

  console.log(`Riempio il magazzino: ${paesi.join(" ")} · fino a ${quante} voci per paese`);
  console.log("prima:", await statoMagazzino());

  const inizio = Date.now();
  for (const p of paesi) {
    try {
      await riempiPrezzi(p, quante);
    } catch (e) {
      console.log(`\n${p}  saltato: ${(e as Error).message}`);
    }
  }

  console.log("\ndopo:", await statoMagazzino());
  console.log(`tempo totale: ${orologio((Date.now() - inizio) / 1000)}\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
