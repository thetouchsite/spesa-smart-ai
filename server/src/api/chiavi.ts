/**
 * Le chiavi: chi puo' chiamare l'API, e quanto.
 *
 * PERCHE'
 * -------
 * Finora `/ai/prices`, `/catalogo/cerca` e `/negozi` rispondevano a chiunque
 * conoscesse l'indirizzo. Nessuna chiave, nessun limite per chiamante, e
 * l'unico freno era il tetto di spesa — che pero' e' condiviso: un estraneo
 * che gira in tondo consuma la quota di tutti e ferma il servizio.
 *
 * Per una cosa che vogliamo tenere interna e far pagare, era il buco piu'
 * grosso. Non il piu' difficile: il piu' grosso.
 *
 * DUE SPECIE, E NON E' UN VEZZO
 * -----------------------------
 * Una chiave dentro un'app mobile NON E' SEGRETA. Sta nel pacchetto che si
 * installa, e tirarla fuori da un .apk e' una riga di comando. Se la chiave di
 * MealMint viaggia dentro l'app, chiunque scarichi l'app ha la nostra API
 * gratis — e noi paghiamo Mongo e Google per fargliela funzionare.
 *
 * Non e' una nostra particolarita': e' il motivo per cui Stripe, Google Maps e
 * Algolia hanno tutti due specie di chiave.
 *
 *   sk_  SEGRETA        sta su un server. Puo' tutto, entro il suo tetto.
 *   pk_  PUBBLICABILE   puo' stare in un'app. Legge il catalogo e i negozi,
 *                       ma NON i prezzi — che sono la cosa che costa, e la
 *                       cosa che vendiamo.
 *
 * COSA NE TENIAMO
 * ---------------
 * Non la chiave: la sua impronta. Se domani qualcuno legge il database non ci
 * trova niente di riutilizzabile. La chiave in chiaro si vede una volta sola,
 * quando si crea, e se si perde se ne fa un'altra.
 *
 * IL TETTO SI AZZERA A MEZZANOTTE UTC
 * -----------------------------------
 * Il conteggio sta in memoria, non su Mongo. Vuol dire che un riavvio lo
 * azzera, e su Render il piano gratuito si riavvia spesso. E' un freno, non
 * una contabilita' — esattamente come il tetto di spesa. Quando ci sara' un
 * cliente vero che paga a consumo, il conteggio dovra' vivere su Mongo; sta
 * scritto nel goal, Fase 4.
 */

import { createHash, randomBytes } from "node:crypto";
import { type ChiaveDoc, chiavi as collezioneChiavi, isDbConfigured } from "../base/db.js";

export type { ChiaveDoc };

export type SpecieChiave = "segreta" | "pubblicabile";


/** L'impronta: sha256 esadecimale. */
export function improntaDi(chiave: string): string {
  return createHash("sha256").update(chiave.trim()).digest("hex");
}

/** Una chiave nuova. Il prefisso dice a occhio di che specie e'. */
export function generaChiave(specie: SpecieChiave): string {
  const prefisso = specie === "segreta" ? "sk_live_" : "pk_live_";
  return prefisso + randomBytes(24).toString("base64url");
}

/* ─────────────────────────── il conteggio ─────────────────────────── */

/** `impronta` → quante chiamate oggi. Si azzera cambiando giorno. */
const oggi = new Map<string, number>();
let giornoCorrente = giornoUtc();

function giornoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function contaUna(impronta: string): number {
  const g = giornoUtc();
  if (g !== giornoCorrente) {
    oggi.clear();
    giornoCorrente = g;
  }
  const n = (oggi.get(impronta) ?? 0) + 1;
  oggi.set(impronta, n);
  return n;
}

/** Quante chiamate ha fatto oggi ogni chiave. Per `/v1/stato`. */
export function consumoDiOggi(): Array<{ impronta: string; chiamate: number }> {
  return [...oggi.entries()].map(([impronta, chiamate]) => ({
    // Solo le prime otto cifre: bastano a distinguere, non a ricostruire.
    impronta: impronta.slice(0, 8),
    chiamate,
  }));
}

