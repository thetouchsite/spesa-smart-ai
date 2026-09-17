import { catalogoSalvato } from "../src/api/catalogo-magazzino.js";
import { fontiDi } from "../src/api/catalogo-fonti.js";
import { paScheda } from "../src/api/catalogo.js";

let tot = 0, buttate = 0;
const esempi: string[] = [];
for (const f of fontiDi("IT")) {
  const salvate = await catalogoSalvato("IT", f.insegna);
  if (!salvate) continue;
  let n = 0;
  for (const s of salvate) {
    tot++;
    if (!paScheda(s.url)) {
      n++; buttate++;
      if (esempi.length < 14) esempi.push(`    ${f.insegna.slice(0, 16).padEnd(18)}${s.url.slice(0, 96)}`);
    }
  }
  if (n > 0) console.log(`  ${f.insegna.slice(0, 20).padEnd(22)}butta ${String(n).padStart(6)} su ${salvate.length}`);
}
console.log(`\n  IT: ${buttate} righe buttate su ${tot}`);
console.log("\n  esempi di cosa butto:");
for (const e of esempi) console.log(e);
