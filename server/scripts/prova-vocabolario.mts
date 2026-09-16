import { traduciVoce, statoVocabolario, quanteImparate } from "../src/vocabolario.js";

const LISTE: Array<[string, "en" | "es" | "fr" | "de" | "pt", string[]]> = [
  ["Regno Unito", "en", ["Pasta integrale", "Riso basmati", "Pomodori pelati", "Latte scremato", "Petto di pollo", "Funghi champignon", "Olio extravergine di oliva", "Uova 6 pezzi"]],
  ["Spagna", "es", ["Latte", "Pane integrale", "Tonno in scatola", "Zucchine", "Formaggio grattugiato"]],
  ["Francia", "fr", ["Burro", "Fragole", "Salmone affumicato", "Ceci in scatola", "Acqua naturale 1.5 l"]],
  ["Germania", "de", ["Yogurt", "Mele", "Patate", "Birra", "Prosciutto cotto"]],
  ["Portogallo", "pt", ["Riso", "Merluzzo", "Cipolle", "Caffe", "Miele"]],
];

const s = statoVocabolario();
console.log(`vocabolario: ${s.concetti} concetti, ${s.parole} forme, ${s.lingue} lingue, ${quanteImparate()} imparate\n`);

for (const [paese, lingua, items] of LISTE) {
  console.log(`── ${paese} (${lingua}) ─────────────────────────────`);
  let ignote = 0;
  for (const voce of items) {
    const r = traduciVoce(voce, lingua);
    ignote += r.sconosciute.length;
    const nota = r.sconosciute.length ? `   ⟵ ignote: ${r.sconosciute.join(", ")}` : "";
    console.log(`  ${voce.padEnd(32)} → ${r.tradotta}${nota}`);
  }
  console.log(`  ${ignote === 0 ? "✓ nessuna chiamata al modello" : `${ignote} parole da chiedere`}\n`);
}

console.log("── plurali e generi italiani ────────────────────");
for (const v of ["Uova fresche", "Pomodori freschi", "Patate fresche", "Zucchine bianche", "Pasta integrale", "Tonno in scatola", "Fragole fresche", "Funghi freschi"]) {
  const r = traduciVoce(v, "en");
  console.log(`  ${v.padEnd(24)} → ${r.tradotta.padEnd(30)}${r.sconosciute.length ? "ignote: " + r.sconosciute.join(",") : "✓ dal dizionario"}`);
}
