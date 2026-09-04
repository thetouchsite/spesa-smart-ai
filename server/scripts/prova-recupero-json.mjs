/**
 * Il recupero del JSON troncato funziona davvero?
 *
 * Serve perché il caso si è presentato in produzione: il modello esaurisce lo
 * spazio di output e la risposta si interrompe a metà parola. Un piano intero
 * — menù, ricette, lista — già generato e già pagato, perso per una parentesi.
 *
 * Qui si provano le forme in cui il troncamento si presenta davvero: dentro
 * una stringa, dopo una virgola, in mezzo a un oggetto annidato.
 *
 * Uso:  node scripts/prova-recupero-json.mjs
 */

import { readFileSync } from "node:fs";

// Si legge la funzione dal sorgente invece di duplicarla: se cambia lì, questa
// prova segue, e non si finisce a collaudare una copia che non esiste più.
const src = readFileSync(new URL("../src/plan-grounded.ts", import.meta.url), "utf8");
const start = src.indexOf("function repairTruncatedJson");
const end = src.indexOf("\n}", src.indexOf("return body.slice(0, cut)")) + 2;
const fn = src.slice(start, end).replace(/:\s*string\s*\|\s*null/g, "").replace(/:\s*string\[\]/g, "").replace(/:\s*string/g, "").replace(/:\s*boolean/g, "").replace(/:\s*number/g, "");

const repairTruncatedJson = new Function(`${fn}; return repairTruncatedJson;`)();

const CASI = [
  {
    nome: "troncato dentro una stringa",
    input: '{"menu":[{"giorno":"Lunedì"},{"giorno":"Martedì"}],"lista":[{"nome":"pasta"},{"nome":"ri',
    attesa: ["menu", "lista"],
  },
  {
    nome: "troncato dopo una virgola",
    input: '{"menu":[{"giorno":"Lunedì","cena":"Pasta"}],"ricette":[{"piatto":"Pasta","passaggi":["Bolli","Scola"]},',
    attesa: ["menu", "ricette"],
  },
  {
    nome: "troncato in un oggetto annidato",
    input: '{"lista":[{"nome":"Latte","quantita":"1 L"},{"nome":"Uova","quan',
    attesa: ["lista"],
  },
  {
    nome: "troncato subito dopo la chiave",
    input: '{"menu":[{"giorno":"Lunedì","colazione":"Latte e biscotti","pranzo":"Insalata","cena":"Zuppa"}],"consigli":[',
    attesa: ["menu"],
  },
  {
    nome: "stringa con virgolette escapate",
    input: '{"consigli":["Compra il \\"primo prezzo\\"","Evita i pre-tagliati"],"lista":[{"nome":"Ri',
    attesa: ["consigli", "lista"],
  },
  {
    nome: "JSON già valido, non va toccato",
    input: '{"menu":[{"giorno":"Lunedì"}],"lista":[]}',
    attesa: ["menu", "lista"],
  },
];

let ok = 0;
console.log("\nRECUPERO DI UN JSON TRONCATO\n");

for (const c of CASI) {
  let esito;
  try {
    // Un JSON già valido non passa dal recupero: si comporta come nel codice.
    const riparato = (() => {
      try {
        JSON.parse(c.input);
        return c.input;
      } catch {
        return repairTruncatedJson(c.input);
      }
    })();

    const d = JSON.parse(riparato);
    const chiavi = Object.keys(d);
    const mancanti = c.attesa.filter((k) => !chiavi.includes(k));

    if (mancanti.length) {
      esito = `chiavi mancanti: ${mancanti.join(", ")}`;
    } else {
      // Il contenuto recuperato dev'essere utilizzabile, non solo sintattico.
      const voci = Object.entries(d)
        .map(([k, v]) => `${k}:${Array.isArray(v) ? v.length : 1}`)
        .join(" ");
      esito = null;
      console.log(`  OK  ${c.nome.padEnd(38)} ${voci}`);
      ok++;
    }
  } catch (err) {
    esito = String(err.message).slice(0, 60);
  }

  if (esito) console.log(`  KO  ${c.nome.padEnd(38)} ${esito}`);
}

console.log(`\n  ${ok}/${CASI.length} recuperati\n`);
process.exit(ok === CASI.length ? 0 : 1);
