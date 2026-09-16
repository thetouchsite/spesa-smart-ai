/**
 * Dizionario contro modello, a parita' di catalogo.
 *
 * Non misura le opinioni: prende le stesse venti voci di spesa, le traduce nei
 * due modi, e conta quanti prodotti veri trova il catalogo con le une e con le
 * altre parole. Quella e' la cosa che conta — se il dizionario trova meno
 * roba, non va bene per quanto sia veloce e gratis.
 */
const API = process.env.API ?? "http://localhost:3100";

const VOCI = [
  "Pasta integrale", "Riso basmati", "Pomodori pelati", "Latte scremato",
  "Petto di pollo", "Funghi champignon", "Olio extravergine di oliva",
  "Uova fresche", "Zucchine", "Tonno in scatola", "Pane integrale",
  "Formaggio grattugiato", "Yogurt greco", "Mele", "Banane", "Patate",
  "Cipolle", "Carote", "Burro", "Acqua naturale",
];

async function cerca(q) {
  const r = await fetch(`${API}/catalogo/cerca`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paese: "GB", q, quanti: 8 }),
  });
  const d = await r.json();
  return d.trovati ?? [];
}

const { traduciVoce } = await import("../src/vocabolario.js");

let vinceDiz = 0, vinceOrig = 0, pari = 0;
let totDiz = 0, totOrig = 0;

console.log("voce                      originale  dizionario   parole del dizionario");
console.log("─".repeat(88));

for (const voce of VOCI) {
  const t = traduciVoce(voce, "en").tradotta;
  const [a, b] = await Promise.all([cerca(voce), cerca(t)]);
  totOrig += a.length;
  totDiz += b.length;
  if (b.length > a.length) vinceDiz++;
  else if (b.length < a.length) vinceOrig++;
  else pari++;
  const segno = b.length > a.length ? "▲" : b.length < a.length ? "▼" : " ";
  console.log(
    `${voce.padEnd(26)}${String(a.length).padStart(6)}${String(b.length).padStart(12)} ${segno}   ${t}`,
  );
}

console.log("─".repeat(88));
console.log(`candidati trovati:  in italiano ${totOrig}   col dizionario ${totDiz}`);
console.log(`voci migliorate ${vinceDiz}, peggiorate ${vinceOrig}, uguali ${pari}`);
