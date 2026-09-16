/**
 * Il modello sceglie meglio della classifica? Di quanto?
 *
 * La domanda che decide se l'IA si puo' togliere dalla strada dei prezzi.
 * Per ogni voce confronta CHI IL MODELLO HA SCELTO con CHI LA CLASSIFICA
 * METTEVA PRIMO. Se coincidono spesso, il modello sta pagando 14 secondi per
 * confermare un ordinamento che c'era gia'.
 */
const API = process.env.API ?? "http://localhost:3100";
const PAESE = process.env.PAESE ?? "IT";
const VOCI = (process.env.VOCI ?? "Zucchine,Petto di pollo,Pomodori pelati,Latte intero,Pasta,Riso,Olio di oliva,Uova,Mozzarella,Pane").split(",");

const post = async (r, b) =>
  (await fetch(`${API}${r}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })).json();

// Quello che l'utente ha visto: e' la scelta del modello.
const piano = await post("/ai/prices", {
  items: VOCI, city: PAESE === "IT" ? "Milano" : "London",
  country: PAESE, currency: PAESE === "IT" ? "EUR" : "GBP", priceSource: "catalogo",
});
const sceltoDalModello = new Map();
for (const p of piano.prezzi ?? []) {
  if (!sceltoDalModello.has(p.prodotto)) sceltoDalModello.set(p.prodotto, p.nome.toLowerCase());
}

let uguali = 0, diversi = 0, mancanti = 0;
console.log("voce".padEnd(20) + "primo della classifica".padEnd(44) + "scelto dal modello");
console.log("─".repeat(108));

for (const voce of VOCI) {
  const { trovati } = await post("/catalogo/cerca", { paese: PAESE, q: voce, quanti: 5 });
  const primo = trovati?.[0]?.nome?.toLowerCase();
  const scelto = sceltoDalModello.get(voce);
  if (!scelto) { mancanti++; console.log(voce.padEnd(20) + String(primo ?? "—").slice(0,42).padEnd(44) + "(il modello non ha scelto niente)"); continue; }
  const stesso = primo === scelto;
  if (stesso) uguali++; else diversi++;
  console.log(
    voce.padEnd(20) + String(primo ?? "—").slice(0, 42).padEnd(44) +
    (stesso ? "= lo stesso" : scelto.slice(0, 42)),
  );
}

console.log("─".repeat(108));
console.log(`la classifica da sola azzeccava ${uguali}/${uguali + diversi} (diverse ${diversi}, senza scelta ${mancanti})`);
