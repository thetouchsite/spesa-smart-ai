/** Quanti prodotti del catalogo vero danno una quantita' leggibile. */
const { catalogoDi } = await import("../src/catalogo.js");
const { quantitaDa } = await import("../src/quantita.js");
for (const paese of (process.env.PAESI ?? "IT,GB,DE").split(",")) {
  const cat = await catalogoDi(paese);
  if (!cat) { console.log(`  ${paese}: nessun catalogo`); continue; }
  let con = 0; const per = { g: 0, ml: 0, pz: 0 };
  const esempi = [];
  for (const v of cat.voci) {
    const q = quantitaDa(v.nome);
    if (q) { con++; per[q.unita]++; if (esempi.length < 3 && Math.random() < 0.0005) esempi.push(`${v.nome.slice(0,42)} → ${q.valore} ${q.unita}`); }
  }
  const pct = (n) => ((n / cat.voci.length) * 100).toFixed(1) + "%";
  console.log(`  ${paese}  ${cat.voci.length.toLocaleString("it")} prodotti — con quantita': ${con.toLocaleString("it")} (${pct(con)})   peso ${pct(per.g)}  volume ${pct(per.ml)}  pezzi ${pct(per.pz)}`);
  for (const e of esempi) console.log(`        ${e}`);
}
