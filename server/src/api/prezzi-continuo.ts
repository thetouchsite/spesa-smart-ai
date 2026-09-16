/**
 * Il giro che non finisce mai: ogni notte riprende da dove aveva lasciato.
 *
 * PERCHE' NON SI PARTE OGNI VOLTA DA CAPO
 * ---------------------------------------
 * Il magazzino dei prezzi si svuota da solo: una riga vale settantadue ore,
 * poi c'e' ma non si mostra piu'. Un lavoro notturno che ogni volta ricomincia
 * dalla prima voce della lista rifa' sempre gli stessi prodotti e non arriva
 * mai agli altri — e di catalogo ce n'e' 1,8 milioni.
 *
 * Qui si salta tutto quel che e' ancora fresco e si apre solo il resto. La
 * seconda notte tocca le schede che la prima non ha fatto in tempo a fare, la
 * terza quelle ancora dopo, e cosi' via.
 *
 * GIRA TUTTE LE NOTTI, MA OGNI PRODOTTO LO RIVEDE OGNI TRE GIORNI
 * ---------------------------------------------------------------
 * Non serve programmarlo «ogni tre o quattro giorni»: si regola da solo. La
 * soglia di freschezza e' settantadue ore, quindi una scheda letta stanotte
 * viene saltata domani e dopodomani, e riaperta la quarta notte. Il ritmo per
 * prodotto e' quello giusto, e intanto ogni notte e' piena di lavoro utile
 * invece di essere sprecata o saltata.
 *
 * DOVE SI FERMA DA SOLO, E VA SAPUTO PRIMA DI SPERARE
 * ---------------------------------------------------
 * FRESCHEZZA — non e' piu' il collo di bottiglia. A ventiquattro ore lo era:
 * dodici pagine al secondo per un giorno fanno un milione di schede, e tutto
 * il resto restava perennemente scaduto. A settantadue il conto e' 3,6
 * milioni, il doppio di quante ne abbiamo.
 *
 * SPAZIO — questo si'. 443 byte per riga, indici compresi: un milione di
 * prezzi sono 443 MB, e il piano Atlas gratuito ne ha 512 in tutto, di cui 69
 * gia' occupati dai cataloghi. Si supera in due modi, e nessuno dei due e'
 * codice da scrivere qui: accorciare la riga (l'indirizzo completo fa da
 * chiave e pesa piu' di tutto il resto) oppure pagare un piano piu' grande.
 *
 * SUL RISPETTO DEI NEGOZI
 * -----------------------
 * Un giro continuo non e' un giro veloce. Si tiene lo stesso passo del lavoro
 * mirato — otto pagine insieme, una pausa fra l'una e l'altra — e si smette
 * quando il tempo concesso finisce, non quando il catalogo finisce. Il tempo
 * lo decide chi chiama: di notte tanto, a mano poco.
 */

import { cataloghi } from "../base/db.js";
import { prezzi as collezionePrezzi } from "../base/db.js";
import { verifyProductPage } from "./price-page.js";
import {
  FRESCHEZZA_MS,
  improntaUrl,
  numeroInsegnaPubblico as numeroInsegna,
  salvaPrezzi,
  type PrezzoSalvato,
} from "./prezzi-magazzino.js";
import { tutteLeFonti } from "./catalogo-fonti.js";
import { gunzipSync } from "node:zlib";

/** Quante pagine insieme. Lo stesso numero del lavoro mirato: di notte non si corre. */
const INSIEME = 8;
/** Una pausa fra una pagina e l'altra: siamo ospiti, anche alle tre di notte. */
const PAUSA_MS = 120;
/** Ogni quante righe si salva. Se il giro si ferma a meta', quel che e' fatto resta. */
const BLOCCO = 200;

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Finestra scorrevole: appena una pagina finisce ne parte un'altra. */
async function aBrani<T>(cose: T[], quante: number, lavoro: (c: T) => Promise<void>) {
  let prossima = 0;
  const lavoratore = async () => {
    while (prossima < cose.length) await lavoro(cose[prossima++]);
  };
  await Promise.all(Array.from({ length: Math.min(quante, cose.length) }, lavoratore));
}

