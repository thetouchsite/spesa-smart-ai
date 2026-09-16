/**
 * Il nome che dichiara la pagina e' piu' utile di quello dell'indirizzo?
 *
 * PERCHE' LA DOMANDA CONTA
 * ------------------------
 * Il prezzo al chilo si calcola dal peso, e il peso si legge dal nome. I nomi
 * del catalogo vengono dalle sitemap, cioe' dagli INDIRIZZI, e li' il formato
 * spesso non c'e': `latte-intero` invece di «Latte intero UHT 1 l».
 *
 * L'idea e' che la pagina il nome per esteso lo dichiari — e visto che quella
 * pagina la apriamo gia' per leggere il prezzo, non costerebbe niente.
 *
 * Questa prova dice se l'idea funziona, e su quali insegne. Misurato sul
 * Regno Unito ha portato il prezzo al chilo dal 50 al 59%; in Italia non si e'
 * mosso, e prima di dare la colpa al codice conviene guardare i nomi veri.
 *
 * SI VA PIANO, DI PROPOSITO
 * -------------------------
 * Apre poche pagine con una pausa lunga fra l'una e l'altra. I negozi
 * rispondono 429 a chi corre, e un 429 non si vede: diventa una misura
 * sbagliata su cui poi si decide. Ci siamo gia' cascati tre volte.
 *
 * Uso:  PAESE=IT QUANTI=12 npx tsx --env-file-if-exists=.env scripts/nome-dalla-pagina.mts
 */

import { catalogoDi } from "../src/api/catalogo.js";
import { quantitaDa } from "../src/api/quantita.js";
import { verifyProductPage } from "../src/api/price-page.js";

const PAESE = process.env.PAESE ?? "IT";
const QUANTI = Number(process.env.QUANTI ?? 12);
const PAUSA_MS = 2000;

const cat = await catalogoDi(PAESE);
if (!cat) {
  console.log(`  ${PAESE}: nessun catalogo`);
  process.exit(0);
}

/* Campione sparso e per insegne diverse: prendere le prime dodici voci
   misurerebbe una sitemap sola, e le sitemap cominciano quasi sempre con una
   categoria che non rappresenta niente. */
const perInsegna = new Map<string, (typeof cat.voci)[number][]>();
for (const v of cat.voci) {
  const lista = perInsegna.get(v.insegna) ?? [];
  if (lista.length < 2) {
    lista.push(v);
    perInsegna.set(v.insegna, lista);
  }
}
const campione = [...perInsegna.values()].flat().slice(0, QUANTI);

let gia = 0;      // il nome dell'indirizzo il peso ce l'aveva gia'
let recuperate = 0; // non ce l'aveva, la pagina sì
let niente = 0;   // nessuno dei due
let mute = 0;     // la pagina non risponde o non dichiara un nome

console.log(`\n  ${PAESE}: ${campione.length} schede, una ogni ${PAUSA_MS / 1000}s\n`);

for (const v of campione) {
  const qSlug = quantitaDa(v.nome);
  let nomePagina: string | undefined;
  try {
    const r = await verifyProductPage(v.url);
    nomePagina = r.page?.nome?.trim();
  } catch {
    /* lasciato indefinito: conta come muta */
  }
  const qPagina = nomePagina ? quantitaDa(nomePagina) : null;

  let esito: string;
  if (qSlug) { gia++; esito = "gia' nel nome"; }
  else if (qPagina) { recuperate++; esito = "✓ RECUPERATA dalla pagina"; }
  else if (!nomePagina) { mute++; esito = "pagina muta"; }
  else { niente++; esito = "nessuno dei due"; }

  console.log(
    `  ${v.insegna.slice(0, 15).padEnd(17)}${v.nome.slice(0, 30).padEnd(32)}` +
      `${(nomePagina ?? "—").slice(0, 32).padEnd(34)}${esito}`,
  );
  await new Promise((s) => setTimeout(s, PAUSA_MS));
}

console.log(`\n  il peso c'era gia' nel nome:        ${gia}`);
console.log(`  RECUPERATO dalla pagina:            ${recuperate}   ← quanto vale la modifica`);
console.log(`  nessuno dei due ce l'ha:            ${niente}`);
console.log(`  pagina muta o senza nome:           ${mute}\n`);
