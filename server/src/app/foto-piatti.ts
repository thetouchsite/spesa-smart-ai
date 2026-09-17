/**
 * Le foto dei piatti, cercate su Wikimedia Commons.
 *
 * PERCHE' SIAMO ARRIVATI QUI
 * --------------------------
 * Tre servizi provati, tre caduti. Unsplash Source e' stato dismesso — ed e'
 * il motivo per cui nella demo del cliente TUTTE le immagini erano rotte.
 * LoremFlickr, messo al suo posto, risponde 500 su sette richieste su otto.
 * Foodish dice «Service Suspended». Sono tutti servizi gratuiti senza
 * garanzie, e cadono senza preavviso: il risultato per chi guarda lo schermo
 * era un riquadro grigio in cima a ogni ricetta.
 *
 * Wikimedia Commons e' un'altra cosa: e' un archivio, non un servizio di
 * comodo. Non chiude, le immagini hanno licenze dichiarate, e ce n'e' una per
 * quasi ogni piatto che abbia un nome.
 *
 * PERCHE' DAL SERVER E NON DALL'APP
 * ---------------------------------
 * Due motivi, tutti e due non aggirabili. Wikimedia pretende un `User-Agent`
 * che dica chi sta chiamando — un browser non puo' impostarlo. E la loro API
 * non manda le intestazioni CORS che servono a una pagina web.
 *
 * Passando di qui ci guadagniamo anche la CACHE: la stessa lasagna la cerchiamo
 * una volta per tutti gli utenti invece di una volta per utente. Sono loro
 * infrastrutture donate, e martellarle sarebbe sia scortese sia il modo piu'
 * rapido di farsi bloccare.
 *
 * L'ATTRIBUZIONE NON E' FACOLTATIVA
 * ---------------------------------
 * Le licenze di Commons — quasi tutte Creative Commons — chiedono di citare
 * l'autore. Per questo la risposta porta sempre `credito` accanto
 * all'indirizzo, e l'app lo mostra sotto la foto. Senza, useremmo materiale di
 * qualcun altro violando la sola condizione che ci ha posto.
 *
 * QUANDO NON TROVA NIENTE
 * -----------------------
 * Risponde `null` e l'app disegna il suo segnaposto. Mai un indirizzo
 * indovinato sperando che risponda: e' esattamente l'errore che ci ha portati
 * ai riquadri rotti.
 */

import { createHash } from "node:crypto";
import { cache, isDbConfigured } from "../base/db.js";

const COMMONS = "https://commons.wikimedia.org/w/api.php";

/* Wikimedia chiede di dichiararsi, con un recapito. Chi non lo fa viene
   bloccato, e il blocco arriva senza preavviso. */
const CHI_SIAMO = "MealMint/1.0 (https://mealmint.app; supporto@mealmint.app)";

/** Un mese. Una foto di lasagne non cambia, e il piatto nemmeno. */
const DURATA_MS = 30 * 24 * 60 * 60 * 1000;

/** Otto secondi: se Commons e' lento, meglio il segnaposto che un'attesa. */
const ATTESA_MS = 8_000;

export interface FotoPiatto {
  url: string;
  /** Autore e licenza, da mostrare sotto la foto. Non e' decorazione. */
  credito: string;
  /** La pagina di Commons, per chi volesse risalire all'originale. */
  pagina?: string;
}

