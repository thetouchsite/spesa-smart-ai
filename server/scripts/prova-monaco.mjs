/**
 * Le sedici voci della prova di Monaco, cercate in quattro modi.
 *
 * Serve a separare le cause: quanto perde la CODA con la quantita', quanto
 * perde la DIERESI scritta in un modo solo, e quanto resta perso comunque —
 * che e' il catalogo tedesco che quel prodotto non ce l'ha.
 */
const VOCI = [
  "Zucchini 1 kg", "Paprika Mix 1 confezione da 500 g",
  "Kirschtomaten 2 confezioni da 500 g", "Äpfel 1 sacchetto da 2 kg",
  "Tafeltrauben hell 1 confezione da 500 g", "Hähnchenbrustfilet 1 confezione da 1 kg",
  "Rinderhackfleisch 1 confezione da 800 g", "Lachsfilets 2 confezioni da 250 g",
  "Griechischer Joghurt 1 secchiello da 1 kg", "Mozzarella 3 confezioni da 125 g",
  "Eier aus Freilandhaltung 1 confezione da 10 pezzi", "Pasta 2 confezioni da 500 g",
  "Basmati Reis 1 confezione da 1 kg", "Natives Olivenöl Extra 1 bottiglia da 750 ml",
  "Passierte Tomaten 2 confezioni da 500 ml", "Vollkornbrot 1 pagnotta da 500 g",
];

/** Toglie «2 confezioni da 500 g», «1 sacchetto da 2 kg», «1 bottiglia da 750 ml». */
const senzaCoda = (s) =>
  s.replace(
    /\s+\d+\s*(confezion\w*|sacchett\w*|bottigli\w*|secchiell\w*|pagnott\w*|vasett\w*|bust\w*|pezz\w*|barattol\w*)?\s*(da\s+)?[\d.,]*\s*(kg|g|gr|ml|cl|l|pezzi|pz)?\s*$/i,
    "",
  ).replace(/\s+\d+\s*(kg|g|gr|ml|cl|l)\s*$/i, "").trim();

/** Come lo scrive il catalogo tedesco: ä→ae, ö→oe, ü→ue, ß→ss. */
const aeOeUe = (s) =>
  s.replace(/ä/gi, (m) => (m === "ä" ? "ae" : "Ae"))
   .replace(/ö/gi, (m) => (m === "ö" ? "oe" : "Oe"))
   .replace(/ü/gi, (m) => (m === "ü" ? "ue" : "Ue"))
   .replace(/ß/g, "ss");

async function cerca(q) {
  const r = await fetch("http://localhost:3000/catalogo/cerca", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paese: "DE", q, quanti: 6 }),
  });
  return (await r.json()).trovati ?? [];
}

const tot = { intera: 0, coda: 0, dier: 0, tutte: 0 };
console.log("voce".padEnd(34) + "intera  -coda  -dieresi  tutt'e due   esempio col metodo migliore");
console.log("─".repeat(112));

for (const v of VOCI) {
  const varianti = {
    intera: v,
    coda: senzaCoda(v),
    dier: aeOeUe(v),
    tutte: aeOeUe(senzaCoda(v)),
  };
  const esiti = {};
  for (const [k, q] of Object.entries(varianti)) esiti[k] = await cerca(q);
  for (const k of Object.keys(tot)) if (esiti[k].length) tot[k]++;

  const best = esiti.tutte.length ? esiti.tutte : esiti.coda.length ? esiti.coda : esiti.intera;
  const n = (k) => String(esiti[k].length).padStart(k === "intera" ? 6 : 7);
  console.log(
    v.slice(0, 33).padEnd(34) + n("intera") + n("coda") + n("dier") + n("tutte") +
      "    " + (best[0]?.nome.slice(0, 40) ?? "— niente —"),
  );
}

console.log("─".repeat(112));
console.log(
  `voci che trovano almeno un prodotto, su ${VOCI.length}:\n` +
  `   com'e' adesso            ${tot.intera}\n` +
  `   togliendo la quantita'   ${tot.coda}\n` +
  `   sistemando la dieresi    ${tot.dier}\n` +
  `   tutte e due              ${tot.tutte}`,
);
