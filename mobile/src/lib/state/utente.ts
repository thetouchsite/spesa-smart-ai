/**
 * Chi è entrato, e come farlo restare.
 *
 * PERCHE' NON STA DENTRO `session.ts`
 * -----------------------------------
 * `session.ts` tiene il profilo alimentare e il piano in corso, e li scrive su
 * AsyncStorage — che è un archivio in chiaro: chi ha accesso al telefono può
 * leggerlo. Per un profilo alimentare va benissimo. Per un token d'accesso no:
 * quello va nella cassaforte del sistema, che è un posto diverso con regole
 * diverse. Due cose con due livelli di protezione non stanno nello stesso
 * cassetto.
 *
 * TRE STATI, NON DUE
 * ------------------
 * «Dentro» e «fuori» non bastano: all'avvio c'è un terzo momento in cui non si
 * sa ancora, perché leggere la cassaforte richiede un istante e a volte una
 * conferma dell'impronta. Senza distinguerlo, l'app mostrerebbe la schermata
 * d'accesso per mezzo secondo a ogni apertura, anche a chi è già entrato — un
 * lampeggio che sembra un difetto.
 */

import { create } from "zustand";
import { utenteApi, SessioneScaduta, type Identita } from "../api/cliente";
import {
  chiediConferma,
  dimenticaToken,
  leggiToken,
  salvaToken,
  sbloccoRapidoAcceso,
} from "../biometria";

export type StatoAccesso = "in-attesa" | "dentro" | "fuori";

interface Utente {
  email: string;
  displayName?: string | null;
}

interface StatoUtente {
  stato: StatoAccesso;
  token: string | null;
  utente: Utente | null;

  /** All'avvio: riprende la sessione dalla cassaforte, se c'è e se è ancora buona. */
  riprendi: () => Promise<void>;
  accedi: (email: string, password: string) => Promise<void>;
  registrati: (email: string, password: string, nome?: string) => Promise<void>;
  /** Dopo un cambio o un recupero password il token cambia: va sostituito ovunque. */
  aggiornaToken: (token: string) => Promise<void>;
  esci: () => Promise<void>;
  /** Il token non vale più: si esce senza chiedere niente a nessuno. */
  scaduta: () => Promise<void>;
}

export const useUtente = create<StatoUtente>()((set, get) => ({
  stato: "in-attesa",
  token: null,
  utente: null,

  async riprendi() {
    const token = await leggiToken();
    if (!token) {
      set({ stato: "fuori", token: null, utente: null });
      return;
    }

    /* Se l'utente ha acceso lo sblocco rapido, il token si usa solo dopo che il
       telefono ha detto sì. Se dice no — dito sbagliato, oppure «annulla» — non
       si entra, ma il token NON si cancella: la prossima apertura riprova. */
    if (await sbloccoRapidoAcceso()) {
      const ok = await chiediConferma("Entra in MealMint");
      if (!ok) {
        set({ stato: "fuori", token: null, utente: null });
        return;
      }
    }

    /* Il token c'è, ma potrebbe essere scaduto o invalidato da un cambio
       password fatto altrove. L'unico modo di saperlo è chiederlo al server. */
    try {
      const chi = await utenteApi.chiSono(token);
      set({ stato: "dentro", token, utente: { email: chi.email, displayName: chi.displayName } });
    } catch (e) {
      if (e instanceof SessioneScaduta) {
        await dimenticaToken();
        set({ stato: "fuori", token: null, utente: null });
        return;
      }
      /* Server irraggiungibile: NON si butta fuori l'utente. Il token è
         probabilmente ancora buono, ed è solo la rete che manca — sbatterlo
         alla schermata d'accesso mentre è in metropolitana sarebbe il modo
         peggiore di dirgli che non c'è campo. */
      set({ stato: "dentro", token, utente: get().utente });
    }
  },

  async accedi(email, password) {
    await entra(set, await utenteApi.accedi(email, password));
  },

  async registrati(email, password, nome) {
    await entra(set, await utenteApi.registrati(email, password, nome));
  },

  async aggiornaToken(token) {
    await salvaToken(token);
    set({ token, stato: "dentro" });
  },

  async esci() {
    await dimenticaToken();
    set({ stato: "fuori", token: null, utente: null });
  },

  async scaduta() {
    await dimenticaToken();
    set({ stato: "fuori", token: null, utente: null });
  },
}));

async function entra(set: (s: Partial<StatoUtente>) => void, identita: Identita): Promise<void> {
  await salvaToken(identita.token);
  set({
    stato: "dentro",
    token: identita.token,
    utente: { email: identita.email, displayName: identita.displayName },
  });
}

/**
 * Il token di adesso, per chi deve chiamare il server fuori da un componente.
 *
 * Torna `null` se non c'è: chi chiama deve decidere cosa fare, perché la
 * risposta giusta cambia — il salvataggio di un piano può aspettare l'accesso,
 * una schermata di sola lettura no.
 */
export function tokenCorrente(): string | null {
  return useUtente.getState().token;
}
