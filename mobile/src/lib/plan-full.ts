/**
 * Il motore Gemini con ricerca, visto dal lato app.
 *
 * Chiama `/ai/plan-full` e riceve in una volta il menù, le ricette, la lista
 * della spesa e — questa è la novità — i **prezzi reali con i link**, già
 * confrontati fra più supermercati e già verificati dal server aprendo le
 * pagine una per una.
 *
 * COSA CAMBIA RISPETTO A PRIMA
 * ----------------------------
 * Il prototipo mostrava prezzi stimati da un listino interno, gli stessi per
 * tutti. Qui i prezzi sono quelli veri di oggi nei negozi della città
 * dell'utente, con il link per andare a comprare. Dove il server non è
 * riuscito ad aprire la pagina, il prezzo semplicemente non c'è: meglio una
 * riga senza prezzo che un numero che nessuno può controllare.
 *
 * COMPATIBILITÀ
 * -------------
 * La risposta viene tradotta nella forma `Plan` che le schermate già usano,
 * così nessuna di esse va riscritta. Le informazioni in più — offerte per
 * prodotto, confronto fra insegne, promozioni in corso — viaggiano a parte in
 * `extra`, e le schermate le mostrano se ci sono.
 */

import { post } from "@/api/client";
import { PlanSchema, type Plan } from "@/lib/models/plan-schema";
import type { UserProfile } from "@/lib/models";
import { deviceDefaults } from "@/lib/format";
import type { PricedItem, PricingResult } from "@/lib/price-data/types";

/** Un prezzo trovato in un negozio, già controllato dal server. */
export interface Offer {
  negozio: string;
  /** Miniatura del prodotto, quando la fonte la fornisce. */
  immagine?: string;
  /** Il nome del prodotto come appare sul sito di quel negozio. */
  nome: string;
  prezzo: number;
  valuta: string;
  /** Vuoto se la pagina non si apriva: in quel caso non si mostra il link. */
  link: string;
  /**
   * Quanto ci si può fidare del prezzo.
   *
   *   "verificato"  pagina aperta e prezzo letto lì dentro
   *   "pagina-ok"   pagina aperta, prezzo non leggibile dal codice
   *   "bloccato"    il sito rifiuta le richieste automatiche: la pagina esiste
   *                 e dal telefono si apre, ma il prezzo non è confermato
   */
  verifica: "verificato" | "pagina-ok" | "bloccato" | "non-raggiungibile";
  /** Presenti solo quando il prodotto è in promozione. */
  prezzoListino?: number;
  risparmio?: number;
  scontoPercento?: number;
  offertaFinoAl?: string;
}

/** Le offerte dello stesso prodotto nei vari negozi, dalla più economica. */
export interface ProductOffers {
  prodotto: string;
  offerte: Offer[];
  /** Quanto separa la più economica dalla più cara. */
  differenza: number | null;
}

export interface StoreTotal {
  negozio: string;
  totale: number;
  verificati: number;
  proposti: number;
  utilizzabile: boolean;
}

export interface Recipe {
  giorno: string;
  piatto: string;
  porzioni: number;
  ingredienti: Array<{ nome: string; quantita: string }>;
  passaggi: string[];
  prep_minuti: number;
  cottura_minuti: number;
}

export interface PlanMeta {
  motoreMenu: string;
  motorePrezzi: string;
  /** Quale strada ha prodotto questi prezzi: cambia quanto valgono. */
  fontePrezzi?: "ai" | "serpapi";
  /** Quale dei due flussi ha costruito il piano. */
  flusso?: Flusso;
  secondi: number;
  /** Quanto è durata la sola ricerca prezzi. */
  secondiPrezzi?: number;
  ricerche: number;
  /** Falso quando il modello non ha interrogato il web: prezzi meno affidabili. */
  ricercaEffettuata: boolean;
  costoStimatoUsd: number;
  prezziVerificati: number;
  prezziTotali: number;
  insegneConfrontate: number;
  prodottiConAlternative: number;
  prodottiInOfferta: number;
  generatoIl: string;
}

/** Tutto ciò che il motore restituisce oltre al piano. */
export interface PlanExtra {
  ricette: Recipe[];
  prodotti: ProductOffers[];
  catene: StoreTotal[];
  vincitore: StoreTotal | null;
  risparmioVsPiuCara: number | null;
  totali: {
    spesaAlMiglioPrezzo: number;
    budget: number;
    valuta: string;
    prodottiSenzaPrezzo: number;
    vociInLista: number;
  };
  meta: PlanMeta;
}

/** Risposta di `/ai/menu`: il piano senza prezzi. */
interface MenuResponse {
  menu: Array<{ giorno: string; colazione: string; pranzo: string; cena: string }>;
  ricette?: Recipe[];
  lista: Array<{ nome: string; nomeLocale?: string; quantita: string; reparto: string }>;
  consigli: string[];
  meta: { motoreMenu: string; secondiMenu: number; costoStimatoUsd: number; generatoIl: string };
}

