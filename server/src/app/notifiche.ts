/**
 * Le notifiche push: a chi mandarle, e come.
 *
 * COSA STA QUI E COSA STA SUL TELEFONO
 * ------------------------------------
 * «Stasera si mangia orata» non passa di qui e non deve: il telefono ha il
 * piano, sa che giorno e', e se lo dice da solo anche in aereo. Farlo decidere
 * al server vorrebbe dire tenere il piano di ognuno, il fuso di ognuno, e
 * svegliare un processo ogni sera per dire una cosa gia' nota al destinatario.
 *
 * Qui sta l'altra meta': cio' che il telefono NON puo' sapere. Che il petto di
 * pollo della sua lista, stanotte, e' sceso a 4,90 da Lidl. Quello lo sa solo
 * chi legge i prezzi, e chi legge i prezzi e' questo server.
 *
 * NON SERVONO LE CREDENZIALI DI APPLE E GOOGLE, QUI
 * -------------------------------------------------
 * Si parla col servizio di Expo, che fa da tramite verso APNs e FCM. Le
 * credenziali servono, ma alla BUILD dell'app, non a questo codice: un token
 * `ExponentPushToken[...]` e' gia' la prova che quel telefono e' iscritto.
 * Questo file ha bisogno solo di fare una POST.
 *
 * I TOKEN MORTI SI PULISCONO DA SOLI
 * ----------------------------------
 * Un'app disinstallata lascia un token che sembra vivo: si manda, il servizio
 * accetta, non arriva niente. Expo lo dice nella ricevuta — `DeviceNotRegistered`
 * — e questa e' l'unica occasione che abbiamo di saperlo. Chi ignora le
 * ricevute si ritrova, dopo un anno, a mandare meta' delle notifiche a
 * telefoni che non esistono piu'.
 *
 * UN UTENTE HA PIU' TELEFONI
 * --------------------------
 * Quindi la chiave e' il token, non l'utente: lo stesso account puo' avere il
 * telefono e il tablet, e devono squillare tutti e due. E lo stesso telefono
 * puo' cambiare padrone — ci si scollega e si entra con un altro account —
 * quindi registrando un token lo si riassegna, senza lasciarne in giro due.
 */

import type { Collection } from "mongodb";
import { getDb } from "../base/db.js";
import { HttpError } from "../base/http.js";

export interface PushDoc {
  _id?: unknown;
  /** `ExponentPushToken[...]`. E' la chiave: identifica un telefono. */
  push: string;
  userId: string;
  piattaforma: string;
  /** Per non mandare un'offerta alle quattro del mattino a chi sta altrove. */
  fuso?: string;
  createdAt: Date;
  /** Ultima volta che il telefono si e' fatto vivo. */
  vistoIl: Date;
}

export async function pushTokens(): Promise<Collection<PushDoc>> {
  const c = (await getDb()).collection<PushDoc>("pushTokens");
  /* Unico sul token: registrarlo due volte riassegna, non duplica. Un telefono
     che cambia padrone non deve restare iscritto al padrone di prima. */
  await c.createIndex({ push: 1 }, { unique: true }).catch(() => {});
  await c.createIndex({ userId: 1 }).catch(() => {});
  return c;
}

/** Il formato di Expo. Rifiutare il resto tiene fuori i token di prova. */
const FORMA_TOKEN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export async function registraPush(
  userId: string,
  dati: { push: string; piattaforma?: string; fuso?: string },
): Promise<{ ok: true }> {
  if (!FORMA_TOKEN.test(dati.push)) {
    throw new HttpError(400, "Token push non valido");
  }
  const ora = new Date();
  await (
    await pushTokens()
  ).updateOne(
    { push: dati.push },
    {
      $set: {
        userId,
        piattaforma: dati.piattaforma ?? "sconosciuta",
        fuso: dati.fuso,
        vistoIl: ora,
      },
      $setOnInsert: { push: dati.push, createdAt: ora },
    },
    { upsert: true },
  );
  return { ok: true };
}

export async function dimenticaPush(userId: string, push: string): Promise<{ ok: true }> {
  /* Il filtro include userId: senza, chiunque conoscesse un token potrebbe
     disiscrivere il telefono di un altro. */
  await (await pushTokens()).deleteOne({ push, userId });
  return { ok: true };
}

export interface Messaggio {
  titolo: string;
  corpo: string;
  /** Finisce in `data` sul telefono: `{ rotta: "/lista" }` e simili. */
  dati?: Record<string, string>;
}

interface Ricevuta {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

/**
 * Manda un messaggio a tutti i telefoni di un utente.
 *
 * Torna quanti ne ha raggiunti. Non lancia se un telefono e' morto: quello e'
 * un fatto normale, non un guasto della chiamata.
 */
export async function mandaAUtente(userId: string, messaggio: Messaggio): Promise<number> {
  const registrati = await (await pushTokens()).find({ userId }).toArray();
  if (registrati.length === 0) return 0;
  return mandaATokens(
    registrati.map((r) => r.push),
    messaggio,
  );
}

/**
 * Manda a un elenco di token, a blocchi di cento.
 *
 * Cento e' il limite del servizio. Chi manda mille token in una richiesta
 * riceve un errore che parla di «request too large» e non dice quale meta'
 * sia passata — cioe' il tipo di guasto che si scopre fra sei mesi.
 */
export async function mandaATokens(tokens: string[], messaggio: Messaggio): Promise<number> {
  let raggiunti = 0;
  for (let i = 0; i < tokens.length; i += 100) {
    const blocco = tokens.slice(i, i + 100);
    const corpo = blocco.map((to) => ({
      to,
      title: messaggio.titolo,
      body: messaggio.corpo,
      data: messaggio.dati ?? {},
      sound: "default",
      /* «normal» e non «high»: un prezzo sceso non vale svegliare un telefono
         in risparmio energetico. Le priorita' alte esistono per i messaggi e
         le chiamate, e usarle per il marketing e' il modo piu' rapido di
         finire silenziati dal sistema. */
      priority: "normal",
    }));

    try {
      const risposta = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(20_000),
      });
      const esito = (await risposta.json()) as { data?: Ricevuta[] };
      const ricevute = esito.data ?? [];

      const morti: string[] = [];
      ricevute.forEach((r, k) => {
        if (r.status === "ok") {
          raggiunti++;
          return;
        }
        if (r.details?.error === "DeviceNotRegistered") morti.push(blocco[k]);
        else console.warn("[push] rifiutata:", r.message ?? r.details?.error);
      });

      /* L'unica occasione che abbiamo di sapere che un telefono non c'e' piu'.
         Vedi la nota in cima: chi ignora le ricevute finisce per mandare meta'
         delle notifiche nel vuoto. */
      if (morti.length > 0) {
        await (await pushTokens()).deleteMany({ push: { $in: morti } });
        console.info(`[push] tolti ${morti.length} token non piu' registrati`);
      }
    } catch (err) {
      console.warn("[push] invio non riuscito:", err);
    }
  }
  return raggiunti;
}
