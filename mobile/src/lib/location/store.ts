/** Persisted last-known location coordinates (independent of UserProfile
 *  to avoid schema migration). Written on GPS detect or city pick; read
 *  by Results to drive nearby-store discovery. */

import type { ResolvedLocation } from "./geolocate";

const KEY = "mm.location.v1";

export function saveResolvedLocation(loc: ResolvedLocation): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(loc));
  } catch {
    /* quota */
  }
}

export function loadResolvedLocation(): ResolvedLocation | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ResolvedLocation;
  } catch {
    return null;
  }
}

export function clearResolvedLocation(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
