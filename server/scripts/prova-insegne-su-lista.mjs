/**
 * Le insegne del censimento, messe alla prova su una lista vera.
 *
 * LA DOMANDA
 * ----------
 * Sapere che un supermercato ha un catalogo online non dice ancora niente di
 * utile. La domanda che conta è un'altra: se prendo la spesa che il motore ha
 * scritto per un utente vero e la cerco DENTRO quel negozio, ne esce un
 * prodotto con un prezzo e una pagina che si apre?
 *
 * COME
 * ----
 * Si riprende l'ultima lista generata per il paese dal diario — nessuna
 * chiamata al modello, nessun costo — e per ogni prodotto si fa una ricerca
 * ristretta al dominio dell'insegna. Il primo risultato viene aperto con lo
 * stesso verificatore che usa la produzione: o dichiara un prezzo, o dice
 * perché no.
 *
 * COSA SI IMPARA
 * --------------
 * Quali insegne, per paese, valga davvero la pena suggerire al motore — e
 * quali siano solo un nome su un elenco.
 *
 * LA RICERCA VA FATTA CON UN MOTORE VERO. DuckDuckGo risponde `202` dopo otto
 * ricerche `site:` e da lì in poi trova zero: con quello il risultato non
 * misura i negozi, misura il blocco. Serve SEARCH_PROVIDER=serpapi.
 *
 * Uso:  SEARCH_PROVIDER=serpapi npx tsx scripts/prova-insegne-su-lista.mjs IT 5 5
 *       (paese, quanti prodotti, quante insegne — le ricerche sono il prodotto
 *        dei due, e la quota gratuita di SerpAPI è 250 al mese)
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { insegnePerPaese } from "../src/insegne-online.js";
import { searchProvider } from "../src/search.js";
import { verifyProductPage } from "../src/price-page.js";

const PAESE = (process.argv[2] ?? "IT").toUpperCase();
const QUANTI = Number(process.argv[3] ?? 8);
const QUANTE_INSEGNE = Number(process.argv[4] ?? 5);

/** Come si chiama quel paese nelle richieste salvate. */
const NOME_PAESE = {
  IT: ["Italia", "Italy"],
  GR: ["Ελλάδα", "Greece", "Grecia"],
  GB: ["United Kingdom", "Regno Unito"],
  JP: ["日本", "Japan", "Giappone"],
};

/** L'ultima lista generata per questo paese, dal diario. */
function ultimaLista(paese) {
  const nomi = NOME_PAESE[paese] ?? [paese];
  const file = readdirSync("diario").filter((f) => f.endsWith(".jsonl")).sort();
  let trovata = null;
  for (const f of file) {
    for (const linea of readFileSync(`diario/${f}`, "utf8").split("\n")) {
      if (!linea.trim()) continue;
      const r = JSON.parse(linea);
      if (r.tipo !== "lista") continue;
      if (!nomi.includes(r.richiesta?.country)) continue;
      trovata = r;
    }
  }
  return trovata;
}

async function main() {
  const diario = ultimaLista(PAESE);
  if (!diario) {
    console.error(`Nessuna lista per ${PAESE} nel diario: generane una prima.`);
    process.exit(1);
  }

  const prodotti = diario.lista
    .map((v) => v.nomeLocale || v.nome)
    .filter(Boolean)
    .slice(0, QUANTI);
  const insegne = insegnePerPaese(PAESE).slice(0, QUANTE_INSEGNE);
  const cerca = searchProvider();

  console.log(`\nLista del ${diario.quando.slice(0, 10)} — ${diario.richiesta.city}, ${diario.richiesta.country}`);
  console.log(`${prodotti.length} prodotti × ${insegne.length} insegne\n`);
  console.log(prodotti.map((p) => "  · " + p).join("\n") + "\n");

  const tabella = [];

  for (const insegna of insegne) {
    const esiti = [];
    for (const prodotto of prodotti) {
      // Ricerca ristretta al dominio: è il modo per chiedere «questo prodotto,
      // in QUESTO negozio» senza avere le API del negozio.
      const hits = await cerca.search(`site:${insegna.dominio} ${prodotto}`);
      const primo = hits.find((h) => h.url.includes(insegna.dominio));
      if (!primo) { esiti.push({ prodotto, esito: "non-trovato" }); continue; }

      const v = await verifyProductPage(primo.url);
      esiti.push({
        prodotto,
        esito: v.status,
        prezzo: v.price?.current ?? null,
        valuta: v.price?.currency ?? null,
        url: primo.url,
        titolo: primo.title?.slice(0, 60),
      });
    }

    const conta = (s) => esiti.filter((e) => e.esito === s).length;
    // Il numero che conta per l'utente: una pagina del prodotto che si apre.
    // "bloccato" ci sta dentro — il sito respinge noi, non il suo cliente.
    const utili = esiti.filter((e) => ["verificato", "pagina-ok", "bloccato"].includes(e.esito)).length;

    const riga = {
      insegna: insegna.nome,
      dominio: insegna.dominio,
      trovati: prodotti.length - conta("non-trovato"),
      utili,
      conPrezzo: conta("verificato"),
      bloccati: conta("bloccato"),
      rotti: conta("non-raggiungibile"),
      esiti,
    };
    tabella.push(riga);

    console.log(
      `${insegna.nome.padEnd(24).slice(0, 24)} ${insegna.dominio.padEnd(22).slice(0, 22)} ` +
        `trovati ${String(riga.trovati).padStart(2)}/${prodotti.length}  ` +
        `pagina utile ${String(utili).padStart(2)}  ` +
        `prezzo letto ${String(riga.conPrezzo).padStart(2)}  ` +
        `rotti ${String(riga.rotti).padStart(2)}`,
    );
    for (const e of esiti.filter((x) => x.esito === "verificato").slice(0, 3)) {
      console.log(`      ${String(e.prodotto).slice(0, 26).padEnd(28)} ${e.prezzo} ${e.valuta ?? ""}  ${e.titolo ?? ""}`);
    }
  }

  tabella.sort((a, b) => b.conPrezzo - a.conPrezzo || b.utili - a.utili);
  console.log("\n" + "═".repeat(70));
  console.log(`  CLASSIFICA ${PAESE} — insegne che rendono davvero`);
  console.log("═".repeat(70));
  for (const r of tabella) {
    console.log(
      `  ${String(r.conPrezzo).padStart(2)} prezzi · ${String(r.utili).padStart(2)} pagine utili · ` +
        `${r.insegna}`,
    );
  }

  const dove = `diario/insegne-su-lista-${PAESE}.json`;
  writeFileSync(dove, JSON.stringify(tabella, null, 2), "utf8");
  console.log(`\nDettaglio in ${dove}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
