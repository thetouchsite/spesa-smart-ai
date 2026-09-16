/**
 * Autenticazione: email + password, token firmati.
 *
 * Zero dipendenze: `node:crypto` fornisce sia scrypt (hash delle password)
 * sia HMAC-SHA256 (firma dei token). Aggiungere bcrypt e una libreria JWT
 * significherebbe due dipendenze in più da aggiornare per sempre, in cambio
 * di nulla che qui serva.
 *
 * scrypt è una funzione deliberatamente lenta e con costo di memoria: se il
 * database venisse esfiltrato, provare le password a tentativi resta caro.
 */

import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { HttpError } from "../base/http.js";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEYLEN = 64;
const TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 giorni: un'app mobile non chiede il login ogni settimana

/* ───────────────────────────── Password ───────────────────────────── */

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const derived = await scrypt(password, Buffer.from(saltHex, "hex"), KEYLEN);
  const expected = Buffer.from(hashHex, "hex");
  // Confronto a tempo costante: un confronto normale rivelerebbe quanti
  // byte iniziali coincidono, e da lì si ricostruisce l'hash.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/* ─────────────────────────────── Token ─────────────────────────────── */

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_SECRET mancante o troppo corta (servono almeno 32 caratteri)");
  }
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

/** Token opaco `payload.firma`, stessa idea di un JWT senza la libreria. */
export function issueToken(userId: string): string {
  const payload = b64url(JSON.stringify({ sub: userId, exp: Date.now() + TOKEN_TTL_MS }));
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): string {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new HttpError(401, "Token non valido");

  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Token non valido");

  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
    sub?: string;
    exp?: number;
  };
  if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) {
    throw new HttpError(401, "Sessione scaduta");
  }
  return parsed.sub;
}

/** Estrae e verifica l'utente dall'header Authorization. */
export function requireUser(req: { headers: Record<string, unknown> }): string {
  const header = req.headers.authorization;
  const value = typeof header === "string" ? header : "";
  if (!value.startsWith("Bearer ")) throw new HttpError(401, "Autenticazione richiesta");
  return verifyToken(value.slice(7).trim());
}