/* ─────────────────────────── il controllo ─────────────────────────── */

/** Le chiavi gia' cercate, per non interrogare Mongo a ogni richiesta. */
const conosciute = new Map<string, { doc: ChiaveDoc | null; visto: number }>();
const RICORDA_MS = 60_000;

export interface EsitoChiave {
  ok: boolean;
  /** Il codice HTTP da restituire quando `ok` e' falso. */
  stato?: 401 | 403 | 429;
  motivo?: string;
  chiave?: ChiaveDoc;
}

/**
 * Chi sta chiamando, e puo'?
 *
 * `richiedeSegreta` e' vero sulle rotte che costano — i prezzi. Una chiave
 * pubblicabile li' prende un 403, con scritto perche': e' la differenza fra
 * «non hai accesso» e «questa chiave non e' fatta per questo», e sono due cose
 * che si rimediano in modo diverso.
 */
export async function controllaChiave(
  intestazione: string | undefined,
  richiedeSegreta: boolean,
  /**
   * Questa chiamata pesa sul tetto?
   *
   * Lo stato no. Se pesasse, chi ha finito il tetto non potrebbe nemmeno
   * guardare QUANTO ha consumato e quando riparte — cioe' proprio le due cose
   * che gli servono in quel momento. Misurato: `/v1/stato` rispondeva 429 e
   * l'unico modo di sapere perche' era leggere il codice.
   */
  pesaSulTetto = true,
): Promise<EsitoChiave> {
  /* SENZA DATABASE NON SI CHIUDE LA PORTA.
     Se Mongo non e' configurato non c'e' modo di sapere quali chiavi esistono,
     e rispondere 401 a tutti vorrebbe dire che un'API senza database e'
     un'API morta. In sviluppo si lavora cosi', e ci si accorge dal log. */
  if (!isDbConfigured()) {
    return { ok: true };
  }

  const grezza = (intestazione ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!grezza) {
    return {
      ok: false,
      stato: 401,
      motivo:
        "Serve una chiave: `Authorization: Bearer sk_live_...`. " +
        "Le chiavi si creano con `node scripts/chiave.mjs crea`.",
    };
  }

  const impronta = improntaDi(grezza);

  let voce = conosciute.get(impronta);
  if (!voce || Date.now() - voce.visto > RICORDA_MS) {
    try {
      const doc = await (await collezioneChiavi()).findOne({ _id: impronta });
      voce = { doc: doc ?? null, visto: Date.now() };
      conosciute.set(impronta, voce);
    } catch (err) {
      /* Mongo non risponde. Chiudere la porta perche' il database e' lento
         sarebbe peggio del problema che stiamo risolvendo: si passa, e resta
         il tetto di spesa a fare da freno. */
      console.warn("[chiavi] database non raggiungibile, lascio passare:", err);
      return { ok: true };
    }
  }

  const doc = voce.doc;
  if (!doc || !doc.attiva) {
    return { ok: false, stato: 401, motivo: "Chiave non valida o revocata." };
  }

  if (richiedeSegreta && doc.specie === "pubblicabile") {
    return {
      ok: false,
      stato: 403,
      motivo:
        "Questa e' una chiave pubblicabile e i prezzi non li puo' chiedere. " +
        "Le richieste sui prezzi si fanno da un server, con una chiave segreta: " +
        "una chiave dentro un'app si estrae dal pacchetto installato.",
    };
  }

  if (!pesaSulTetto) return { ok: true, chiave: doc };

  const fatte = contaUna(impronta);
  if (doc.tettoGiornaliero > 0 && fatte > doc.tettoGiornaliero) {
    return {
      ok: false,
      stato: 429,
      motivo:
        `Tetto giornaliero raggiunto: ${doc.tettoGiornaliero} chiamate. ` +
        `Riparte a mezzanotte UTC.`,
    };
  }

  return { ok: true, chiave: doc };
}

/** Dimentica quel che sa: serve dopo aver creato o revocato una chiave. */
export function scordaChiavi(): void {
  conosciute.clear();
}