/** Risposta di `/ai/prices`: le offerte per la lista appena ricevuta. */
interface PricesResponse {
  prezzi: Array<Offer & { prodotto: string; alternative: number }>;
  prodotti: ProductOffers[];
  catene: StoreTotal[];
  vincitore: StoreTotal | null;
  risparmioVsPiuCara: number | null;
  totali: Omit<PlanExtra["totali"], "budget">;
  meta: Omit<PlanMeta, "motoreMenu" | "secondi">;
}

/** Le due risposte messe insieme, com'erano quando l'endpoint era uno solo. */
type ServerResponse = Omit<MenuResponse, "meta"> &
  Omit<PricesResponse, "meta" | "totali"> & {
    totali: PlanExtra["totali"];
    meta: PlanMeta;
  };


/* ─────────── Abbinare le voci della lista alle offerte trovate ─────────── */

/** Toglie accenti, punteggiatura e doppi spazi: resta solo la sostanza. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Trova le offerte di una voce della lista.
 *
 * L'abbinamento non può essere un confronto esatto. Al modello viene chiesto
 * di riscrivere il nome del prodotto identico a come gli è stato dato, e per
 * lo più lo fa — ma basta una virgola, un accento o un "1 confezione da"
 * diventato "1 conf. da" perché il prezzo, trovato e verificato, non arrivi
 * mai alla riga a cui appartiene. Il risultato è una lista di trattini con i
 * prezzi giusti a pochi centimetri di distanza in memoria.
 *
 * Tre tentativi, dal più severo al più permissivo: uguaglianza, contenimento,
 * e infine le parole in comune. L'ultimo scatta solo con una sovrapposizione
 * ampia, perché abbinare il prezzo sbagliato a un prodotto è peggio che non
 * abbinarne nessuno.
 */
export function findOffers(
  prodotti: ProductOffers[],
  name: string,
  quantity = "",
): ProductOffers | null {
  if (!prodotti?.length) return null;

  const full = normalize(`${name} ${quantity}`);
  const bare = normalize(name);
  if (!bare) return null;

  const indexed = prodotti.map((p) => ({ p, key: normalize(p.prodotto) }));

  const exact = indexed.find((x) => x.key === full || x.key === bare);
  if (exact) return exact.p;

  const contained = indexed.find(
    (x) => x.key.includes(bare) || bare.includes(x.key) || x.key.includes(full),
  );
  if (contained) return contained.p;

  // Ultima risorsa: le parole significative in comune. Le parole corte —
  // "da", "di", "kg", "1" — non contano, altrimenti "1 kg di mele" e
  // "1 kg di pane" sembrerebbero lo stesso prodotto.
  const words = new Set(bare.split(" ").filter((w) => w.length > 3));
  if (words.size === 0) return null;

  let best: { p: ProductOffers; score: number } | null = null;
  for (const { p, key } of indexed) {
    const other = key.split(" ").filter((w) => w.length > 3);
    if (!other.length) continue;
    const shared = other.filter((w) => words.has(w)).length;
    const score = shared / Math.max(words.size, other.length);
    if (score > (best?.score ?? 0)) best = { p, score };
  }
  // Sotto i due terzi di parole in comune non è un abbinamento, è una
  // somiglianza: meglio nessun prezzo che il prezzo di un altro prodotto.
  return best && best.score >= 0.67 ? best.p : null;
}

/**
 * Quanto margine resta sul budget, e come si chiama.
 *
 * Le stesse soglie del prototipo, così le schermate colorano come prima.
 */
function statusOf(spent: number, budget: number): Plan["status"] {
  if (budget <= 0) return "critical";
  const ratio = spent / budget;
  if (ratio <= 0.8) return "comfortable";
  if (ratio <= 1) return "optimized";
  return "critical";
}

/**
 * Traduce la risposta del server nella forma `Plan` delle schermate.
 *
 * Il prezzo di ogni voce della lista è il **migliore fra i negozi**: è la
 * scelta che l'app suggerisce, e le alternative restano consultabili in
 * `extra.prodotti`.
 *
 * Le voci per cui nessun prezzo è stato verificato prendono 0. Il totale però
 * viene dal server, che conta solo i prezzi veri, e `prodottiSenzaPrezzo` dice
 * quante voci mancano all'appello: così un totale parziale non passa mai per
 * un totale completo.
 */
