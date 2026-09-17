import { traduciVoce } from "../src/api/vocabolario.js";
console.log("  === la regola sulle mele ===");
for (const v of ["Mele Cox's Orange Pippin", "salsa di pomodoro", "latte di mandorla",
                 "insalata di pomodori e cetrioli", "pomodori pelati", "petto di pollo",
                 "yogurt greco naturale", "succo d'arancia"]) {
  console.log(`  «${v}»  ->  «${traduciVoce(v, "en").tradotta}»`);
}

console.log("\n  === quante voci del catalogo sono CATEGORIE, non prodotti ===");
const { catalogoDi } = await import("../src/api/catalogo.js");
for (const paese of ["GB", "IT"]) {
  const cat = await catalogoDi(paese);
  if (!cat) continue;
  const perInsegna = new Map<string, { tot: number; cat: number }>();
  for (const v of cat.voci) {
    const r = perInsegna.get(v.insegna) ?? { tot: 0, cat: 0 };
    r.tot++;
    if (/\/(categories|categoria|categorie|category|c\/)\//i.test(v.url)) r.cat++;
    perInsegna.set(v.insegna, r);
  }
  console.log(`  ${paese}:`);
  for (const [ins, r] of [...perInsegna].sort((a, b) => b[1].cat - a[1].cat).slice(0, 6)) {
    if (r.cat === 0) continue;
    console.log(`    ${ins.padEnd(22)}${String(r.cat).padStart(6)} categorie su ${r.tot} voci  (${Math.round(r.cat / r.tot * 100)}%)`);
  }
}
