/**
 * VENTI VOCI DI UNA LISTA DELLA SPESA BRITANNICA.
 *
 * Serve a una cosa sola: il prodotto proposto e' quello che serve per cucinare?
 *
 * PERCHE' IL GIUDIZIO E' A MANO E NON AUTOMATICO
 * ----------------------------------------------
 * Scrivere una regola che dica «"cheddar cheese muffins" non e' del cheddar»
 * significa scrivere la stessa regola che sto provando: passerebbe sempre, e
 * non misurerebbe niente. Quindi qui si stampa e si guarda. L'esito atteso sta
 * accanto a ogni voce, cosi' il confronto e' verificabile da chiunque riapra
 * questo file.
 *
 * Le venti voci sono spesa vera: latte, pane, uova, pollo, verdura, dispensa.
 * Nessuna e' scelta per far fare bella figura al codice.
 */

import { catalogoDi, cercaNelCatalogo } from "../dist/api/catalogo.js";

const LISTA = [
  "milk", "bread", "eggs", "chicken breast", "tomatoes",
  "pasta", "cheddar cheese", "olive oil", "butter", "onions",
  "potatoes", "rice", "minced beef", "carrots", "yoghurt",
  "salmon fillet", "garlic", "flour", "tinned tomatoes", "cucumber",
];

const paese = process.env.PAESE ?? "GB";
await catalogoDi(paese);

let vuote = 0;
for (const q of LISTA) {
  const r = await cercaNelCatalogo(paese, q, 3);
  if (!r.length) {
    vuote++;
    console.log(`${q.padEnd(17)} — NIENTE`);
    continue;
  }
  console.log(
    `${q.padEnd(17)} ${r.map((v) => String(v.nome).slice(0, 34)).join("  |  ")}`,
  );
}
console.log(`\nvoci senza risposta: ${vuote}/${LISTA.length}`);