function toPlan(r: ServerResponse): Plan {
  const groceryList = (r.lista ?? []).map((v) => {
    // L'abbinamento usa il termine di RICERCA, non quello mostrato: i prezzi
    // sono stati cercati con quello, e in Grecia «Pomodori maturi» non
    // corrisponderebbe mai a «Ντομάτες».
    const cercato = v.nomeLocale?.trim() || v.nome;
    return {
      name: v.nome,
      searchName: v.nomeLocale?.trim() || undefined,
      quantity: v.quantita,
      estimatedCost: findOffers(r.prodotti ?? [], cercato, v.quantita)?.offerte?.[0]?.prezzo ?? 0,
      category: v.reparto,
    };
  });

  const spent = r.totali?.spesaAlMiglioPrezzo ?? 0;
  const budget = r.totali?.budget ?? 0;
  const mancanti = r.totali?.prodottiSenzaPrezzo ?? 0;

  // Il testo dell'analisi dichiara sempre quanti prodotti non hanno prezzo:
  // senza quella riga un conto parziale sembrerebbe un affare.
  const analisi = [
    `${spent.toFixed(2)} ${r.totali?.valuta ?? "EUR"} sui ${budget} di budget`,
    r.meta?.insegneConfrontate > 1
      ? `prezzi confrontati fra ${r.meta.insegneConfrontate} supermercati`
      : null,
    mancanti > 0 ? `${mancanti} prodotti senza prezzo verificato` : null,
    r.meta?.prodottiInOfferta ? `${r.meta.prodottiInOfferta} in offerta` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return PlanSchema.parse({
    budgetAnalysis: analisi,
    estimatedCost: spent,
    safetyMargin: Math.max(0, Math.round((budget - spent) * 100) / 100),
    status: statusOf(spent, budget),
    recommendedBudget: null,
    minimumBudget: null,
    mealPlan: (r.menu ?? []).map((m) => ({
      day: m.giorno,
      breakfast: m.colazione,
      lunch: m.pranzo,
      dinner: m.cena,
    })),
    groceryList,
    savingTips: r.consigli ?? [],
  });
}

/**
 * Le voci con cui interrogare i negozi.
 *
 * Si usa `nomeLocale` quando c'è: è il nome del prodotto nella lingua del
 * paese dove si compra, e serve perché la ricerca nei negozi è LETTERALE.
 * Un italiano che vive in Portogallo legge l'app in italiano ma compra su siti
 * portoghesi: cercando «Mele rosse» non trova niente, lì sono «maçãs».
 *
 * Quando le due lingue coincidono il campo è vuoto e vale `nome`, senza
 * bisogno di ripeterlo.
 */
function vociDaCercare(
  lista: Array<{ nome: string; nomeLocale?: string; quantita: string }>,
): string[] {
  return lista.map((v) => `${v.nomeLocale?.trim() || v.nome} ${v.quantita}`.trim()).slice(0, 18);
}

export interface PlanFullResult {
  plan: Plan;
  extra: PlanExtra;
}

/**
 * Il tempo massimo di attesa.
 *
 * Due chiamate al modello, di cui una con una ventina di ricerche web, più
 * l'apertura di trenta pagine prodotto: misurato fra 45 e 85 secondi. Il
 * limite sta largo perché una generazione riuscita in 90 secondi vale più di
 * un errore a 60 — è il momento in cui l'app fa la cosa che nessun'altra fa.
 *
 * Va passato anche al client HTTP, non solo tenuto qui: il client ha un
 * limite suo di 45 secondi e taglia la connessione per primo. È già successo
 * a Zurigo — il server aveva finito in 57 secondi con dieci prezzi verificati,
 * ma l'app aveva chiuso e ripiegato sul motore senza prezzi.
 */
/**
 * I tempi massimi, uno per richiesta.
 *
 * Restano sotto i sessanta secondi che iOS concede a una connessione: oltre
 * quella soglia è il sistema a chiudere, e nessun valore scritto qui serve.
 * Il menù non ha bisogno di internet e torna in una decina di secondi; i
 * prezzi, fra ricerca e verifica delle pagine, ne prendono venti o trenta.
 *
 * Il margine è largo di proposito: un menù lento ma riuscito vale molto più di
 * un fallimento puntuale. Con 45 secondi una generazione da 50 andava persa —
 * e il server, che l'aveva completata, la teneva in cache per nessuno.
 *
 * NEL BROWSER IL MURO NON C'E', E 55 SECONDI NON BASTANO PIU'.
 * -----------------------------------------------------------
 * I sessanta secondi sono una regola di iOS, non della rete: la versione che
 * gira nel browser — quella che facciamo provare a chi ha un iPhone e non puo'
 * installare niente — non li ha. Tenerci sotto anche li' era autolesionismo.
 *
 * E i tempi veri hanno superato la stima scritta qui sopra. Misurato il 15
 * settembre sul server pubblico, lista di 18 voci a Bologna:
 *
 *     /ai/lista    38 s sul server,  50 s dal client
 *     /ai/prices   51 s sul server,  62 s dal client  (22 ricerche, 16 insegne)
 *
 * I prezzi sfondavano il tetto di 55 secondi di sette secondi: la richiesta
 * veniva annullata, `client.ts` la traduceva in "Connessione non riuscita", e
 * il flusso dichiarava onestamente "0 su 18 prodotti con pagina aperta".
 * Tutto il resto funzionava — il server stava finendo il lavoro e rispondeva
 * a nessuno. Il menu', a 50 secondi su 55, era il prossimo a cadere.
 *
 * Quindi: nel browser si aspetta quanto serve, sul telefono si resta sotto il
 * muro di iOS. Il controllo su `document` distingue i due mondi senza tirare
 * dentro `react-native` in una cartella che non lo importa mai.
 *
 * SUL TELEFONO IL PROBLEMA RESTA APERTO: 51 secondi di lavoro vero contro un
 * muro di 60 e' un margine che una lista piu' lunga o una giornata storta si
 * mangiano. La strada non e' alzare un numero che iOS ignora — e' chiedere
 * meno per richiesta (meno voci, meno insegne) o spezzare i prezzi in due.
 */
const NEL_BROWSER = typeof document !== "undefined";

const MENU_TIMEOUT_MS = NEL_BROWSER ? 120_000 : 55_000;
const PRICES_TIMEOUT_MS = NEL_BROWSER ? 180_000 : 55_000;

/**
 * Quale strada usare per i prezzi.
 *
 * Si imposta in `mobile/.env` con EXPO_PUBLIC_PRICE_SOURCE, e serve a poter
 * confrontare le tre sullo stesso profilo:
 *
 *   "catalogo" dal catalogo che ci costruiamo dalle sitemap dei negozi. Gli
 *              indirizzi li pubblica il negozio, quindi NON POSSONO essere
 *              sbagliati, e il prezzo si legge aprendo la scheda. COSTO ZERO:
 *              nessuna chiamata al modello. Misurato su Napoli: 20 secondi,
 *              9 voci su 17 con prezzo, link di Carrefour e Cortilia.
 *              Copre 24 paesi; fuori, ricade da sola su "ai".
 *              Il limite oggi e' l'abbinamento: lo fa un conteggio di parole,
 *              e «Orata fresca» puo' finire su «Ricotta fresca».
 *
 *   "ai"       il motore con ricerca — cerca LO STESSO prodotto della lista
 *              nei supermercati della città e apre ogni pagina per
 *              verificarla. Pertinenza alta, copertura 60-85%, ~0,04 $ a piano
 *
 *   "serpapi"  Google Shopping su tutta la lista, come si aspettava il
 *              prototipo del cliente. Trova quasi sempre qualcosa, ma sono i
 *              venditori del marketplace: prezzi veri di prodotti spesso
 *              sbagliati. E consuma una ricerca per prodotto — con la chiave
 *              gratuita si arriva a una dozzina di piani al mese
 *
 * Vuoto o assente: decide il server, che ha il suo PRICE_SOURCE.
 */
const PRICE_SOURCE = process.env.EXPO_PUBLIC_PRICE_SOURCE;

/**
 * Quale delle due strade seguire per costruire il piano.
 *
 * Si imposta in `mobile/.env` con EXPO_PUBLIC_FLUSSO, e serve a mostrare
 * entrambe al cliente — la domanda è venuta da lui in riunione: «e se il menù
 * lo facessimo con quello che è vendibile online?».
 *
 *   "menu-prima"   (predefinito)  menù → lista → prezzi → ricette
 *   Il modello pensa a cosa si cucina, senza sapere niente di cosa si venda
 *   online. Il menù è quello di una famiglia vera; alcuni prodotti poi non
 *   avranno un prezzo.
 *
 *   "spesa-prima"                 lista → prezzi → menù → ricette
 *   Ogni ingrediente del menù è comprabile, con prezzo e link. In cambio il
 *   menù è vincolato a ciò che i negozi pubblicano online — e i cataloghi
 *   migliori sono quelli dei prodotti a lunga conservazione.
 *
 * La seconda costa una chiamata in più e una decina di secondi, perché il
 * menù si genera solo dopo aver visto i prezzi.
 */
const FLUSSO = process.env.EXPO_PUBLIC_FLUSSO === "spesa-prima" ? "spesa-prima" : "menu-prima";

/**
 * Quanti prodotti servono per costruire una settimana di pasti.
 *
 * DIECI, e non e' un numero tondo scelto a caso: e' quello sotto il quale
 * sette giorni di colazione, pranzo e cena diventano la stessa cosa ripetuta.
 *
 * Serve perche' la regola di questa strada e' severa — passano solo i prodotti
 * la cui pagina esiste davvero — e ogni tanto una generazione va male. Misurato
 * su diciassette generazioni vere:
 *
 *     Napoli, Londra, Lisbona    94-100% dei prodotti sopravvive
 *     Atene                      62-94%
 *     Tokyo                      75-86%
 *
 * quindi quasi sempre si passa. Ma tre generazioni su diciassette sono finite
 * sotto — 8%, 29%, 50% — perche' il modello era andato a pescare negozi che
 * non esistono. In quei casi un menu' si potrebbe comunque scrivere, ma sarebbe
 * una presa in giro: meglio dirlo, e' l'unica risposta che non fa perdere tempo
 * a chi legge.
 */
const MINIMO_PRODOTTI = Number(process.env.EXPO_PUBLIC_MIN_PRODOTTI) || 10;

/**
 * Non ci sono abbastanza prodotti comprabili per costruire un piano.
 *
 * NON e' un guasto, ed e' importante che non venga trattato come tale: la
 * generazione e' andata benissimo, semplicemente in quella citta' i negozi
 * online non pubblicano abbastanza di quella lista. Porta con se' i numeri
 * perche' la schermata possa dirlo con precisione invece di un generico
 * "qualcosa e' andato storto" — che sarebbe falso.
 */
export class ProdottiInsufficientiError extends Error {
  readonly trovati: number;
  readonly cercati: number;
  readonly minimo: number;
  readonly citta: string;
  /** I pochi che ce l'hanno fatta: la schermata li mostra, sono la prova. */
  readonly comprabili: string[];

  constructor(opts: {
    trovati: number;
    cercati: number;
    minimo: number;
    citta: string;
    comprabili: string[];
  }) {
    super(
      `solo ${opts.trovati} prodotti su ${opts.cercati} hanno una pagina che si apre ` +
        `(ne servono ${opts.minimo})`,
    );
    this.name = "ProdottiInsufficientiError";
    this.trovati = opts.trovati;
    this.cercati = opts.cercati;
    this.minimo = opts.minimo;
    this.citta = opts.citta;
    this.comprabili = opts.comprabili;
  }
}

/** Quale strada ha prodotto il piano che si sta guardando. */
export type Flusso = "menu-prima" | "spesa-prima";

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`tempo scaduto dopo ${ms} ms`)), ms),
    ),
  ]);
}

