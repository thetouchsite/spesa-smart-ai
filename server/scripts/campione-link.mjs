/**
 * CINQUANTA LINK A CASO, DA APRIRE A MANO.
 *
 * Servono a rispondere a una domanda sola: gli indirizzi che teniamo sono veri?
 *
 * Pescati dall'indice vero (`daUnaFonte`, la stessa funzione che gira in
 * produzione), non da una lista scritta a mano — un campione costruito apposta
 * non dimostrerebbe niente.
 *
 * Accanto a ogni link c'e' cosa risponde il server QUANDO LO PESCHIAMO. Non e'
 * per risparmiare il clic a chi legge: e' per rendere la mia affermazione
 * falsificabile. Se scrivo 200 e aprendolo trovi un 404, il numero era sbagliato
 * e si vede subito.
 */

import { writeFileSync } from "node:fs";
import { FONTI } from "../dist/catalogo-fonti.js";
import { daUnaFonte } from "../dist/catalogo.js";
import { verifyProductPage } from "../dist/price-page.js";

const QUANTI = Number(process.env.QUANTI ?? 50);
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

/* Meta' Italia, meta' resto del mondo: l'Italia e' il mercato, ma un campione
   solo italiano non direbbe niente sugli altri ventitre paesi. */
const it = FONTI.filter((f) => f.paese === "IT");
const resto = FONTI.filter((f) => f.paese !== "IT");

function mischia(a) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

/** Quante voci pescare da ogni insegna per arrivare a QUANTI in tutto. */
function riparti(fonti, totale) {
  const base = Math.floor(totale / fonti.length);
  const resto = totale - base * fonti.length;
  return fonti.map((f, i) => [f, base + (i < resto ? 1 : 0)]);
}

const piano = [
  ...riparti(it, Math.round(QUANTI * 0.5)),
  ...riparti(mischia(resto).slice(0, Math.round(QUANTI * 0.5)), Math.round(QUANTI * 0.5)),
].filter(([, n]) => n > 0);

const scelti = [];
for (const [f, quante] of piano) {
  let voci = [];
  try {
    voci = await daUnaFonte(f);
  } catch { /* un'insegna che non risponde e' gia' una risposta */ }
  if (!voci.length) {
    console.error(`  (${f.paese} ${f.insegna}: nessuna voce)`);
    continue;
  }
  for (const v of mischia(voci).slice(0, quante)) {
    scelti.push({ paese: f.paese, insegna: f.insegna, nome: v.nome, url: v.url });
  }
}

console.error(`pescati ${scelti.length} link, ora li apro...`);

/** Apre l'indirizzo e dice cosa risponde. Otto alla volta, non tutti insieme. */
async function apri(r) {
  let stato = 0;
  let finale = r.url;
  try {
    const res = await fetch(r.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9,en;q=0.8" },
    });
    stato = res.status;
    finale = res.url;
  } catch (e) {
    stato = /timeout|abort/i.test(String(e?.message)) ? -1 : 0;
  }
  let prezzo = null;
  if (stato === 200) {
    try {
      const v = await verifyProductPage(r.url);
      prezzo = v?.page?.current ?? null;
    } catch { /* la pagina c'e' ma il prezzo non si legge: due cose diverse */ }
  }
  // Un redirect verso la home e' un 200 che non significa "prodotto esiste".
  const dirottato = (() => {
    try {
      return new URL(finale).pathname.replace(/\/+$/, "").length <= 3;
    } catch { return false; }
  })();
  return { ...r, stato, prezzo, dirottato };
}

const esiti = [];
for (let i = 0; i < scelti.length; i += 8) {
  esiti.push(...(await Promise.all(scelti.slice(i, i + 8).map(apri))));
  console.error(`  aperti ${esiti.length}/${scelti.length}`);
}

esiti.sort((a, b) => (a.paese === b.paese ? a.insegna.localeCompare(b.insegna) : a.paese.localeCompare(b.paese)));
writeFileSync(process.env.USCITA ?? "campione.json", JSON.stringify(esiti, null, 2));

const ok = esiti.filter((e) => e.stato === 200 && !e.dirottato);
const conPrezzo = ok.filter((e) => e.prezzo != null);
for (const e of esiti) {
  const segno = e.dirottato ? "DIROTTATO" : e.stato === 200 ? "200" : e.stato === -1 ? "TIMEOUT" : String(e.stato || "KO");
  console.log(`${e.paese}\t${e.insegna}\t${segno}\t${e.prezzo ?? ""}\t${e.nome.slice(0, 46)}\t${e.url}`);
}
console.error(`\n${"=".repeat(56)}`);
console.error(`aperti davvero   ${ok.length}/${esiti.length}`);
console.error(`con prezzo letto ${conPrezzo.length}/${esiti.length}`);
