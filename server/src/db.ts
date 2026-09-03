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
 *
 * La collezione `cache` è quella che tiene in piedi i conti: senza, ogni
 * utente ripaga le stesse chiamate a Gemini (~0,15 € a piano). Con la cache
 * condivisa i piatti distinti sono poche centinaia in tutto il catalogo e a
 * regime il costo scende a ~0,02 € a piano.
 */

import { MongoClient, type Collection, type Db } from "mongodb";

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

export async function cache(): Promise<Collection<CacheDoc>> {
  return (await getDb()).collection<CacheDoc>("cache");
}

export async function closeDb(): Promise<void> {
  await client?.close();
  client = null;
  db = null;
}
