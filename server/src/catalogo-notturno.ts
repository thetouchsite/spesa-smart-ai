/**
 * L'aggiornamento del catalogo, a mezzanotte.
 *
 * PERCHE' DI NOTTE E PERCHE' UNA VOLTA AL GIORNO
 * ----------------------------------------------
 * Di notte perche' scaricare le sitemap di un paese sono decine di megabyte e
 * qualche decina di secondi: farlo mentre qualcuno aspetta il suo piano
 * significherebbe rallentarlo per niente.
 *
 * Una volta al giorno perche' tanto basta: QUI DENTRO NON CI SONO PREZZI. La
 * sitemap e' un indice di indirizzi, e i cataloghi cambiano lentamente — un
 * prodotto nuovo compare, uno vecchio sparisce. Il PREZZO invece si legge
 * dalla pagina nel momento in cui l'utente genera il piano, quindi e' sempre
 * di oggi, qualunque cosa faccia questo lavoro notturno.
 *
 * QUESTO NON E' UN CRON, ED E' IMPORTANTE SAPERLO
 * -----------------------------------------------
 * E' un timer dentro il processo. Se il processo non gira, non scatta — e sul
 * piano gratuito di Render il servizio si spegne dopo quindici minuti di
 * silenzio, quindi a mezzanotte quasi certamente dorme e l'appuntamento salta.
 *
 * Per questo c'e' anche il recupero all'avvio: appena il servizio si risveglia
 * controlla se il catalogo e' vecchio e, se lo e', lo rifa'. Il risultato e'
 * lo stesso — un catalogo mai piu' vecchio di un giorno — senza dipendere dal
 * fatto che qualcuno resti sveglio a mezzanotte.
 *
 * Su un piano a pagamento, dove il servizio non si spegne, il timer scatta
 * davvero e il recupero non serve quasi mai. Funziona in entrambi i casi senza
 * cambiare niente.
 *
 * QUALI PAESI
 * -----------
 * Non tutti e ventiquattro: scaricarli tutti sono centinaia di megabyte e il
 * piano gratuito ne ha 512 in tutto. Si aggiornano quelli indicati in
 * CATALOGO_PAESI, e gli altri si caricano da soli quando qualcuno li chiede.
 */

import { catalogoDi, statoCatalogo } from "./catalogo.js";
import { paesiConCatalogo } from "./catalogo-fonti.js";

/**
 * I paesi da tenere sempre pronti.
 *
 * Vuoto significa "nessuno in anticipo": ogni paese si carica alla prima
 * richiesta che lo riguarda. E' il comportamento giusto finche' non si sa
 * dove sono gli utenti.
 */
function paesiDaScaldare(): string[] {
  const scelti = (process.env.CATALOGO_PAESI ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  const noti = new Set(paesiConCatalogo());
  const buoni = scelti.filter((p) => noti.has(p));

  const ignorati = scelti.filter((p) => !noti.has(p));
  if (ignorati.length > 0) {
    console.warn(
      `[catalogo] nessuna fonte per ${ignorati.join(", ")}: ignorati. ` +
        `Disponibili: ${[...noti].join(" ")}`,
    );
  }
  return buoni;
}

/** Quanto manca alla prossima mezzanotte, ora del server. */
function finoAMezzanotte(): number {
  const ora = new Date();
  const poi = new Date(ora);
  poi.setHours(24, 0, 0, 0);
  return poi.getTime() - ora.getTime();
}

let inCorso = false;

/**
 * Rifa' il catalogo dei paesi scelti.
 *
 * Uno alla volta di proposito: sono file grossi, e farli insieme su mezzo
 * gigabyte di memoria e' il modo migliore per far morire il servizio nel
 * momento in cui nessuno guarda.
 */
export async function aggiornaCatalogo(motivo: string): Promise<void> {
  if (inCorso) {
    console.info("[catalogo] aggiornamento gia' in corso, salto");
    return;
  }
  const paesi = paesiDaScaldare();
  if (paesi.length === 0) {
    console.info(
      "[catalogo] nessun paese da tenere pronto (CATALOGO_PAESI vuota): " +
        "si caricheranno su richiesta",
    );
    return;
  }

  inCorso = true;
  const inizio = Date.now();
  console.info(`[catalogo] aggiornamento (${motivo}): ${paesi.join(" ")}`);

  try {
    for (const p of paesi) {
      try {
        const c = await catalogoDi(p);
        if (!c) console.warn(`[catalogo] ${p}: nessuna fonte ha risposto`);
      } catch (err) {
        // Un paese che fallisce non deve fermare gli altri.
        console.warn(`[catalogo] ${p} fallito:`, err);
      }
    }
    const s = statoCatalogo();
    const totale = s.caricati.reduce((n, c) => n + c.prodotti, 0);
    console.info(
      `[catalogo] aggiornamento finito in ${((Date.now() - inizio) / 1000).toFixed(0)}s — ` +
        `${totale} prodotti in memoria`,
    );
  } finally {
    inCorso = false;
  }
}

/**
 * Avvia il lavoro notturno.
 *
 * Il primo colpo e' subito dopo l'avvio, non a mezzanotte: serve a riempire il
 * catalogo quando il servizio si risveglia dopo essere stato spento. Ritardato
 * di un minuto perche' l'avvio non diventi lento — chi apre l'app in quel
 * momento non deve aspettare un catalogo che non ha ancora chiesto.
 */
export function avviaCatalogoNotturno(): void {
  if (process.env.CATALOGO_NOTTURNO === "0") {
    console.info("[catalogo] lavoro notturno disattivato (CATALOGO_NOTTURNO=0)");
    return;
  }

  const paesi = paesiDaScaldare();
  if (paesi.length === 0) return;

  setTimeout(() => void aggiornaCatalogo("avvio"), 60_000).unref();

  const primoAppuntamento = finoAMezzanotte();
  console.info(
    `[catalogo] prossimo aggiornamento fra ${(primoAppuntamento / 3_600_000).toFixed(1)}h ` +
      `(mezzanotte), paesi: ${paesi.join(" ")}`,
  );

  setTimeout(() => {
    void aggiornaCatalogo("mezzanotte");
    // Da qui in poi ogni ventiquattro ore.
    setInterval(() => void aggiornaCatalogo("mezzanotte"), 24 * 60 * 60 * 1000).unref();
  }, primoAppuntamento).unref();
}
