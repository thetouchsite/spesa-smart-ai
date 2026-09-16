/**
 * Dove si perdono le voci fra la ricerca e lo schermo.
 *
 * La ricerca azzecca il 93%, quel che l'app mostra il 79%. Ventinove voci su
 * duecento si perdono in mezzo, e prima di provare a rimediare bisogna sapere
 * QUALE dei due casi sia:
 *
 *   A) il prodotto giusto c'e' fra le offerte, ma non e' il primo
 *      → e' un problema di ordine, e si sistema ordinando
 *
 *   B) il prodotto giusto non c'e' proprio fra le offerte
 *      → e' un problema piu' a monte: la pagina non si e' aperta, il prezzo
 *        non si e' letto, o il candidato e' stato scartato
 *
 * Sono due mali diversi con due cure diverse, e indovinare quale sia costa
 * piu' che misurarlo.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QUI = dirname(fileURLToPath(import.meta.url));
const PROVE = JSON.parse(readFileSync(join(QUI, "..", "prove", "ricerca.json"), "utf8"));
const API = process.env.API ?? "http://localhost:3100";
const CHIAVE = process.env.CHIAVE;
const CITTA = { IT: "Milano", GB: "London", DE: "München", ES: "Madrid", FR: "Paris" };
const VALUTA = { IT: "EUR", GB: "GBP", DE: "EUR", ES: "EUR", FR: "EUR" };

const piano = (s) => String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function giusto(nome, p) {
  const n = piano(nome);
  if ((p.deve ?? []).some((x) => !n.includes(piano(x)))) return false;
  if ((p.unaDi ?? []).length && !p.unaDi.some((x) => n.includes(piano(x)))) return false;
  if ((p.mai ?? []).some((x) => n.includes(piano(x)))) return false;
  return true;
}

const tot = { primo: 0, piuGiu: 0, assente: 0, senzaOfferte: 0 };
const esempi = [];

for (const [paese, prove] of Object.entries(PROVE)) {
  if (paese.startsWith("_") || !Array.isArray(prove)) continue;
  if (process.env.PAESE && paese !== process.env.PAESE) continue;

  for (let i = 0; i < prove.length; i += 20) {
    const pezzo = prove.slice(i, i + 20);
    const r = await fetch(`${API}/v1/prezzi`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${CHIAVE}` },
      body: JSON.stringify({
        items: pezzo.map((p) => p.voce), city: CITTA[paese] ?? "",
        country: paese, currency: VALUTA[paese] ?? "EUR", priceSource: "catalogo",
      }),
    });
    if (!r.ok) throw new Error(`${r.status}`);
    const d = await r.json();
    const perVoce = new Map((d.voci ?? []).map((v) => [v.voce, v]));

    for (const p of pezzo) {
      const v = perVoce.get(p.voce);
      const off = v?.offerte ?? [];
      if (off.length === 0) { tot.senzaOfferte++; continue; }
      const dove = off.findIndex((o) => giusto(o.nome, p));
      if (dove === 0) tot.primo++;
      else if (dove > 0) {
        tot.piuGiu++;
        if (esempi.length < 10) {
          esempi.push(
            `  ${paese} ${p.voce.slice(0, 22).padEnd(24)}mostrato: ${off[0].nome.slice(0, 26).padEnd(28)}` +
            `giusto in posizione ${dove + 1}: ${off[dove].nome.slice(0, 26)}`,
          );
        }
      } else tot.assente++;
    }
  }
}

const n = tot.primo + tot.piuGiu + tot.assente + tot.senzaOfferte;
const pct = (x) => ((x / n) * 100).toFixed(0) + "%";
console.log("");
console.log(`  su ${n} voci:`);
console.log(`    il giusto e' il PRIMO mostrato        ${String(tot.primo).padStart(4)}  ${pct(tot.primo)}`);
console.log(`    c'e' ma PIU' IN BASSO                 ${String(tot.piuGiu).padStart(4)}  ${pct(tot.piuGiu)}   ← si recupera ordinando`);
console.log(`    non c'e' fra le offerte               ${String(tot.assente).padStart(4)}  ${pct(tot.assente)}   ← problema a monte`);
console.log(`    nessuna offerta                       ${String(tot.senzaOfferte).padStart(4)}  ${pct(tot.senzaOfferte)}`);
if (esempi.length) {
  console.log("\n  dove il giusto c'era ma stava sotto:");
  for (const e of esempi) console.log(e);
}
console.log("");
