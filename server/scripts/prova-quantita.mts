import { quantitaDa, prezzoNormalizzato } from "../src/quantita.js";

const CASI: Array<[string, string | null]> = [
  ["zucchine scure 500 g", "500 g"],
  ["Warburtons Soft Farmhouse Medium Sliced Bread 400g", "400 g"],
  ["iperal zucchine gr500", "500 g"],
  ["acqua naturale 6 x 1,5 l", "9000 ml"],
  ["carrefour latte intero 1 l", "1000 ml"],
  ["barilla pasta integrale fusilli 500g", "500 g"],
  ["cadis cantina di soave soave doc 750 ml", "750 ml"],
  ["mozzarella gr125", "125 g"],
  ["tena discreet normal 12 pz 7504685", "12 pz"],
  ["uova fresche medie 6", null],
  ["zucchine convenienza 1 kg", "1000 g"],
  ["solesta extra virgin olive oil 000000000000488", null],
  ["pomodorini ciliegino 240g italianavera 6", "240 g"],
  ["latte parzialmente scremato 3 x 1 l", "3000 ml"],
  ["coop antic lav coop casa 20tbs 20g", "20 g"],
  ["aepfel 1029250", null],
  ["passata di pomodoro 065PROD1224", null],
  // 25 kg e' assurdo per la nutella ma non per un sacco di farina, e il
  // lettore non sa che prodotto ha davanti: passa, ed e' giusto cosi'.
  ["nutella 25 kg", "25000 g"],
  // Novecento chili invece non e' un prodotto da spesa in nessun caso.
  ["prodotto strano 900 kg", null],
];

let ok = 0;
console.log("  nome                                              letto        atteso");
console.log("  " + "─".repeat(78));
for (const [nome, atteso] of CASI) {
  const q = quantitaDa(nome);
  const letto = q ? `${q.valore} ${q.unita}` : "—";
  const giusto = letto === (atteso ?? "—");
  if (giusto) ok++;
  console.log(`  ${giusto ? "✓" : "✗"} ${nome.slice(0, 46).padEnd(48)}${letto.padEnd(13)}${atteso ?? "—"}`);
}
console.log("  " + "─".repeat(78));
console.log(`  ${ok}/${CASI.length}\n`);

console.log("  il confronto che oggi l'app sbaglia:");
for (const [nome, prezzo] of [["zucchine scure 500 g", 1.39], ["zucchine convenienza 1 kg", 2.19]] as Array<[string, number]>) {
  const q = quantitaDa(nome);
  const n = prezzoNormalizzato(prezzo, q);
  console.log(`    ${nome.padEnd(30)}${prezzo.toFixed(2)} €   →   ${n ? n.valore.toFixed(2) + " €/" + n.unita : "—"}`);
}
