/**
 * L'area utente: chi sei, cambiare la password, dimenticarla, andartene.
 *
 * COSA STA QUI E COSA NO
 * ----------------------
 * `auth.ts` sa di crittografia e di token e non ha idea di cosa sia un utente.
 * Qui c'e' il contrario: nessuna crittografia scritta a mano, solo le regole di
 * cosa si puo' fare a un account e quando.
 *
 * E STA IN `app/`, NON IN `api/`
 * ------------------------------
 * L'avevo messo di la' e il build l'ha fermato, giustamente: `api/` non puo'
 * importare da `app/`, perche' l'API un giorno dev'essere staccabile con un
 * `git mv`. Ma questo file non e' dell'API — l'API vende prezzi e non sa cosa
 * sia un utente registrato. Account, password e piani sono dell'app, e il
 * confine ha fatto esattamente il suo mestiere: costringere a rispondere
 * «questo di chi e'?» il giorno in cui il file nasce.
 *
 * IL RECUPERO PASSWORD VUOLE UN CANALE CHE L'UTENTE POSSIEDE
 * ----------------------------------------------------------
 * Ed e' la sua casella di posta: e' li' che sta la prova che l'account e' suo.
 * L'invio lo fa `posta.ts`, che sceglie da solo fra SMTP e Resend a seconda di
 * come e' configurato il server.
 *
 * Se non e' configurato niente, il codice si genera e si salva lo stesso ma
 * all'utente non arriva, e il registro lo dice a voce alta. E' cosi' che
 * questo recupero e' stato costruito e provato prima ancora che una casella
 * esistesse — ma resta uno stato da sviluppo, non da produzione.
 *
 * NON SI DICE MAI SE UN'EMAIL ESISTE
 * ----------------------------------
 * `dimenticata` risponde sempre la stessa cosa, che l'indirizzo sia registrato
 * o no. Altrimenti diventa uno strumento per scoprire chi e' iscritto: si
 * prova un elenco di indirizzi e si guarda quali rispondono diversamente.
 */

import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { ObjectId } from "mongodb";
import { HttpError } from "../base/http.js";
import { hashPassword, issueToken, requireUser, verifyPassword } from "./auth.js";
import { plans, users, type UserDoc } from "../base/db.js";
import { emailCodiceRecupero, spedisci } from "./posta.js";

/** Quanto vive un codice di recupero. Lungo abbastanza per cercarlo, corto abbastanza da non restare in giro. */
const RECUPERO_VALIDO_MS = 20 * 60 * 1000;

/** Tentativi sbagliati prima che il codice muoia. Tre: un codice di sei cifre si indovina in un milione di prove. */
const TENTATIVI_MASSIMI = 3;

/** In sviluppo il codice torna nella risposta. In produzione mai. */
const CODICE_IN_CHIARO = process.env.RECUPERO_CODICE_IN_CHIARO === "1";

function improntaCodice(codice: string): string {
  return createHash("sha256").update(codice).digest("hex");
}

