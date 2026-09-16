/**
 * Quante schede portano il peso scritto nel nome, e come lo scrivono.
 *
 * Serve a decidere se la grammatura si puo' trattare come un dato — e quindi
 * usarla per il prezzo al chilo — o se e' troppo sporca e resta testo.
 */
const PAESI = (process.env.PAESI ?? "IT,GB").split(",");

// «500 g», «500g», «1,5 l», «gr500», «6 pezzi», «x4»
const FORME = [
  ["numero + unita' staccati", /(?:^|[\s(,])(\d+(?:[.,]\d+)?)\s+(kg|g|gr|grammi|ml|cl|lt?|litri?|pz|pezzi|pcs|pack)\b/i],
  ["numero + unita' attaccati", /(?:^|[\s(,])(\d+(?:[.,]\d+)?)(kg|g|gr|ml|cl|lt|pz)\b/i],
  ["unita' + numero", /\b(gr|g|kg|ml|cl)\s?(\d+(?:[.,]\d+)?)\b/i],
  ["moltiplicatore", /\b(\d+)\s?[x\u00d7]\s?(\d+(?:[.,]\d+)?)\s?(kg|g|gr|ml|cl|l)\b/i],
];

const { catalogoDi } = await import("../src/catalogo.js");

for (const paese of PAESI) {
  const cat = await catalogoDi(paese);
  if (!cat) { console.log(`${paese}: nessun catalogo`); continue; }

  const conteggi = new Map(FORME.map(([n]) => [n, 0]));
  let conPeso = 0;
  const esempi = [];

  for (const v of cat.voci) {
    let trovata = null;
    for (const [nome, re] of FORME) {
      if (re.test(v.nome)) { trovata = nome; break; }
    }
    if (trovata) {
      conPeso++;
      conteggi.set(trovata, conteggi.get(trovata) + 1);
      if (esempi.length < 6 && Math.random() < 0.002) esempi.push(`${trovata.padEnd(26)} ${v.nome.slice(0, 54)}`);
    }
  }

  const pct = (n) => ((n / cat.voci.length) * 100).toFixed(1).padStart(5) + "%";
  console.log(`\n═══ ${paese} — ${cat.voci.length.toLocaleString("it")} prodotti ═══`);
  console.log(`  col peso nel nome     ${String(conPeso).padStart(7)}  ${pct(conPeso)}`);
  for (const [nome, n] of conteggi) {
    console.log(`    ${nome.padEnd(26)}${String(n).padStart(7)}  ${pct(n)}`);
  }
  console.log("  esempi:");
  for (const e of esempi) console.log(`    ${e}`);
}
