/**
 * MongoDB — connessione e collezioni.
 *
 * Driver ufficiale, niente ODM: le tre collezioni hanno forme semplici e
 * Mongoose aggiungerebbe uno strato di schemi che qui non serve a nessuno.
 *
 * Collezioni:
 *   users  — account (email + password con hash scrypt)
 *   plans  — piani salvati dall'utente, non più solo nel browser
 *   cache  — risposte AI condivise fra TUTTI gli utenti
 *   prezzi — schede prodotto gia' lette: prezzo, link e quando l'abbiamo visto
 *   cataloghi — gli indirizzi di ogni insegna, compressi: uno per insegna
 *
 * La collezione `cache` è quella che tiene in piedi i conti: senza, ogni
 * utente ripaga le stesse chiamate a Gemini (~0,15 € a piano). Con la cache
 * condivisa i piatti distinti sono poche centinaia in tutto il catalogo e a
 * regime il costo scende a ~0,02 € a piano.
 */

import { MongoClient, type Binary, type Collection, type Db } from "mongodb";
import type { VerifyStatus } from "../api/price-page.js";

export interface UserDoc {
  _id?: unknown;
  email: string;
  passwordHash: string;
  displayName?: string;
  createdAt: Date;
}

export interface PlanDoc {
  _id?: unknown;
  userId: string;
  label: string;
  profile: Record<string, unknown>;
  plan: Record<string, unknown>;
  estimatedSpend: number;
  savings: number;
  score: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Una scheda prodotto gia' letta: prezzo, stato e quando l'abbiamo vista.
 *
 * L'indirizzo e' la chiave, perche' e' l'unica cosa che identifica davvero la
 * scheda — il nome lo scrive il negozio e puo' cambiare.
 *
 * Perche' esiste: senza, ogni richiesta riapre le stesse pagine. Con cento
 * persone che generano un piano a Madrid erano seimila richieste ai negozi
 * spagnoli invece di sessanta. Vedi `prezzi-magazzino.ts`.
 */
export interface PrezzoDoc {
  _id: string; // l'indirizzo della scheda
  /** Null quando la pagina si apre ma il prezzo non e' nell'HTML. */
  prezzo: number | null;
  valuta: string;
  nome: string;
  insegna: string;
  verifica: VerifyStatus;
  /** Quando l'abbiamo letta: decide se vale ancora. */
  visto: Date;
  /** TTL: Mongo la cancella da sola a questa data. */
  scadeIl: Date;
}

/**
 * Il catalogo di un'insegna, compresso in un documento solo.
 *
 * Tre milioni di prodotti come tre milioni di documenti sarebbero 867 MB con
 * gli indici, e il piano gratuito ne da' 512. Gli stessi dati compressi, uno
 * per insegna, sono 55 MB. Vedi `catalogo-magazzino.ts`.
 */
export interface ChiaveDoc {
  _id: string;
  nome: string;
  specie: "segreta" | "pubblicabile";
  tettoGiornaliero: number;
  attiva: boolean;
  creata: Date;
}

export interface CatalogoDoc {
  _id: string; // "PAESE|Insegna"
  paese: string;
  insegna: string;
  prodotti: number;
  /** Indirizzo e nome per riga, separati da tabulazione, poi gzip. */
  dati: Binary;
  aggiornato: Date;
}

export interface CacheDoc {
  _id: string; // chiave deterministica: endpoint + hash degli argomenti
  value: unknown;
  createdAt: Date;
  /** TTL: MongoDB cancella il documento da solo a questa data. */
  expiresAt: Date;
}

let client: MongoClient | null = null;
let db: Db | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env.MONGODB_URI);
}

/**
 * Si connette al primo uso e riusa la connessione.
 *
 * Su Railway il servizio può ripartire a freddo: la connessione va creata
 * pigramente, non al caricamento del modulo, altrimenti un Mongo non ancora
 * pronto fa fallire l'avvio dell'intero processo.
 */
