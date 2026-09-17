/**
 * La foto di un piatto, chiesta al nostro backend.
 *
 * PERCHE' PASSA DAL SERVER
 * ------------------------
 * La foto arriva da Wikimedia Commons, e Commons pretende un `User-Agent` che
 * dica chi sta chiamando — cosa che un browser non puo' impostare — e non manda
 * le intestazioni CORS che servirebbero alla versione web. Quindi la ricerca la
 * fa il server, che in piu' tiene una cache condivisa: la stessa lasagna si
 * cerca una volta per tutti gli utenti invece di una volta per utente.
 *
 * DUE MEMORIE, NON UNA
 * --------------------
 * Il server ricorda per un mese, su Mongo. Qui si ricorda finche' l'app resta
 * aperta, in memoria: senza, tornando dal menu' alla ricetta e viceversa si
 * rifarebbe la stessa richiesta dieci volte in un minuto. Sono due cache con
 * due scopi — una risparmia a Commons, l'altra risparmia all'utente l'attesa.
 *
 * E SI RICORDANO ANCHE I BUCHI
 * ----------------------------
 * Un piatto senza foto viene segnato come «cercato, niente»: altrimenti ogni
 * ridisegno della schermata riproverebbe, e i piatti senza foto sono proprio
 * quelli per cui la ricerca costa di piu' — tre tentativi, tutti a vuoto.
 */

import { useEffect, useState } from "react";
import { post } from "@/api/client";

export interface FotoPiatto {
  url: string;
  /** Autore e licenza. Le licenze di Commons chiedono di citarli: si mostrano. */
  credito: string;
  pagina?: string;
}

/** `null` vuol dire «cercata e non trovata», `undefined` «non ancora cercata». */
const ricordate = new Map<string, FotoPiatto | null>();
/** Richieste in volo, per non chiederne due uguali insieme. */
const inVolo = new Map<string, Promise<FotoPiatto | null>>();

function chiave(nome: string): string {
  return nome.trim().toLowerCase();
}

export async function fotoDelPiatto(nome: string): Promise<FotoPiatto | null> {
  const k = chiave(nome);
  if (!k || k.length < 3) return null;
  if (ricordate.has(k)) return ricordate.get(k) ?? null;

  const gia = inVolo.get(k);
  if (gia) return gia;

  const richiesta = (async () => {
    try {
      const esito = await post<{ foto: FotoPiatto | null }>("/piatto/foto", { nome: nome.trim() });
      ricordate.set(k, esito.foto);
      return esito.foto;
    } catch {
      /* Rete assente o server spento: si segna niente e si disegna il
         segnaposto. NON si ricorda il buco, perche' la prossima volta la rete
         potrebbe esserci — a differenza di un piatto che una foto non ce l'ha
         proprio. */
      return null;
    } finally {
      inVolo.delete(k);
    }
  })();

  inVolo.set(k, richiesta);
  return richiesta;
}

/**
 * Quel che si sa gia', senza chiedere niente a nessuno.
 *
 * Serve alle miniature del menu': si ridisegnano a ogni scorrimento, e una
 * funzione che lancia una richiesta a ogni disegno sarebbe un martello. Qui si
 * legge e basta; a riempire la memoria ci pensa `fotoDiPiuPiatti`, una volta.
 */
export function fotoNota(nome: string): FotoPiatto | null {
  return ricordate.get(chiave(nome)) ?? null;
}

/** Le foto di tutto il menu' in una richiesta sola, invece di ventuno. */
export async function fotoDiPiuPiatti(nomi: string[]): Promise<void> {
  const daCercare = [...new Set(nomi.map(chiave))]
    .filter((k) => k.length >= 3 && !ricordate.has(k))
    .slice(0, 30);
  if (daCercare.length === 0) return;

  try {
    const esito = await post<{ foto: Record<string, FotoPiatto | null> }>("/piatto/foto-molte", {
      nomi: daCercare,
    });
    for (const [nome, foto] of Object.entries(esito.foto ?? {})) {
      ricordate.set(chiave(nome), foto);
    }
    /* Quelli che il server non ha nominato nella risposta non esistono per
       lui: si segnano comunque, o resterebbero «non ancora cercati» per
       sempre e ogni ridisegno li richiederebbe. */
    for (const k of daCercare) if (!ricordate.has(k)) ricordate.set(k, null);
  } catch {
    /* Niente da segnare: si riproverà. */
  }
}

/**
 * Le foto di piu' piatti, per una schermata che ne mostra tanti.
 *
 * PERCHE' UN GANCIO E NON UNA CHIAMATA
 * ------------------------------------
 * `fotoDiPiuPiatti` riempie la memoria ma non dice niente a nessuno: chi
 * disegna con `fotoNota` non si accorge che nel frattempo le foto sono
 * arrivate, e resta coi segnaposto finche' qualcos'altro non lo fa
 * ridisegnare. Il menu' se l'era risolta per conto suo con un contatore, e la
 * home no — per questo in home i piatti di oggi erano tre forchette grigie
 * finche' non si passava dal menu' e si tornava indietro.
 *
 * Il rimedio non e' ricopiare il contatore nella seconda schermata: e' che
 * chiedere le foto e farsi ridisegnare siano la stessa cosa, una volta sola.
 *
 * NON TORNA LE FOTO
 * -----------------
 * Le legge chi disegna, con `fotoNota`, una per volta. Tornare un dizionario
 * vorrebbe dire ricostruirlo a ogni giro per poi leggerne tre valori.
 */
export function useFotoDiPiuPiatti(nomi: (string | undefined)[]): void {
  const [, ridisegna] = useState(0);
  /* La dipendenza vera sono i NOMI, non l'array: chi chiama lo ricostruisce a
     ogni disegno — `giorno.pasti.map(...)` — e con quello come dipendenza
     l'effetto ripartirebbe per sempre. La stringa cambia solo quando cambiano
     davvero i piatti. */
  const elenco = nomi.filter((n): n is string => !!n);
  const impronta = elenco.map(chiave).sort().join("|");

  useEffect(() => {
    if (!impronta) return;
    let vivo = true;
    void fotoDiPiuPiatti(impronta.split("|")).then(() => {
      if (vivo) ridisegna((n) => n + 1);
    });
    return () => {
      vivo = false;
    };
  }, [impronta]);
}

/**
 * La foto di un piatto, per una schermata.
 *
 * Torna subito quella gia' nota — cosi' tornando su una ricetta vista la foto
 * c'e' senza lampeggiare — e cerca le altre in sottofondo.
 */
export function useFotoPiatto(nome: string | undefined): FotoPiatto | null {
  const k = nome ? chiave(nome) : "";
  const [foto, setFoto] = useState<FotoPiatto | null>(() =>
    k ? (ricordate.get(k) ?? null) : null,
  );

  useEffect(() => {
    if (!nome || !k) return;
    let vivo = true;
    void fotoDelPiatto(nome).then((f) => {
      if (vivo) setFoto(f);
    });
    return () => {
      vivo = false;
    };
  }, [nome, k]);

  return foto;
}