/** Parole che non aiutano a trovare una foto: tolte, la ricerca migliora. */
/** Minuscole, senza accenti, senza punteggiatura: per confrontare parole. */
function semplifica(testo: string): string {
  return testo
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RUMORE = new Set([
  "con", "e", "di", "del", "della", "al", "alla", "in", "the", "and", "with",
  "fresco", "fresca", "fatto", "casa", "stile", "ricetta", "veloce", "leggero",
  "light", "quick", "homemade", "easy",
]);

/**
 * Dal nome del piatto alle ricerche da provare.
 *
 * DUE REGOLE, E TUTTE E DUE COSTANO SANGUE
 * ----------------------------------------
 * 1. MAI UNA PAROLA SOLA. «Torretta di melanzane e zucchine al forno» non
 *    trovava niente come frase intera, ripiegava su «torretta», e Commons
 *    restituiva la foto di Torretta — il paese in provincia di Palermo. In
 *    cima alla ricetta c'era un panorama di case su una collina. Una parola
 *    sola non e' un piatto: e' un sostantivo, e i sostantivi italiani sono
 *    quasi tutti anche nomi di paesi, cognomi o santi.
 *
 * 2. SEMPRE UNA PAROLA DI CIBO ACCANTO. Aggiungere «food» alla ricerca sposta
 *    i risultati dal mondo verso la tavola: e' lo stesso motivo per cui
 *    cercando «torretta food» non esce nessun panorama.
 */
export function terminiDiRicerca(nome: string): string[] {
  const parole = semplifica(nome)
    .split(" ")
    .filter((p) => p.length > 2 && !RUMORE.has(p));

  const fuori: string[] = [];
  /* Il nome intero per primo: «risotto ai funghi» trova il piatto giusto.
     Al contrario si troverebbe una foto di funghi. */
  if (nome.trim()) fuori.push(`${nome.trim()} food`);
  /* Poi le due parole che contano, ancora insieme. Due parole sono gia' una
     descrizione — «melanzane zucchine» e' cibo — mentre una sola non lo e'. */
  if (parole.length >= 2) fuori.push(`${parole.slice(0, 2).join(" ")} food`);
  return [...new Set(fuori)].filter(Boolean);
}

/** Le parole del piatto che un risultato deve contenere per essere credibile. */
export function paroleDelPiatto(nome: string): string[] {
  return semplifica(nome)
    .split(" ")
    .filter((p) => p.length > 3 && !RUMORE.has(p));
}

function chiaveDi(nome: string): string {
  return "foto:" + createHash("sha1").update(nome.toLowerCase().trim()).digest("hex").slice(0, 20);
}

/** Toglie il marcatore HTML che Commons infila nei campi dell'autore. */
function testoPulito(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

interface PaginaCommons {
  title?: string;
  categories?: Array<{ title?: string }>;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
}

/**
 * Parole che, in una categoria di Commons, dicono «questo e' cibo».
 *
 * Volutamente larghe: servono a escludere paesi, monumenti e persone, non a
 * classificare la cucina. Una foto di un piatto sta quasi sempre in almeno una
 * categoria che contiene una di queste.
 */
const CATEGORIE_DI_CIBO =
  /\b(food|foods|dish|dishes|cuisine|cooking|cookery|meal|meals|recipe|recipes|soup|soups|pasta|pizza|bread|cake|cakes|dessert|desserts|salad|salads|rice|meat|fish|cheese|vegetable|vegetables|fruit|breakfast|lunch|dinner|snack|stew|stews|sauce|sauces|drink|beverages|restaurant)\b/i;

function sembraCibo(pagina: PaginaCommons): boolean {
  return (pagina.categories ?? []).some((c) => CATEGORIE_DI_CIBO.test(c.title ?? ""));
}

async function cercaSuCommons(termine: string): Promise<FotoPiatto | null> {
  const url =
    `${COMMONS}?action=query&format=json&origin=*` +
    `&generator=search&gsrsearch=${encodeURIComponent(termine)}` +
    /* Lo spazio dei nomi 6 e' quello dei file: senza, tornano pagine di testo. */
    `&gsrnamespace=6&gsrlimit=10` +
    /* Le CATEGORIE sono la prova che si tratta di cibo. Filtrare le parole
       della domanda non basta: «Torretta di melanzane al forno food»
       restituisce lo stesso TorrettaBeiPalermo.jpg, perche' Commons cerca in
       modo generoso e «Torretta» e' il segnale piu' forte della frase.
       Guardando invece dove sta il file, la differenza e' netta: la foto di un
       piatto sta in «Category:Eggplant dishes», quella del paese in
       «Category:Torretta, Sicily». */
    `&prop=imageinfo|categories&cllimit=30&iiprop=url|extmetadata&iiurlwidth=800`;

  let dati: { query?: { pages?: Record<string, PaginaCommons> } };
  try {
    const risposta = await fetch(url, {
      headers: { "User-Agent": CHI_SIAMO, Accept: "application/json" },
      signal: AbortSignal.timeout(ATTESA_MS),
    });
    if (!risposta.ok) return null;
    dati = (await risposta.json()) as typeof dati;
  } catch {
    return null;
  }

  for (const pagina of Object.values(dati.query?.pages ?? {})) {
    const info = pagina.imageinfo?.[0];
    const indirizzo = info?.thumburl ?? info?.url;
    if (!indirizzo) continue;

    /* Solo fotografie. Commons e' pieno di diagrammi, mappe e stemmi, e un
       disegno tecnico al posto di un piatto e' peggio del segnaposto. */
    if (!/\.(jpe?g|png)$/i.test(indirizzo.split("?")[0])) continue;
    if (/\b(logo|map|mappa|coat[_ ]of[_ ]arms|diagram|icon)\b/i.test(pagina.title ?? "")) continue;

    /* E niente LIBRI SCANSIONATI. Commons rende anche PDF e DjVu come
       immagini, e «pollo arrosto con patate» tornava la prima pagina di un
       ricettario del Novecento: tecnicamente pertinente, praticamente una
       pagina di testo al posto di un piatto. Si riconoscono dal nome del
       file, che comincia per `page1-`, e dal titolo, che finisce in .pdf. */
    /* LA PROVA DECISIVA. Senza, la ricetta di una torretta di melanzane si
       ritrovava in cima il panorama di un paese siciliano — tecnicamente
       un'immagine pertinente alla parola, praticamente un errore che si vede
       da lontano. */
    if (!sembraCibo(pagina)) continue;

    const nomeFile = indirizzo.split("/").pop() ?? "";
    if (/^page\d+-/i.test(nomeFile)) continue;
    if (/\.(pdf|djvu|tiff?|svg)$/i.test(pagina.title ?? "")) continue;

    const meta = info?.extmetadata ?? {};
    /* L'autore a volte e' un indirizzo web nudo invece di un nome, e in un
       credito sotto la foto un link di trenta caratteri non dice niente a
       nessuno. Si tiene il dominio, che almeno indica la provenienza. */
    let autore = testoPulito(meta.Artist?.value ?? "");
    if (/^https?:\/\//i.test(autore)) {
      autore = autore.replace(/^https?:\/\/(www\.)?/i, "").split("/")[0];
    }
    if (!autore) autore = "Wikimedia Commons";
    const licenza = testoPulito(meta.LicenseShortName?.value ?? "") || "licenza libera";

    return {
      url: indirizzo,
      credito: `${autore} · ${licenza} · Wikimedia Commons`,
      pagina: info?.descriptionurl,
    };
  }
  return null;
}

/**
 * La foto di un piatto, cercata una volta e poi ricordata.
 *
 * Ricorda anche i buchi: se per «zuppa della nonna» non c'e' niente, si
 * registra che non c'e' e non lo si richiede per un mese. Senza, ogni piatto
 * senza foto tornerebbe a bussare a Commons a ogni apertura della schermata.
 */
export async function fotoDelPiatto(nome: string, cerca?: string): Promise<FotoPiatto | null> {
  const pulito = nome.trim();
  if (pulito.length < 3) return null;

  /* La chiave tiene dentro anche il termine suggerito: con parole diverse si
     trovano foto diverse, e ricordare la vecchia sotto la stessa chiave
     vorrebbe dire non vedere mai il miglioramento. */
  const chiave = chiaveDi(cerca ? `${pulito}::${cerca}` : pulito);

  if (isDbConfigured()) {
    try {
      const salvato = await (await cache()).findOne({ _id: chiave });
      if (salvato) return (salvato.value as FotoPiatto | null) ?? null;
    } catch {
      /* Cache non disponibile: si cerca lo stesso, si perde solo il risparmio. */
    }
  }

  /* IL TERMINE DEL MODELLO VIENE PRIMA DI TUTTO.
     E' l'unico che sa cos'e' il piatto: «Torretta di melanzane e zucchine al
     forno» diventa «baked eggplant stack», e con quello la foto si trova al
     primo colpo. Indovinarlo dal titolo funziona finche' il titolo e' il nome
     del piatto, e si rompe appena diventa una descrizione — la ricerca
     ripiegava sulla prima parola e restituiva Torretta, il paese in provincia
     di Palermo.

     Resta comunque una rete sotto: il modello il campo lo omette una volta su
     tre, e le ricette che non vengono da lui non ce l'hanno affatto. */
  const suggeriti: string[] = [];
  if (cerca?.trim()) {
    const c = cerca.trim();
    suggeriti.push(c);
    /* E una versione piu' corta: «baked eggplant stack» non trova niente,
       «baked eggplant» si'. Tre parole descrivono bene il piatto ma sono
       troppe per un archivio dove i file si chiamano con due. */
    const parole = c.split(/\s+/);
    if (parole.length > 2) suggeriti.push(parole.slice(0, 2).join(" "));
  }
  const termini = [...suggeriti, ...terminiDiRicerca(pulito)];

  let trovata: FotoPiatto | null = null;
  for (const termine of termini) {
    trovata = await cercaSuCommons(termine);
    if (trovata) break;
  }

  if (isDbConfigured()) {
    try {
      await (await cache()).replaceOne(
        { _id: chiave },
        {
          value: trovata,
          createdAt: new Date(),
          /* I buchi si ricordano per meno tempo: magari fra una settimana
             qualcuno ha caricato la foto di quel piatto. */
          expiresAt: new Date(Date.now() + (trovata ? DURATA_MS : DURATA_MS / 4)),
        },
        { upsert: true },
      );
    } catch {
      /* vedi sopra */
    }
  }

  return trovata;
}

/**
 * Le foto di piu' piatti insieme, per il menu' della settimana.
 *
 * In parallelo ma a piccoli gruppi: ventuno pasti sono ventuno ricerche, e
 * lanciarle tutte insieme su un archivio donato e' il modo di farsi bloccare.
 * A gruppi di quattro il menu' si riempie in un paio di secondi e Commons non
 * se ne accorge.
 */
export async function fotoDiPiuPiatti(
  nomi: string[],
  cerche: Record<string, string> = {},
): Promise<Record<string, FotoPiatto | null>> {
  const fuori: Record<string, FotoPiatto | null> = {};
  const unici = [...new Set(nomi.map((n) => n.trim()).filter((n) => n.length >= 3))].slice(0, 30);

  for (let i = 0; i < unici.length; i += 4) {
    const gruppo = unici.slice(i, i + 4);
    const esiti = await Promise.all(gruppo.map((n) => fotoDelPiatto(n, cerche[n])));
    gruppo.forEach((n, k) => {
      fuori[n] = esiti[k];
    });
  }
  return fuori;
}
