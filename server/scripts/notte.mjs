/**
 * Il turno di notte: ricognizione, poi raccolta, senza nessuno che guardi.
 *
 * Le due fasi sono separate perche' rispondono a due domande diverse — quali
 * insegne valgono la pena, e quanti prodotti hanno davvero — ma di notte vanno
 * in fila, e nessuno e' sveglio per far partire la seconda.
 *
 * Questo le incatena: aspetta che la ricognizione finisca, poi lancia la
 * raccolta sulle insegne che ha promosso, e le lascia il tempo che resta.
 *
 * Se la ricognizione e' gia' in corso — com'e' quasi sempre, perche' si parte
 * da li' — non ne avvia una seconda: aspetta quella.
 *
 * Uso:  node scripts/notte.mjs --ore 5
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ORE = process.argv.includes("--ore")
  ? Number(process.argv[process.argv.indexOf("--ore") + 1])
  : 5;

const avvio = Date.now();
const attendi = (ms) => new Promise((r) => setTimeout(r, ms));
const orologio = (s) =>
  `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;

const ora = () => new Date().toTimeString().slice(0, 8);
const dico = (t) => console.log(`[${ora()}] ${t}`);

function statoRicognizione() {
  if (!existsSync("diario/scoperta-stato.json")) return null;
  try {
    return JSON.parse(readFileSync("diario/scoperta-stato.json", "utf8"));
  } catch {
    // Puo' capitare di leggerlo mentre viene riscritto: si riprova dopo.
    return null;
  }
}

/** Lancia uno script e aspetta che finisca, mandando il suo output al nostro. */
function esegui(script, argomenti) {
  return new Promise((risolvi) => {
    const p = spawn(process.execPath, [script, ...argomenti], { stdio: "inherit" });
    p.on("exit", (codice) => risolvi(codice ?? 0));
    p.on("error", () => risolvi(1));
  });
}

async function main() {
  dico(`turno di notte, ${ORE} ore in tutto`);

  /* PRIMA FASE — o l'attesa di quella che gira gia'.
     Si riconosce dal cruscotto: se esiste ed e' stato toccato da meno di
     cinque minuti, qualcuno sta lavorando e non serve un secondo scanner
     addosso agli stessi siti. */
  const s = statoRicognizione();
  const viva = s && Date.now() - new Date(s.aggiornato).getTime() < 5 * 60 * 1000;

  if (viva && s.percentuale < 100) {
    dico(`ricognizione gia' in corso (${s.avanzamento}), aspetto che finisca`);
    let fermo = 0;
    let ultimo = s.avanzamento;
    while (true) {
      await attendi(60_000);
      const adesso = statoRicognizione();
      if (!adesso) continue;
      if (adesso.percentuale >= 100) break;
      if (adesso.avanzamento === ultimo) {
        // Quindici minuti senza muoversi: e' morta, si va avanti lo stesso con
        // quello che ha trovato. Aspettarla per sempre sprecherebbe la notte.
        if (++fermo >= 15) {
          dico(`ricognizione ferma a ${adesso.avanzamento} da 15 minuti, proseguo`);
          break;
        }
      } else {
        fermo = 0;
        ultimo = adesso.avanzamento;
        dico(`ricognizione ${adesso.avanzamento} · ${adesso.bottino.paesi.length} paesi`);
      }
    }
  } else if (!s || s.percentuale < 100) {
    dico("ricognizione: la avvio io");
    await esegui("scripts/scoperta-europa.mjs", []);
  } else {
    dico("ricognizione gia' completa, passo alla raccolta");
  }

  const fine = statoRicognizione();
  if (fine) {
    dico(
      `ricognizione chiusa: ${fine.bottino.conPrezziConfermati} insegne con prezzi ` +
        `in ${fine.bottino.paesi.length} paesi`,
    );
  }

  /* SECONDA FASE — tutto il tempo che avanza. */
  const restano = ORE - (Date.now() - avvio) / 3_600_000;
  if (restano < 0.25) {
    dico("non resta tempo per la raccolta");
    return;
  }
  dico(`raccolta: ${restano.toFixed(1)} ore a disposizione`);
  await esegui("scripts/raccolta-europa.mjs", ["--ore", String(restano.toFixed(2))]);

  dico(`turno finito dopo ${orologio((Date.now() - avvio) / 1000)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
