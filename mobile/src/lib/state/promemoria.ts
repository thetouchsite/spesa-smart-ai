/**
 * Le preferenze dei promemoria.
 *
 * SONO NEL LORO NEGOZIO E NON IN QUELLO DELLA SESSIONE
 * ----------------------------------------------------
 * La sessione tiene il profilo e il piano: cose che si cancellano quando
 * l'utente dice «cancella i miei dati». Sapere che vuole il promemoria della
 * cena alle 19 non e' un dato del piano, e' un'impostazione del telefono —
 * sopravvive al piano, e deve sopravvivergli, o chi rigenera un piano si
 * ritroverebbe le notifiche spente senza aver toccato niente.
 */

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { PREFERENZE_INIZIALI, type Preferenze } from "../notifiche";

interface StatoPromemoria extends Preferenze {
  imposta: (patch: Partial<Preferenze>) => void;
}

export const usePromemoria = create<StatoPromemoria>()(
  persist(
    (set) => ({
      ...PREFERENZE_INIZIALI,
      imposta: (patch) => set(patch),
    }),
    {
      name: "spesa.promemoria.v1",
      storage: createJSONStorage(() =>
        typeof window !== "undefined" ? window.localStorage : (undefined as never),
      ),
      partialize: (s) => ({
        cena: s.cena,
        oraCena: s.oraCena,
        spesa: s.spesa,
        giornoSpesa: s.giornoSpesa,
        oraSpesa: s.oraSpesa,
      }),
    },
  ),
);

/** Le sole preferenze, senza le funzioni: quello che vuole `riprogramma`. */
export function preferenzeCorrenti(s: StatoPromemoria): Preferenze {
  return {
    cena: s.cena,
    oraCena: s.oraCena,
    spesa: s.spesa,
    giornoSpesa: s.giornoSpesa,
    oraSpesa: s.oraSpesa,
  };
}