function stessoCodice(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  /* Confronto a tempo costante: con `===` il tempo di risposta cambia a
     seconda di quanti caratteri iniziali coincidono, e da li' si ricostruisce
     il codice una cifra alla volta. */
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * L'utente dietro la richiesta, con la sua riga di database.
 *
 * Fa il controllo che `requireUser` da solo non puo' fare: che la GENERAZIONE
 * del token sia ancora quella buona. Un token emesso prima di un cambio
 * password porta un numero vecchio e qui viene rifiutato — che e' tutto il
 * punto di avere quel numero.
 */
export async function utenteDaRichiesta(req: unknown): Promise<{
  id: string;
  doc: UserDoc;
}> {
  const { id, versione } = requireUser(req as { headers: Record<string, unknown> });
  const doc = await (await users()).findOne({ _id: new ObjectId(id) });
  if (!doc) throw new HttpError(401, "Utente non trovato");
  if ((doc.versioneToken ?? 1) !== versione) {
    throw new HttpError(401, "Sessione non piu' valida: la password e' stata cambiata");
  }
  return { id, doc };
}

/** Come si presenta un utente all'app. Mai l'impronta della password, mai i codici. */
export function utentePubblico(doc: UserDoc) {
  return {
    email: doc.email,
    displayName: doc.displayName ?? null,
    createdAt: doc.createdAt,
  };
}

/**
 * Avvia il recupero: genera un codice, lo salva in impronta, lo consegna.
 *
 * Risponde sempre allo stesso modo, anche se l'indirizzo non esiste.
 */
export async function avviaRecupero(email: string): Promise<{ codiceSoloPerProve?: string }> {
  const col = await users();
  const doc = await col.findOne({ email: email.toLowerCase().trim() });
  if (!doc) return {};

  /* `randomInt` e non `Math.random`: quest'ultimo e' prevedibile, e un codice
     di recupero prevedibile e' una porta aperta su ogni account. */
  const codice = String(randomInt(100_000, 1_000_000));

  await col.updateOne(
    { _id: doc._id as ObjectId },
    {
      $set: {
        recuperoHash: improntaCodice(codice),
        recuperoScadeIl: new Date(Date.now() + RECUPERO_VALIDO_MS),
        recuperoTentativi: 0,
      },
    },
  );

  const { spedita } = await spedisci({
    a: doc.email,
    ...emailCodiceRecupero(codice, RECUPERO_VALIDO_MS / 60000),
  });

  /* Se la posta non e' configurata, `spedisci` ha gia' scritto tutto nel
     registro con un avviso ben visibile. Qui non si ripete: si registra solo
     che l'utente e' rimasto senza, che e' l'informazione operativa. */
  if (!spedita) {
    console.warn(`[utente] ${doc.email} ha chiesto il recupero ma l'email non e' partita.`);
  }

  return CODICE_IN_CHIARO ? { codiceSoloPerProve: codice } : {};
}

/**
 * Chiude il recupero: verifica il codice e mette la password nuova.
 *
 * Alza la generazione dei token, perche' chi arriva qui potrebbe essere
 * proprio il proprietario che si e' fatto rubare il telefono.
 */
export async function concludiRecupero(
  email: string,
  codice: string,
  nuovaPassword: string,
): Promise<{ token: string; email: string }> {
  const col = await users();
  const doc = await col.findOne({ email: email.toLowerCase().trim() });

  /* Stesso messaggio per «email sconosciuta», «nessun codice richiesto» e
     «codice sbagliato»: distinguerli direbbe a un estraneo a che punto e'
     arrivato. */
  const scortese = () => new HttpError(400, "Codice non valido o scaduto");

  if (!doc?.recuperoHash || !doc.recuperoScadeIl) throw scortese();
  if (doc.recuperoScadeIl.getTime() < Date.now()) throw scortese();
  if ((doc.recuperoTentativi ?? 0) >= TENTATIVI_MASSIMI) throw scortese();

  if (!stessoCodice(improntaCodice(codice), doc.recuperoHash)) {
    await col.updateOne({ _id: doc._id as ObjectId }, { $inc: { recuperoTentativi: 1 } });
    throw scortese();
  }

  const versione = (doc.versioneToken ?? 1) + 1;
  await col.updateOne(
    { _id: doc._id as ObjectId },
    {
      $set: { passwordHash: await hashPassword(nuovaPassword), versioneToken: versione },
      $unset: { recuperoHash: "", recuperoScadeIl: "", recuperoTentativi: "" },
    },
  );

  return { token: issueToken(String(doc._id), versione), email: doc.email };
}

/**
 * Cambia la password di chi è già dentro.
 *
 * Chiede quella vecchia anche se l'utente è già autenticato: un telefono
 * sbloccato e lasciato sul tavolo non deve bastare a prendersi l'account.
 */
export async function cambiaPassword(
  req: unknown,
  vecchia: string,
  nuova: string,
): Promise<{ token: string }> {
  const { id, doc } = await utenteDaRichiesta(req);
  if (!(await verifyPassword(vecchia, doc.passwordHash))) {
    throw new HttpError(401, "La password attuale non e' corretta");
  }
  if (await verifyPassword(nuova, doc.passwordHash)) {
    throw new HttpError(400, "La nuova password e' uguale a quella di prima");
  }

  const versione = (doc.versioneToken ?? 1) + 1;
  await (await users()).updateOne(
    { _id: new ObjectId(id) },
    { $set: { passwordHash: await hashPassword(nuova), versioneToken: versione } },
  );

  /* Si restituisce un token nuovo, altrimenti il cambio password scollegherebbe
     anche il telefono da cui e' stato fatto: l'utente si vedrebbe buttare fuori
     dalla schermata in cui ha appena confermato, e penserebbe a un guasto. */
  return { token: issueToken(id, versione) };
}

/**
 * Cancella l'account e tutto quello che c'e' dentro.
 *
 * NON E' UNA CORTESIA: e' obbligatoria. Apple e Google impongono a ogni app con
 * registrazione di offrire la cancellazione dall'app stessa, ed e' uno dei
 * motivi di rifiuto piu' frequenti — e piu' banali da evitare.
 *
 * Chiede la password: un telefono trovato acceso non deve poter cancellare
 * l'account di qualcun altro.
 */
export async function eliminaAccount(req: unknown, password: string): Promise<{ piani: number }> {
  const { id, doc } = await utenteDaRichiesta(req);
  if (!(await verifyPassword(password, doc.passwordHash))) {
    throw new HttpError(401, "La password non e' corretta");
  }

  /* Prima i piani, poi l'utente. Nell'ordine inverso, un errore in mezzo
     lascerebbe piani orfani di un utente che non esiste piu': invisibili a
     tutti e impossibili da cancellare, perche' la cancellazione passa sempre
     dal proprietario. */
  const esito = await (await plans()).deleteMany({ userId: id });
  await (await users()).deleteOne({ _id: new ObjectId(id) });

  console.info(`[utente] account cancellato su richiesta: ${doc.email}, ${esito.deletedCount} piani`);
  return { piani: esito.deletedCount };
}
