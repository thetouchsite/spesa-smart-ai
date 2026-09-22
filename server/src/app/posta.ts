/**
 * Mandare un'email. Una sola cosa, fatta in modo che si possa cambiare idea.
 *
 * PERCHE' DAL SERVER E NON DALL'APP
 * ---------------------------------
 * Perche' non si puo' fare altrimenti. SMTP e' una conversazione TCP diretta
 * sulla porta 465: un browser sa parlare solo HTTP, e React Native lo stesso.
 * Le librerie che promettono di mandare posta da un'app in realta' chiamano un
 * servizio HTTP che la manda per loro.
 *
 * E anche se il protocollo lo permettesse, dentro l'app dovrebbero starci
 * utente e password della casella — che si estraggono dal pacchetto installato
 * con una riga di comando. Stesso motivo per cui la chiave `sk_live_` non puo'
 * stare li'.
 *
 * TRE STRADE, SCELTE DA SOLE
 * --------------------------
 * 1. Se ci sono le variabili SMTP, si manda via SMTP.
 * 2. Altrimenti, se c'e' una chiave Resend, si manda con la loro API.
 * 3. Se non c'e' niente, si scrive nel registro del server e si dice
 *    chiaramente che all'utente non arrivera' nulla.
 *
 * Il terzo caso non e' un ripiego pigro: e' quello che ha permesso di
 * costruire e provare tutto il recupero password prima ancora di avere una
 * casella. Ma deve URLARE, non tacere — un utente bloccato che aspetta
 * un'email che non arrivera' mai e' il peggior guasto possibile, perche' non
 * assomiglia a un guasto.
 *
 * PERCHE' DUE FORNITORI E NON UNO
 * -------------------------------
 * In un mese abbiamo visto cadere tre servizi di foto — Unsplash Source
 * dismesso, LoremFlickr che risponde 500, Foodish sospeso. Dare per scontato
 * che un fornitore resti al suo posto non e' realismo. Cambiare strada qui
 * costa una variabile, non una riscrittura.
 */

import nodemailer, { type Transporter } from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const RESEND_KEY = process.env.RESEND_API_KEY;

/**
 * Da chi arriva l'email.
 *
 * Deve essere una casella che esiste davvero sul dominio da cui si manda:
 * scrivere un mittente inventato e' il modo piu' rapido di finire nello spam,
 * perche' i controlli SPF e DKIM confrontano proprio quello col dominio che
 * ha aperto la connessione.
 */
const MITTENTE = process.env.SMTP_FROM ?? process.env.EMAIL_FROM ?? SMTP_USER ?? "";

export type ComeSpedito = "smtp" | "resend" | "solo-registro";

/**
 * Quale strada useremmo adesso. Serve a dirlo nelle risposte e nel pannello.
 *
 * SMTP VINCE, E CHI MIGRA A RESEND DEVE SAPERLO.
 * L'ordine qui sotto non e' una preferenza: e' una trappola per chi fa la
 * migrazione. Aggiungere `RESEND_API_KEY` su Render NON basta — finche'
 * `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS` restano li', la posta continua a
 * passare da SMTP e la chiave nuova non viene mai guardata. Al 22 settembre
 * 2026 `/health` in produzione dice ancora `postaVia: "smtp"`.
 *
 * Per passare a Resend servono tre cose, in quest'ordine:
 *
 *   1. `RESEND_API_KEY` fra le variabili su Render
 *   2. il dominio `touchsite.it` verificato nel cruscotto di Resend, con i
 *      record SPF e DKIM che chiedono loro — senza, le email partono e
 *      finiscono nello spam, che e' peggio di non mandarle
 *   3. TOGLIERE `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`
 *
 * Il terzo e' quello che si dimentica, e senza il terzo i primi due non fanno
 * niente. L'ordine conta anche al contrario: togliere prima l'SMTP e
 * aggiungere dopo la chiave lascia la posta ferma nel mezzo.
 */
export function comeSiSpedisce(): ComeSpedito {
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) return "smtp";
  if (RESEND_KEY) return "resend";
  return "solo-registro";
}

export function postaConfigurata(): boolean {
  return comeSiSpedisce() !== "solo-registro";
}

/* Una connessione sola, riusata. Aprire e chiudere SMTP a ogni email e' lento
   — sono tre giri di rete piu' la stretta di mano TLS — e certi server lo
   considerano un comportamento da spammer. */
let trasporto: Transporter | null = null;

function apriTrasporto(): Transporter {
  if (trasporto) return trasporto;
  trasporto = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    /* La 465 e' TLS dall'inizio; la 587 comincia in chiaro e passa a TLS con
       STARTTLS. Sbagliare questo interruttore e' l'errore piu' comune, e si
       manifesta come un blocco di dieci secondi seguito da un timeout. */
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    /* Se il server non risponde, meglio fallire in fretta: chi ha premuto
       «ho dimenticato la password» sta guardando una rotella. */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return trasporto;
}

export interface Messaggio {
  a: string;
  oggetto: string;
  testo: string;
  /** Facoltativo: se manca, i lettori mostrano il testo semplice. */
  html?: string;
}

/**
 * Manda, e dice come e' andata senza far esplodere niente.
 *
 * NON solleva eccezioni: chi la chiama sta quasi sempre facendo altro — una
 * registrazione, un recupero — e un guasto della posta non deve trascinarsi
 * dietro l'operazione principale. Chi vuole sapere com'e' finita guarda il
 * valore restituito.
 */
