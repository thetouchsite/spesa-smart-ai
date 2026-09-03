/** Tiny in-memory + sessionStorage cache for location lookups.
 *  Keeps Nominatim/Overpass calls under the public usage cap and prevents
 *  re-querying when the user toggles radius or revisits the Results page. */

type Entry<T> = { value: T; expiresAt: number };

const mem = new Map<string, Entry<unknown>>();

function readSession<T>(key: string): T | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    if (parsed.expiresAt < Date.now()) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeSession<T>(key: string, entry: Entry<T>): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota exceeded — ignore, mem cache still works */
  }
}

export async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const memHit = mem.get(key) as Entry<T> | undefined;
  if (memHit && memHit.expiresAt > now) return memHit.value;
  const sessHit = readSession<T>(key);
  if (sessHit !== null) {
    mem.set(key, { value: sessHit, expiresAt: now + ttlMs });
    return sessHit;
  }
  const value = await loader();
  const entry = { value, expiresAt: now + ttlMs };
  mem.set(key, entry);
  writeSession(key, entry);
  return value;
}
