/**
 * La copertura vera dell'API, paese per paese e insegna per insegna.
 *
 * PERCHE' NON BASTA IL NUMERO GROSSO
 * ----------------------------------
 * «Due milioni e settecentomila prodotti» e' vero e non dice quasi niente.
 * Quel numero conta gli indirizzi che i negozi pubblicano: dice quanto e'
 * grande il catalogo, non quanto e' utile.
 *
 * Fra il catalogo e una lista della spesa con i prezzi ci sono tre passaggi,
 * e ognuno perde pezzi:
 *
 *   1. il prodotto esiste nel catalogo?     dipende da quali insegne abbiamo
 *   2. la voce della lista lo trova?        dipende dalle parole e dalla lingua
 *   3. la pagina dichiara il prezzo?        dipende da come e' fatto il sito
 *
 * Il terzo e' il piu' spietato e il meno intuitivo: in Spagna nove insegne su
 * dieci il prezzo lo disegnano con JavaScript, e nell'HTML non c'e' niente da
 * leggere. Catalogo enorme, prezzi zero.
 *
 * COSA MISURA QUESTO RAPPORTO
 * ---------------------------
 * Le tre cose insieme, sui dati veri che stanno in magazzino — non su una
 * stima. Per ogni paese:
 *
 *   dichiarati   quanti prodotti pubblicano le insegne di quel paese
 *   provati      quante schede abbiamo aperto davvero
 *   con prezzo   quante di quelle hanno dato un prezzo leggibile
 *
 * E la riga che conta piu' di tutte: su una spesa tipo, quante voci trovano un
 * prezzo. E' il numero che l'utente vede, ed e' l'unico che si puo' promettere
 * a un cliente.
 *
 * Uso:  npx tsx scripts/copertura.ts
 */

import { writeFileSync } from "node:fs";
import { prezzi as collezionePrezzi } from "../src/db.js";
import { FONTI } from "../src/catalogo-fonti.js";

const n = (x: number) => x.toLocaleString("it-IT");
const perc = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