/** Gli indirizzi di un'insegna, dal catalogo salvato. */
async function indirizziDi(paese: string, insegna: string): Promise<Array<{ url: string; nome: string }>> {
  const doc = await (await cataloghi()).findOne({ _id: `${paese}|${insegna}` });
  if (!doc?.dati) return [];
  try {
    const testo = gunzipSync(Buffer.from(doc.dati.buffer)).toString("utf8");
    const fuori: Array<{ url: string; nome: string }> = [];
    for (const riga of testo.split("\n")) {
      const t = riga.indexOf("\t");
      if (t > 0) fuori.push({ url: riga.slice(0, t), nome: riga.slice(t + 1) });
    }
    return fuori;
  } catch {
    return [];
  }
}

export interface EsitoGiro {
  aperte: number;
  conPrezzo: number;
  saltate: number;
  secondi: number;
  finito: boolean;
}

/**
 * Apre schede finche' il tempo concesso non finisce, partendo dalle piu' vecchie.
 *
 * `minuti` e' un tetto, non un obiettivo: se il catalogo finisce prima, si
 * ferma prima e lo dice con `finito`.
 */
export async function giroContinuo(
  paesi: string[],
  minuti: number,
  onAvanzamento?: (fatte: number, conPrezzo: number) => void,
): Promise<EsitoGiro> {
  const scadenza = Date.now() + minuti * 60_000;
  const inizio = Date.now();
  let aperte = 0;
  let conPrezzo = 0;
  let saltate = 0;
  let finito = true;

  const insegne = tutteLeFonti().filter((f) => paesi.includes(f.paese) && f.resa > 0);

  /* LE PIU' GENEROSE PER PRIME.
     Se il tempo finisce a meta', e' meglio che sia finito su un'insegna che il
     prezzo lo da' nove volte su dieci che su una che lo da' una volta su tre. */
  insegne.sort((a, b) => b.resa - a.resa);

  const raccolte: PrezzoSalvato[] = [];

  for (const f of insegne) {
    if (Date.now() >= scadenza) {
      finito = false;
      break;
    }

    const tutti = await indirizziDi(f.paese, f.insegna);
    if (tutti.length === 0) continue;

    /* QUEL CHE E' GIA' FRESCO NON SI RIAPRE.
       E' il punto di tutto: la seconda notte si aprono solo le schede che la
       prima non ha fatto in tempo a fare, piu' quelle nel frattempo scadute. */
    const soglia = new Date(Date.now() - FRESCHEZZA_MS);
    /* Si chiede per NUMERO dell'insegna e si confrontano IMPRONTE: nella forma
       stretta la riga non porta piu' ne' il nome ne' l'indirizzo. */
    const gia = new Set(
      (
        await (await collezionePrezzi())
          .find({ c: numeroInsegna(f.insegna), t: { $gte: soglia } }, { projection: { _id: 1 } })
          .toArray()
      ).map((r) => r._id),
    );

    const daFare = tutti.filter((x) => !gia.has(improntaUrl(x.url)));
    saltate += tutti.length - daFare.length;
    if (daFare.length === 0) continue;

    await aBrani(daFare, INSIEME, async (c) => {
      if (Date.now() >= scadenza) return;
      const v = await verifyProductPage(c.url);
      aperte++;
      raccolte.push({
        url: c.url,
        prezzo: v.page?.current ?? null,
        valuta: v.page?.currency ?? "",
        nome: c.nome.charAt(0).toUpperCase() + c.nome.slice(1),
        insegna: f.insegna,
        verifica: v.status,
        visto: new Date(),
      });
      if (v.page?.current != null) conPrezzo++;
      if (raccolte.length >= BLOCCO) await salvaPrezzi(raccolte.splice(0, raccolte.length));
      if (aperte % 50 === 0) onAvanzamento?.(aperte, conPrezzo);
      await attendi(PAUSA_MS);
    });

    if (Date.now() >= scadenza) finito = false;
  }

  if (raccolte.length > 0) await salvaPrezzi(raccolte);

  return { aperte, conPrezzo, saltate, secondi: (Date.now() - inizio) / 1000, finito };
}