async function perSmtp(m: Messaggio): Promise<void> {
  await apriTrasporto().sendMail({
    from: MITTENTE,
    to: m.a,
    subject: m.oggetto,
    text: m.testo,
    html: m.html,
  });
}

async function perResend(m: Messaggio): Promise<void> {
  const risposta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: MITTENTE,
      to: [m.a],
      subject: m.oggetto,
      text: m.testo,
      html: m.html,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!risposta.ok) {
    /* Il corpo dell'errore di Resend dice cose utili — dominio non
       verificato, mittente non autorizzato — e senza si resta con un numero. */
    const dettaglio = await risposta.text().catch(() => "");
    throw new Error(`Resend ha risposto ${risposta.status} ${dettaglio.slice(0, 200)}`);
  }
}

export async function spedisci(m: Messaggio): Promise<{ spedita: boolean; come: ComeSpedito }> {
  const come = comeSiSpedisce();

  if (come === "solo-registro") {
    console.warn(
      `[posta] NESSUN SERVIZIO CONFIGURATO — l'email a ${m.a} non e' partita.\n` +
        `        Oggetto: ${m.oggetto}\n` +
        `        ${m.testo.replace(/\n/g, "\n        ")}\n` +
        `        Servono SMTP_HOST/SMTP_USER/SMTP_PASS oppure RESEND_API_KEY.
` +
        `        ATTENZIONE: qui sopra c'e' il contenuto in chiaro, codici compresi:
` +
        `        accettabile in sviluppo, mai in produzione.`,
    );
    return { spedita: false, come };
  }

  try {
    if (come === "smtp") {
      try {
        await perSmtp(m);
      } catch (guasto) {
        /* SMTP CADUTO: SE C'E' RESEND, SI PASSA DI LA'.
           Non e' zelo: e' il guasto che ci e' costato una mattinata. Su Render
           — e su quasi tutti i servizi gestiti — le porte SMTP in uscita sono
           chiuse, per non farsi usare dagli spammer. Le credenziali erano
           giuste, il server di posta rispondeva benissimo da casa, e dal
           servizio in produzione ogni invio moriva con «Connection timeout»
           dopo dieci secondi. Nessuno riceveva il codice di recupero, e da
           fuori era indistinguibile da una password sbagliata.

           `comeSiSpedisce` preferisce SMTP quando c'e', ed e' giusto: e'
           gratis e non passa da terzi. Ma preferire non vuol dire ostinarsi.
           Se la strada preferita e' chiusa e ce n'e' un'altra configurata, si
           prende quella invece di lasciare l'utente senza email. */
        if (!RESEND_KEY) throw guasto;
        console.warn(
          `[posta] SMTP non raggiungibile (${guasto instanceof Error ? guasto.message : guasto}); ` +
            "ripiego su Resend. Se succede sempre, togli le variabili SMTP_* da questo ambiente.",
        );
        await perResend(m);
        console.info(`[posta] inviata a ${m.a} via resend (ripiego)`);
        return { spedita: true, come: "resend" };
      }
    } else {
      await perResend(m);
    }
    /* L'INDIRIZZO SI', L'OGGETTO NO. Sembra innocuo e non lo e': l'oggetto
       dell'email di recupero CONTIENE il codice — ci sta apposta, perche' si
       legga dalla schermata di blocco senza aprire niente. Scriverlo nel
       registro vuol dire che chiunque possa leggere i log di Render puo'
       reimpostare la password di chiunque. Basta sapere che e' partita. */
    console.info(`[posta] inviata a ${m.a} via ${come}`);
    return { spedita: true, come };
  } catch (err) {
    /* L'indirizzo SI', il contenuto NO. Un codice di recupero nel registro del
       server e' un codice che chiunque amministri la macchina puo' usare. */
    console.error(`[posta] invio a ${m.a} fallito (${come}):`, err instanceof Error ? err.message : err);
    return { spedita: false, come };
  }
}

/**
 * L'email del codice di recupero.
 *
 * Sta qui e non dentro `utente.ts` perche' e' testo per una persona, non
 * logica: chi vuole cambiare le parole non deve passare in mezzo alle regole
 * degli account.
 *
 * Il codice e' anche nell'OGGETTO, di proposito: sulla schermata di blocco del
 * telefono si legge l'oggetto senza aprire niente, e nove volte su dieci
 * l'utente ha l'app aperta nell'altra mano.
 */
export function emailCodiceRecupero(codice: string, minuti: number): Omit<Messaggio, "a"> {
  const testo =
    `Il tuo codice per reimpostare la password e' ${codice}\n\n` +
    `Scade fra ${minuti} minuti. Scrivilo nell'app, nella schermata «Password dimenticata».\n\n` +
    `Se non hai chiesto tu di cambiare la password, puoi ignorare questo messaggio: ` +
    `senza il codice non succede niente, e la tua password resta quella di prima.`;

  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;color:#1D2A37;line-height:1.6">` +
    `<p>Il tuo codice per reimpostare la password è:</p>` +
    `<p style="font-size:34px;font-weight:700;letter-spacing:6px;color:#00723B;margin:24px 0">${codice}</p>` +
    `<p>Scade fra ${minuti} minuti. Scrivilo nell'app, nella schermata «Password dimenticata».</p>` +
    `<p style="color:#5B646F;font-size:14px;margin-top:28px">` +
    `Se non hai chiesto tu di cambiare la password puoi ignorare questo messaggio: ` +
    `senza il codice non succede niente, e la tua password resta quella di prima.</p>` +
    `</div>`;

  return { oggetto: `${codice} è il tuo codice MealMint`, testo, html };
}