export async function getDb(): Promise<Db> {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI non configurata");

  client = new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8_000,
  });
  await client.connect();
  db = client.db(process.env.MONGODB_DB ?? "spesa_smart");

  // Indici creati una volta sola all'avvio. `unique` sull'email è ciò che
  // impedisce due account con la stessa mail in caso di doppia richiesta.
  await Promise.all([
    db.collection<UserDoc>("users").createIndex({ email: 1 }, { unique: true }),
    db.collection<PlanDoc>("plans").createIndex({ userId: 1, createdAt: -1 }),
    // expireAfterSeconds: 0 => Mongo usa il valore del campo come scadenza.
    db.collection<CacheDoc>("cache").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection<CacheDoc>("cache_api").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection<CacheDoc>("cache_app").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection<PrezzoDoc>("prezzi").createIndex({ scadeIl: 1 }, { expireAfterSeconds: 0 }),
    // Si cercano sempre per indirizzo E per freschezza insieme: un indice solo
    // su `visto` farebbe scorrere tutte le righe recenti per trovarne dodici.
    db.collection<PrezzoDoc>("prezzi").createIndex({ visto: -1 }),
    // Nessun indice sul contenuto: qui dentro non si cerca, si legge il
    // pacchetto della propria insegna e lo si scompatta.
    db.collection<CatalogoDoc>("cataloghi").createIndex({ paese: 1 }),
  ]);

  console.info("[db] connesso a MongoDB");
  return db;
}

export async function users(): Promise<Collection<UserDoc>> {
  return (await getDb()).collection<UserDoc>("users");
}

export async function plans(): Promise<Collection<PlanDoc>> {
  return (await getDb()).collection<PlanDoc>("plans");
}

/**
 * LA CACHE E' DUE, NON UNA.
 *
 * Era una collezione sola, e dentro ci finivano tutte e due le meta' del
 * sistema: le risposte sui prezzi — che sono l'API, il prodotto — insieme ai
 * menu, alle ricette e alle liste, che sono l'app del cliente.
 *
 * Finche' vivono in casa insieme non e' un problema pratico: il problema e'
 * che il giorno in cui l'API se ne va per conto suo, quella collezione va
 * divisa a mano, con dentro qualche milione di documenti. Adesso costa cinque
 * righe; fra sei mesi e' una migrazione.
 *
 * E c'e' una ragione piu' immediata: le due meta' hanno vite diverse. Una
 * risposta sui prezzi scade in ventiquattro ore perche' i prezzi cambiano; un
 * menu potrebbe durare settimane. Nella stessa collezione si finisce per dare
 * a tutti la soglia piu' corta — che e' esattamente cio' che succedeva.
 *
 * Chi va dove lo dice il prefisso della chiave, che c'era gia':
 *
 *     prices                                   → api
 *     menu, lista, plan-full, menu-da-prodotti → app
 *     amazon, shopping                         → app (strade alternative)
 */
function dovePosare(chiave: string): "cache_api" | "cache_app" {
  return chiave.startsWith("prices:") ? "cache_api" : "cache_app";
}

export async function cache(chiave?: string): Promise<Collection<CacheDoc>> {
  const db = await getDb();
  // Senza chiave — succede solo negli script di servizio — si risponde con
  // quella dell'app, che e' la piu' grande.
  return db.collection<CacheDoc>(chiave ? dovePosare(chiave) : "cache_app");
}

/**
 * La collezione di prima, che va svuotandosi da sola.
 *
 * Le voci hanno tutte una scadenza e Mongo le toglie: nel giro di qualche
 * giorno resta vuota e si puo' cancellare. Fino ad allora la si legge ancora,
 * se no il giorno del passaggio tutti pagherebbero di nuovo un lavoro gia'
 * fatto — e quel giorno c'era una dimostrazione al cliente in corso.
 */
export async function cacheVecchia(): Promise<Collection<CacheDoc>> {
  return (await getDb()).collection<CacheDoc>("cache");
}

export async function prezzi(): Promise<Collection<PrezzoDoc>> {
  return (await getDb()).collection<PrezzoDoc>("prezzi");
}

export async function cataloghi(): Promise<Collection<CatalogoDoc>> {
  return (await getDb()).collection<CatalogoDoc>("cataloghi");
}

/**
 * Le chiavi dell'API.
 *
 * Dentro c'e' l'IMPRONTA della chiave, non la chiave: se qualcuno legge il
 * database non ci trova niente di riutilizzabile. Il documento sta in
 * `chiavi.ts`, che e' anche l'unico posto che lo scrive.
 */
export async function chiavi(): Promise<Collection<ChiaveDoc>> {
  return (await getDb()).collection<ChiaveDoc>("chiavi");
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