/**
 * Genera il piano completo con prezzi reali, in due richieste.
 *
 * PERCHÉ DUE E NON UNA
 * --------------------
 * Perché iOS chiude ogni richiesta di rete dopo **sessanta secondi**, e nessun
 * timeout scritto nel codice può allungarli. Il piano completo, quando la
 * ricerca prezzi è lenta, ne impiega 63-65: il telefono tagliava la
 * connessione, l'app ripiegava sul motore senza prezzi e l'utente vedeva una
 * lista di trattini — mentre il server, ignaro, finiva il lavoro e rispondeva
 * a nessuno. Da fuori sembrava che il motore funzionasse a intermittenza.
 *
 * Divise, nessuna delle due si avvicina al muro: il menù arriva in una decina
 * di secondi, i prezzi in venti o trenta.
 *
 * Se la ricerca prezzi fallisce, il piano viene consegnato lo stesso: menù,
 * ricette e lista ci sono, e valgono più di un errore.
 *
 * Lancia solo se fallisce il menù: senza quello non c'è niente da mostrare, e
 * `fetchPlan` ricade sul motore locale.
 */
export async function fetchPlanFull(
  profile: UserProfile,
  language: string,
  /**
   * Forza una strada, ignorando l'impostazione.
   *
   * Serve a una cosa sola, ma importante: quando "spesa prima" si ferma perche'
   * i prodotti comprabili sono troppo pochi, l'utente puo' chiedere il piano
   * lo stesso — sapendo che sara' costruito senza quella garanzia. La scelta
   * resta sua e dichiarata, che e' l'opposto del ripiego silenzioso di prima.
   */
  forzaFlusso?: "menu-prima" | "spesa-prima",
): Promise<PlanFullResult> {
  const defaults = deviceDefaults();
  const country = profile.country || defaults.country;
  const currency = profile.currency || defaults.currency;
  const city = profile.city || "";

  /** Il profilo, nella forma che il backend si aspetta. */
  const richiesta = {
    city,
    country,
    household: profile.household || "2",
    budget: Number(profile.budget) || 100,
    currency,
    frequency: (profile.frequency === "monthly" ? "monthly" : "weekly") as "weekly" | "monthly",
    style: profile.style || "equilibrato",
    allergies: profile.allergies ?? [],
    dislikes: profile.dislikes ?? "",
    language,
  };

  const strada = forzaFlusso ?? FLUSSO;
  return strada === "spesa-prima"
    ? spesaPrima(richiesta, currency, city, country, profile)
    : menuPrima(richiesta, currency, city, country, profile);
}