async function main() {
  const righe = await (await collezionePrezzi()).find({}).toArray();

  if (righe.length === 0) {
    console.log("\nIl magazzino e' vuoto: lancia prima scripts/riempi-prezzi.ts\n");
    process.exit(0);
  }

  /* Le insegne del magazzino si riconducono al loro paese passando dalle
     fonti: nel magazzino c'e' il nome dell'insegna, non il paese, perche' la
     chiave e' l'indirizzo della scheda. */
  const paeseDi = new Map<string, string>();
  for (const f of FONTI) paeseDi.set(f.insegna, f.paese);

  const perInsegna = new Map<
    string,
    { paese: string; provate: number; conPrezzo: number; aperte: number }
  >();

  for (const r of righe) {
    const paese = paeseDi.get(r.insegna) ?? "??";
    const c = perInsegna.get(r.insegna) ?? { paese, provate: 0, conPrezzo: 0, aperte: 0 };
    c.provate++;
    if (r.verifica !== "non-raggiungibile") c.aperte++;
    if (r.prezzo != null) c.conPrezzo++;
    perInsegna.set(r.insegna, c);
  }

  /* ── Per paese ────────────────────────────────────────────────── */
  const perPaese = new Map<
    string,
    { insegne: number; dichiarati: number; provate: number; conPrezzo: number }
  >();

  for (const f of FONTI) {
    const c = perPaese.get(f.paese) ?? { insegne: 0, dichiarati: 0, provate: 0, conPrezzo: 0 };
    c.insegne++;
    c.dichiarati += f.stimati;
    perPaese.set(f.paese, c);
  }
  for (const [insegna, v] of perInsegna) {
    const c = perPaese.get(v.paese);
    if (!c) continue;
    c.provate += v.provate;
    c.conPrezzo += v.conPrezzo;
    void insegna;
  }

  console.log("\n" + "═".repeat(78));
  console.log("  COPERTURA PER PAESE");
  console.log("═".repeat(78));
  console.log("  paese  insegne   dichiarati    schede provate   con prezzo");
  console.log("  " + "─".repeat(74));

  const ordinati = [...perPaese.entries()].sort((a, b) => b[1].provate - a[1].provate);
  for (const [paese, v] of ordinati) {
    if (v.provate === 0) continue;
    console.log(
      `  ${paese.padEnd(6)} ${String(v.insegne).padStart(5)}   ${n(v.dichiarati).padStart(11)}   ` +
        `${String(v.provate).padStart(13)}   ${(`${v.conPrezzo} (${perc(v.conPrezzo, v.provate)})`).padStart(11)}`,
    );
  }

  const mai = ordinati.filter(([, v]) => v.provate === 0);
  if (mai.length) {
    console.log(
      `\n  mai provati (${mai.length} paesi): ${mai.map(([p]) => p).join(" ")}` +
        `\n  hanno catalogo ma nessuno li ha ancora chiesti — la copertura li' e' ignota, non zero.`,
    );
  }

  /* ── Per insegna ──────────────────────────────────────────────── */
  console.log("\n" + "═".repeat(78));
  console.log("  LE INSEGNE CHE REGGONO L'API  (schede provate >= 5)");
  console.log("═".repeat(78));
  console.log("  paese  insegna                      provate   aperte   con prezzo");
  console.log("  " + "─".repeat(74));

  const utili = [...perInsegna.entries()]
    .filter(([, v]) => v.provate >= 5)
    .sort((a, b) => b[1].conPrezzo / b[1].provate - a[1].conPrezzo / a[1].provate);

  for (const [insegna, v] of utili) {
    console.log(
      `  ${v.paese.padEnd(6)} ${insegna.padEnd(28).slice(0, 28)} ${String(v.provate).padStart(7)}   ` +
        `${String(v.aperte).padStart(6)}   ${(`${v.conPrezzo} (${perc(v.conPrezzo, v.provate)})`).padStart(11)}`,
    );
  }

  /* ── Il totale onesto ─────────────────────────────────────────── */
  const provate = righe.length;
  const aperte = righe.filter((r) => r.verifica !== "non-raggiungibile").length;
  const conPrezzo = righe.filter((r) => r.prezzo != null).length;

  console.log("\n" + "═".repeat(78));
  console.log("  IN TUTTO");
  console.log("═".repeat(78));
  console.log(`  schede in magazzino        ${n(provate)}`);
  console.log(`  di cui la pagina si apre   ${n(aperte)}  (${perc(aperte, provate)})`);
  console.log(`  di cui con prezzo VERO     ${n(conPrezzo)}  (${perc(conPrezzo, provate)})`);
  console.log(
    `\n  prodotti dichiarati dalle sitemap: ${n(FONTI.reduce((a, f) => a + f.stimati, 0))}` +
      `\n  — e' la grandezza del catalogo, non la copertura. La copertura e' la riga sopra.\n`,
  );

  /* Lo stesso rapporto in JSON, per chi lo vuole guardare invece che leggerlo.
     I nomi dei campi dicono cosa sono DAVVERO: `dichiaratiDalleSitemap` e non
     `prodotti`, perche' confondere quel numero con la copertura e' esattamente
     cio' che fa promettere al cliente quello che non si ha. */
  const rapporto = {
    generatoIl: new Date().toISOString(),

    inSintesi: {
      dichiaratiDalleSitemap: FONTI.reduce((a, f) => a + f.stimati, 0),
      nota: "quanto e' GRANDE il catalogo: indirizzi reali, mai aperti",
      insegneInCatalogo: FONTI.length,
      paesiInCatalogo: new Set(FONTI.map((f) => f.paese)).size,
      schedeAperteDavvero: provate,
      schedeCheSiAprono: aperte,
      SCHEDE_CON_PREZZO_VERO: conPrezzo,
      quotaConPrezzo: perc(conPrezzo, provate),
      paesiConCoperturaMisurata: ordinati.filter(([, v]) => v.provate > 0).length,
    },

    perPaese: ordinati
      .filter(([, v]) => v.provate > 0)
      .map(([paese, v]) => ({
        paese,
        insegne: v.insegne,
        dichiaratiDalleSitemap: v.dichiarati,
        schedeProvate: v.provate,
        conPrezzo: v.conPrezzo,
        quota: perc(v.conPrezzo, v.provate),
      })),

    paesiMaiProvati: {
      quanti: mai.length,
      elenco: mai.map(([p]) => p),
      nota: "hanno catalogo ma nessuno li ha ancora chiesti: copertura ignota, non zero",
    },

    perInsegna: utili.map(([insegna, v]) => ({
      paese: v.paese,
      insegna,
      schedeProvate: v.provate,
      siAprono: v.aperte,
      conPrezzo: v.conPrezzo,
      quota: perc(v.conPrezzo, v.provate),
    })),

    insegneMute: {
      nota: "le pagine si aprono ma il prezzo non e' nell'HTML: lo disegna JavaScript",
      elenco: utili
        .filter(([, v]) => v.conPrezzo === 0)
        .map(([insegna, v]) => `${v.paese} ${insegna}`),
    },
  };

  writeFileSync("diario/copertura-api.json", JSON.stringify(rapporto, null, 2), "utf8");
  console.log("  rapporto anche in diario/copertura-api.json\n");

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
