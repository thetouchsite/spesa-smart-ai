/**
 * Il diario delle generazioni: cosa è stato chiesto e cosa è stato risposto.
 *
 * PERCHÉ SERVE
 * ------------
 * Durante le prove il registro a schermo dice quante righe sono passate ma non
 * QUALI. Quando qualcosa non torna — un prezzo strano, un negozio inatteso, una
 * lista a metà — l'unico modo di capirlo è riguardare la risposta intera, e
 * quella è già partita verso il telefono.
 *
 * Qui ogni generazione lascia una riga con tutto: profilo richiesto, prodotti,
 * prezzi, negozi, link ed esito della verifica. Si legge dopo, con calma, e si
 * confronta con quello che l'utente ha visto davvero.
 *
 * Una riga per generazione, formato JSON: si apre con qualunque cosa e si
 * filtra con `grep`. Il file sta in `server/diario/` ed è in .gitignore —
 * contiene le scelte di chi prova l'app, e non ha motivo di finire nel
 * repository.
 *
 * Si spegne con DIARIO=0. In produzione va spento: qui serve a noi mentre
 * mettiamo a punto il motore, non agli utenti.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CARTELLA = join(dirname(fileURLToPath(import.meta.url)), "..", "diario");

function attivo(): boolean {
  return process.env.DIARIO !== "0";
}

/** Il nome del file cambia ogni giorno: così non cresce all'infinito. */
function file(): string {
  return join(CARTELLA, `${new Date().toISOString().slice(0, 10)}.jsonl`);
}

/**
 * Annota una generazione.
 *
 * Non lancia mai e non fa aspettare nessuno: un problema nello scrivere il
 * diario non deve mai togliere un piano all'utente.
 */
export function annota(tipo: string, dati: unknown): void {
  if (!attivo()) return;

  const riga = JSON.stringify({ quando: new Date().toISOString(), tipo, ...(dati as object) });

  void (async () => {
    try {
      await mkdir(CARTELLA, { recursive: true });
      await appendFile(file(), riga + "\n", "utf8");
    } catch (err) {
      console.warn("[diario] non scritto:", err);
    }
  })();
}