/** I campi comuni alle due strade: il profilo mandato al backend. */
type Richiesta = {
  city: string;
  country: string;
  household: string;
  budget: number;
  currency: string;
  frequency: "weekly" | "monthly";
  style: string;
  allergies: string[];
  dislikes: string;
  language: string;
};

/**
 * STRADA 1 — menù, poi prezzi.
 *
 * Il modello pensa a cosa si cucina senza sapere cosa si venda online. È la
 * strada predefinita perché produce il menù di una famiglia vera: nell'ultima
 * generazione, diciotto voci con carne, pesce, ortofrutta e latticini, zero
 * conserve. Il prezzo poi si trova per il 60-85% dei prodotti.
 */
async function menuPrima(
  richiesta: Richiesta,
  currency: string,
  city: string,
  country: string,
  profile: UserProfile,
): Promise<PlanFullResult> {
  const menu = await withTimeout(
    post<MenuResponse>(
      "/ai/menu",
      {
        ...richiesta,
        // Le ricette NON si generano qui: scriverle tutte e sette raddoppia il
        // tempo del menù — 15-28 secondi senza, 36-42 con — e su iOS, che
        // chiude le connessioni a sessanta, quel raddoppio e' la differenza
        // fra un piano che arriva e uno che fallisce. Le genera la schermata
        // della ricetta quando l'utente apre il piatto.
        withRecipes: false,
      },
      MENU_TIMEOUT_MS,
    ),
    MENU_TIMEOUT_MS,
  );

  if (!menu?.menu?.length || !menu?.lista?.length) {
    throw new Error("il motore ha risposto senza menù o senza lista");
  }

  const items = vociDaCercare(menu.lista);

  let prices: PricesResponse | null = null;
  try {
    prices = await withTimeout(
      post<PricesResponse>(
        "/ai/prices",
        {
          items,
          city,
          country,
          currency,
          ...(PRICE_SOURCE ? { priceSource: PRICE_SOURCE } : {}),
        },
        PRICES_TIMEOUT_MS,
      ),
      PRICES_TIMEOUT_MS,
    );
  } catch (err) {
    // Il piano resta utile senza prezzi: meglio di una schermata di errore.
    console.info("[prezzi] non disponibili:", (err as Error).message);
  }

  const budget = Number(profile.budget) || 0;

  const response: ServerResponse = {
    ...menu,
    prezzi: prices?.prezzi ?? [],
    prodotti: prices?.prodotti ?? [],
    catene: prices?.catene ?? [],
    vincitore: prices?.vincitore ?? null,
    risparmioVsPiuCara: prices?.risparmioVsPiuCara ?? null,
    totali: {
      spesaAlMiglioPrezzo: prices?.totali.spesaAlMiglioPrezzo ?? 0,
      budget,
      valuta: currency,
      prodottiSenzaPrezzo: prices?.totali.prodottiSenzaPrezzo ?? menu.lista.length,
      vociInLista: menu.lista.length,
    },
    meta: {
      motoreMenu: menu.meta.motoreMenu,
      motorePrezzi: prices?.meta.motorePrezzi ?? "nessuno",
      fontePrezzi: prices?.meta.fontePrezzi,
      flusso: "menu-prima",
      secondi: menu.meta.secondiMenu + (prices?.meta.secondiPrezzi ?? 0),
      secondiPrezzi: prices?.meta.secondiPrezzi ?? 0,
      ricerche: prices?.meta.ricerche ?? 0,
      ricercaEffettuata: prices?.meta.ricercaEffettuata ?? false,
      costoStimatoUsd: menu.meta.costoStimatoUsd + (prices?.meta.costoStimatoUsd ?? 0),
      prezziVerificati: prices?.meta.prezziVerificati ?? 0,
      prezziTotali: prices?.meta.prezziTotali ?? 0,
      insegneConfrontate: prices?.meta.insegneConfrontate ?? 0,
      prodottiConAlternative: prices?.meta.prodottiConAlternative ?? 0,
      prodottiInOfferta: prices?.meta.prodottiInOfferta ?? 0,
      generatoIl: menu.meta.generatoIl,
    },
  };

  return {
    plan: toPlan(response),
    extra: {
      ricette: response.ricette ?? [],
      prodotti: response.prodotti,
      catene: response.catene,
      vincitore: response.vincitore,
      risparmioVsPiuCara: response.risparmioVsPiuCara,
      totali: response.totali,
      meta: response.meta,
    },
  };
}


