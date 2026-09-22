/**
 * Cosa estrae davvero `schedaDallaPagina`, su schede vere.
 *
 * Le stesse dodici insegne del sondaggio nell'audit, in otto paesi. Si va
 * piano — una pagina ogni tre secondi — perche' i negozi rispondono 429 a chi
 * corre, e un 429 non si vede: diventa una misura sbagliata su cui si decide.
 */
import { porzioneConPrezzi } from "../src/api/price-page.js";
import { schedaDallaPagina } from "../src/api/scheda-pagina.js";

const PAGINE: Array<[string, string]> = [
  ["Carrefour IT", "https://www.carrefour.it/p/nutella-450-g/0000080050865.html"],
  ["Bennet IT", "https://www.bennet.com/Categories/BEVANDE/BIBITE/BIBITE-GASSATE/COCA-COLA-ZERO-LT-1/p/P_1093442"],
  ["Coop IT", "https://www.easycoop.com/coca-cola-zero-10x330ml-7916127.html"],
  ["Morrisons GB", "https://groceries.morrisons.com/products/morrisons-baby-plum-tomatoes-250g/108388174"],
  ["Sainsbury's GB", "https://www.sainsburys.co.uk/groceries/product/ktc-coconut-milk-400ml"],
  ["Lidl GB", "https://www.lidl.co.uk/p/deluxe-italian-cherry-tomatoes/p10017340"],
  ["Rimi LT", "https://www.rimi.lt/e-parduotuve/lt/produktai/kosmetika-ir-higiena/intymios-higienos-prekes/higieniniai-paketai/hig-pak-bella-perfecta-ultr-green-20vnt/p/7002442"],
  ["Continente PT", "https://www.continente.pt/produto/massa-esparguete-pack-poupanca-continente-5253941.html"],
  ["PlanetaHuerto ES", "https://www.planetahuerto.es/products/harina-de-trigo-de-fuerza-eco-planeta-huerto-800-g"],
  ["Freshful RO", "https://www.freshful.ro/p/100110735-meteoritzi-covrigi-cu-gust-de-sriracha-cheese-75g"],
  ["eBag BG", "https://www.ebag.bg/en/nuxe-aquabella-razkrasiavashch-losion-200ml/634003"],
  ["Tommy HR", "https://www.tommy.hr/en-GB/proizvodi/optima-triangular-graphite-pencil-with-eraser-100149-p12-144-1728"],
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";

const DISP = ["ignota", "disponibile", "esaurita", "limitata"];
const conta = { marca: 0, sku: 0, immagine: 0, disponibilita: 0, categoria: 0, niente: 0 };

for (const [nome, url] of PAGINE) {
  let scheda: ReturnType<typeof schedaDallaPagina>;
  let stato = "";
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "it,en;q=0.8" },
      signal: AbortSignal.timeout(25_000),
    });
    stato = String(r.status);
    if (r.ok) scheda = schedaDallaPagina(porzioneConPrezzi(await r.text()));
  } catch (e) {
    stato = (e as Error)?.name ?? "errore";
  }

  console.log(`\n  ${nome}  (HTTP ${stato})`);
  if (!scheda) {
    conta.niente++;
    console.log("    niente");
  } else {
    if (scheda.marca) conta.marca++;
    if (scheda.sku) conta.sku++;
    if (scheda.immagine) conta.immagine++;
    if (scheda.disponibilita !== undefined) conta.disponibilita++;
    if (scheda.categoria) conta.categoria++;
    console.log(`    marca         ${scheda.marca ?? "—"}`);
    console.log(`    sku           ${scheda.sku ?? "—"}`);
    console.log(`    immagine      ${scheda.immagine ? scheda.immagine.slice(0, 68) + "…" : "—"}`);
    console.log(`    disponibile   ${scheda.disponibilita !== undefined ? DISP[scheda.disponibilita] : "—"}`);
    console.log(`    categoria     ${scheda.categoria ?? "—"}`);
    console.log(`    fonte         ${scheda.fonte}`);
  }
  await new Promise((s) => setTimeout(s, 3000));
}

const n = PAGINE.length;
console.log(`\n  ═══ su ${n} insegne ═══`);
for (const [k, v] of Object.entries(conta)) {
  console.log(`    ${k.padEnd(16)}${v}/${n}`);
}