/* ─────────── Dal motore con ricerca alla forma che l'app conosce ─────────── */

/**
 * Traduce i prezzi veri nella forma `PricingResult` del motore interno.
 *
 * Serve perché la schermata dei risultati calcola tutto — spesa prevista,
 * punteggio, quanto resta del budget — a partire da quella struttura. Senza
 * questo raccordo mostrava «Prezzi non disponibili» e 0,00 anche con i prezzi
 * reali già in memoria: è successo a Zurigo, con 58,85 CHF trovati e uno zero
 * a schermo, perché il catalogo interno non ha listini svizzeri.
 *
 * Il catalogo interno **non viene nemmeno interrogato** quando i prezzi veri
 * ci sono: sono migliori sotto ogni aspetto, e per i paesi che il catalogo non
 * copre sono gli unici che esistono.
 *
 * `resolutionTier: "city"` è la corsia di massima fiducia del motore interno,
 * e qui è meritata: questi prezzi vengono dai negozi di quella città, non da
 * una media nazionale.
 */
export function pricingFromOffers(
  extra: PlanExtra,
  groceryList: Array<{ name: string; searchName?: string; quantity: string; category: string }>,
): PricingResult {
  const items: PricedItem[] = groceryList.map((g) => {
    // Si cerca col termine usato per i prezzi, non con quello mostrato.
    const found = findOffers(extra.prodotti, g.searchName || g.name, g.quantity);
    const best = found?.offerte?.[0];

    // Un prezzo che la pagina ha confermato vale più di uno solo dichiarato:
    // la differenza finisce nella confidenza, che l'app usa per decidere
    // quanto esporsi con i numeri.
    const confidence = !best
      ? 0
      : best.verifica === "verificato"
        ? 1
        : best.verifica === "pagina-ok"
          ? 0.85
          : // "bloccato": il link è buono ma il prezzo lo dice solo la fonte.
            0.6;

    return {
      name: g.name,
      quantity: g.quantity,
      category: g.category,
      estimatedCost: best?.prezzo ?? 0,
      matchedPrice: null,
      confidence,
      resolutionTier: best ? "city" : "missing",
      packQuantity: g.quantity,
    } as PricedItem;
  });

  const conPrezzo = items.filter((i) => i.estimatedCost > 0);

  return {
    items,
    totalCost: Math.round(conPrezzo.reduce((s, i) => s + i.estimatedCost, 0) * 100) / 100,
    currency: extra.totali.valuta as PricingResult["currency"],
    coverage: items.length ? conPrezzo.length / items.length : 0,
    averageConfidence: conPrezzo.length
      ? conPrezzo.reduce((s, i) => s + i.confidence, 0) / conPrezzo.length
      : 0,
    missing: items.filter((i) => i.estimatedCost <= 0).map((i) => i.name),
    tierCounts: {
      city: conPrezzo.length,
      country: 0,
      region: 0,
      global: 0,
      missing: items.length - conPrezzo.length,
    },
  };
}


/**
 * STRADA 2 — prezzi, poi menù.
 *
 * È la strada che il cliente ha chiesto in riunione: «e se il menù lo
 * facessimo con quello che è vendibile online?». Tre passi invece di due.
 *
 *   1. si genera la sola LISTA della spesa per quel profilo
 *   2. si cercano i PREZZI, e si verifica quali pagine esistono davvero
 *   3. si costruisce il MENÙ usando SOLO i prodotti che hanno superato la
 *      verifica
 *
 * Il risultato è un piano dove ogni ingrediente è comprabile con prezzo e
 * link — nessuna riga senza sbocco. Il prezzo da pagare è il menù: vincolato a
 * ciò che i negozi pubblicano online, e i cataloghi migliori sono quelli dei
 * prodotti a lunga conservazione.
 *
 * Costa una chiamata in più e una decina di secondi. Serve a mostrare le due
 * strade una accanto all'altra e far decidere il cliente con i risultati
 * davanti invece che a parole.
 */
async function spesaPrima(
  richiesta: Richiesta,
  currency: string,
  city: string,
  country: string,
  profile: UserProfile,
): Promise<PlanFullResult> {
  // 1 — la sola lista, senza menù.
  const lista = await withTimeout(
    post<{ lista: MenuResponse["lista"]; meta: MenuResponse["meta"] }>(
      "/ai/lista",
      richiesta,
      MENU_TIMEOUT_MS,
    ),
    MENU_TIMEOUT_MS,
  );

  if (!lista?.lista?.length) throw new Error("il motore ha risposto senza lista");

  const items = vociDaCercare(lista.lista);

  // 2 — i prezzi, con la verifica delle pagine.
  let prices: PricesResponse | null = null;
  try {
    prices = await withTimeout(
      post<PricesResponse>(
        "/ai/prices",
        { items, city, country, currency, ...(PRICE_SOURCE ? { priceSource: PRICE_SOURCE } : {}) },
        PRICES_TIMEOUT_MS,
      ),
      PRICES_TIMEOUT_MS,
    );
  } catch (err) {
    console.info("[prezzi] non disponibili:", (err as Error).message);
  }

  /**
   * I prodotti su cui costruire il menù: quelli la cui pagina ESISTE.
   *
   * È il punto di tutta questa strada — se passassero anche i prodotti con un
   * link rotto, il menù tornerebbe a contenere cose non comprabili e le due
   * strade diventerebbero la stessa.
   *
   * `bloccato` VA INCLUSO, e per un pezzo non lo era. Significa che il sito ha
   * risposto 403 al nostro server: ha capito che siamo un programma. La pagina
   * c'è, e dal telefono di una persona si apre — è la differenza fra «non
   * esiste» e «non parlo con i robot», e solo la prima è un errore del modello.
   *
   * Escluderlo non era un dettaglio: ad Atene i siti greci rispondono 403 quasi
   * sempre, e su due generazioni vere i link erano 19 su 19 e 20 su 20 tutti
   * VERI, zero inventati. Con il filtro sbagliato ne sopravvivevano 3 e 6, e
   * l'app concludeva che ad Atene non si può fare la spesa. Misurato su
   * diciassette generazioni, la differenza è questa:
   *
   *     Atene    12-33%  →  62-94%
   *     Tokyo    56-64%  →  75-86%
   *
   * L'unica cosa che si perde è la conferma del prezzo, e infatti resta quello
   * che il modello ha letto cercando: la riga lo dichiara non confermato.
   */
  const comprabili = (prices?.prodotti ?? [])
    .filter((p) =>
      p.offerte.some(
        (o) =>
          o.verifica === "verificato" ||
          o.verifica === "pagina-ok" ||
          o.verifica === "bloccato",
      ),
    )
    .map((p) => p.prodotto);

  /* QUANDO NON BASTANO, LO SI DICE.
     Qui prima si ripiegava in silenzio sulla strada "menu' prima", che un menu'
     lo produce sempre — ma costruito su prodotti di cui NON sappiamo se si
     comprano. L'utente vedeva un piano normale e non aveva modo di sapere che
     meta' della sua spesa era senza sbocco.

     E' esattamente cio' che questa strada esiste per evitare, quindi il
     silenzio era il difetto peggiore di tutti: rendeva le due strade
     indistinguibili proprio nei casi in cui differiscono. */
  if (comprabili.length < MINIMO_PRODOTTI) {
    console.info(
      `[flusso] ${comprabili.length}/${items.length} prodotti con pagina aperta: ` +
        `sotto il minimo di ${MINIMO_PRODOTTI}, lo dichiaro invece di inventare`,
    );
    throw new ProdottiInsufficientiError({
      trovati: comprabili.length,
      cercati: items.length,
      minimo: MINIMO_PRODOTTI,
      citta: city || country,
      comprabili,
    });
  }

  // 3 — il menù, costruito su quei prodotti.
  const menu = await withTimeout(
    post<MenuResponse>(
      "/ai/menu-da-prodotti",
      { ...richiesta, disponibili: comprabili },
      MENU_TIMEOUT_MS,
    ),
    MENU_TIMEOUT_MS,
  );

  if (!menu?.menu?.length) throw new Error("il motore ha risposto senza menù");

  const budget = Number(profile.budget) || 0;

  const response: ServerResponse = {
    ...menu,
    prezzi: prices?.prezzi ?? [],
    prodotti: prices?.prodotti ?? [],
    catene: prices?.catene ?? [],
    vincitore: prices?.vincitore ?? null,
    risparmioVsPiuCara: prices?.risparmioVsPiuCara ?? null,
    totali: {
      spesaAlMiglioPrezzo: prices?.totali.spesaAlMiglioPrezzo ?? 0,
      budget,
      valuta: currency,
      prodottiSenzaPrezzo: prices?.totali.prodottiSenzaPrezzo ?? 0,
      vociInLista: menu.lista.length,
    },
    meta: {
      motoreMenu: menu.meta.motoreMenu,
      motorePrezzi: prices?.meta.motorePrezzi ?? "nessuno",
      fontePrezzi: prices?.meta.fontePrezzi,
      flusso: "spesa-prima",
      secondi:
        lista.meta.secondiMenu + (prices?.meta.secondiPrezzi ?? 0) + menu.meta.secondiMenu,
      secondiPrezzi: prices?.meta.secondiPrezzi ?? 0,
      ricerche: prices?.meta.ricerche ?? 0,
      ricercaEffettuata: prices?.meta.ricercaEffettuata ?? false,
      costoStimatoUsd:
        lista.meta.costoStimatoUsd +
        (prices?.meta.costoStimatoUsd ?? 0) +
        menu.meta.costoStimatoUsd,
      prezziVerificati: prices?.meta.prezziVerificati ?? 0,
      prezziTotali: prices?.meta.prezziTotali ?? 0,
      insegneConfrontate: prices?.meta.insegneConfrontate ?? 0,
      prodottiConAlternative: prices?.meta.prodottiConAlternative ?? 0,
      prodottiInOfferta: prices?.meta.prodottiInOfferta ?? 0,
      generatoIl: menu.meta.generatoIl,
    },
  };

  return {
    plan: toPlan(response),
    extra: {
      ricette: response.ricette ?? [],
      prodotti: response.prodotti,
      catene: response.catene,
      vincitore: response.vincitore,
      risparmioVsPiuCara: response.risparmioVsPiuCara,
      totali: response.totali,
      meta: response.meta,
    },
  };
}
