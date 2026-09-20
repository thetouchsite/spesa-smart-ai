/**
 * Mette alla prova le insegne che nessuno ha mai provato.
 *
 * IL CERCHIO DA SPEZZARE
 * ----------------------
 * Nelle fonti c'e' un campo `resa`. Se vale zero, il lettore non apre nemmeno
 * una pagina di quell'insegna — giustamente: aprire schede che il prezzo non
 * ce l'hanno e' lavoro buttato.
 *
 * Ma questo rende il campo una profezia che si avvera da sola. Venticinque
 * insegne hanno `resa 0` e ZERO schede provate: marcate a zero una volta, mai
 * aperte da allora, e quindi zero per sempre. Sono 371.533 indirizzi il cui
 * destino dipende da un numero che nessuno ha piu' verificato.
 *
 * Che quel campo non sia affidabile e' dimostrato in tutte e due le
 * direzioni: Konzum Online ha `resa 0.97` scritta, e su undicimila schede
 * aperte ha dato zero prezzi. Se sbaglia cosi' da una parte, puo' sbagliare
 * anche dall'altra — e dall'altra costa 371.533 indirizzi.
 *
 * COSA FA
 * -------
 * Apre davvero un campione di schede per insegna, con `verifyProductPage` —
 * lo stesso lettore del lavoro vero, quindi la resa misurata qui e' la resa
 * che si otterra'. Poi lo dice. Con `--scrivi` aggiorna il campo.
 *
 * Il campione si prende SPARSO nel catalogo, non in testa: le sitemap sono
 * ordinate e le prime voci sono spesso una categoria sola. Misurare quella
 * darebbe la resa di un reparto, non del negozio.
 *
 *   npx tsx --env-file-if-exists=.env scripts/prova-resa.ts            (le mai provate)
 *   npx tsx --env-file-if-exists=.env scripts/prova-resa.ts --tutte
 *   npx tsx --env-file-if-exists=.env scripts/prova-resa.ts --solo LastMile
 *   npx tsx --env-file-if-exists=.env scripts/prova-resa.ts --scrivi
 */

import { gunzipSync } from "node:zlib";
import { fonti, cataloghi, prezzi } from "../src/base/db.js";
import { verifyProductPage } from "../src/api/price-page.js";

/**
 * Gli indirizzi di un catalogo, letti dal magazzino senza passare da
 * `catalogoSalvato`.
 *
 * PERCHE' NON SI USA QUELLA.
 * Perche' serve a RISPONDERE A UN UTENTE, e per quello rifiuta i cataloghi
 * piu' vecchi di trenta ore: giusto, nessuno vuole servire indirizzi
 * stantii. Ma qui si campiona per capire se un'insegna da' prezzi, e la data
 * dell'elenco non c'entra niente — e le insegne mai provate hanno per forza
 * il catalogo vecchio, sono quelle che nessuno tocca da settimane.
 *
 * Usandola, tutte e venticinque rispondevano «catalogo vuoto» e per giunta
 * facevano scattare l'interruttore di protezione dopo tre no di fila. Una
 * risposta uguale per tutte, che sembrava un fatto sul mondo ed era un fatto
 * sul nostro codice.
 */
async function indirizziDi(paese: string, insegna: string): Promise<Array<{ url: string; nome: string }>> {
  const doc = (await (await cataloghi()).findOne({ _id: `${paese}|${insegna}` })) as {
    dati?: { buffer: Buffer };
  } | null;
  if (!doc?.dati) return [];
  try {
    return gunzipSync(Buffer.from(doc.dati.buffer))
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((riga) => {
        const taglio = riga.indexOf("\t");
        return taglio > 0
          ? { url: riga.slice(0, taglio), nome: riga.slice(taglio + 1) }
          : { url: riga, nome: "" };
      })
      .filter((v) => /^https?:\/\//.test(v.url));
  } catch {
    return [];
  }
}

const scrivi = process.argv.includes("--scrivi");
const tutte = process.argv.includes("--tutte");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const solo = arg("--solo");

/**
 * Quante schede per insegna.
 *
 * Trenta. Con venti un'insegna che rende il cinque per cento puo' dare zero
 * per sfortuna e verrebbe condannata avendo ragione lei; con trenta la
 * probabilita' scende sotto il cinque per cento. Non e' una misura fine — per
 * quella c'e' il lettore, che le apre tutte — e' la distinzione fra «qualcosa
 * da' » e «non da' niente», che e' la sola su cui si decide.
 */
const CAMPIONE = 30;

const n = (v: number) => v.toLocaleString("it-IT");

const collezione = await fonti();
const F = (await collezione.find({ esclusa: { $exists: false } }).toArray()) as Array<{
  id?: number;
  insegna: string;
  paese: string;
  resa?: number;
}>;

const C = (await (await cataloghi())
  .find({})
  .project({ paese: 1, insegna: 1, prodotti: 1 })
  .toArray()) as Array<{ paese?: string; insegna?: string; prodotti?: number }>;
const linkDi = new Map(C.map((c) => [`${c.paese}|${c.insegna}`, c.prodotti ?? 0]));

const agg = (await (await prezzi())
  .aggregate([{ $group: { _id: "$c", q: { $sum: 1 } } }])
  .toArray()) as Array<{ _id: number; q: number }>;
const provate = new Map<number, number>(agg.map((a) => [a._id, a.q]));

let elenco = F.filter((f) => (linkDi.get(`${f.paese}|${f.insegna}`) ?? 0) > 0);
if (solo) elenco = elenco.filter((f) => f.insegna.toLowerCase().includes(solo.toLowerCase()));
else if (!tutte) {
  /* Quelle di cui non sappiamo niente: nessuna scheda aperta, mai. Sono le
     uniche su cui una prova cambia una decisione. */
  elenco = elenco.filter((f) => (typeof f.id === "number" ? (provate.get(f.id) ?? 0) : 0) === 0);
}

elenco.sort(
  (a, b) => (linkDi.get(`${b.paese}|${b.insegna}`) ?? 0) - (linkDi.get(`${a.paese}|${a.insegna}`) ?? 0),
);

if (elenco.length === 0) {
  console.log("\nNessuna insegna da provare.\n");
  process.exit(0);
}

console.log("");
console.log(`PROVA RESA · ${elenco.length} insegne · ${CAMPIONE} schede ciascuna`);
console.log("");

const esiti: Array<{ f: (typeof elenco)[0]; link: number; resa: number; aperte: number; campione: number }> = [];

for (const f of elenco) {
  const link = linkDi.get(`${f.paese}|${f.insegna}`) ?? 0;
  const eti = `  ${f.paese} ${f.insegna.padEnd(24).slice(0, 24)}`;

  const voci = await indirizziDi(f.paese, f.insegna);
  if (voci.length === 0) {
    console.log(`${eti} il catalogo salvato e' vuoto`);
    continue;
  }

  const passo = Math.max(1, Math.floor(voci.length / CAMPIONE));
  const campione: Array<{ url: string; nome: string }> = [];
  for (let i = 0; i < voci.length && campione.length < CAMPIONE; i += passo) campione.push(voci[i]);

  let conPrezzo = 0;
  let aperte = 0;
  for (const v of campione) {
    try {
      const e = await verifyProductPage(v.url);
      if (e.status === "verificato" || e.status === "pagina-ok") aperte++;
      if (e.page && typeof e.page.current === "number") conPrezzo++;
    } catch {
      /* una scheda che non si apre e' gia' un dato: conta come non resa */
    }
  }

  const resa = conPrezzo / campione.length;
  esiti.push({ f, link, resa, aperte, campione: campione.length });

  const verdetto =
    conPrezzo === 0
      ? aperte === 0
        ? "MORTA: nemmeno una pagina si apre"
        : "le pagine si aprono ma il prezzo non c'e'"
      : `DA RIATTIVARE → circa ${n(Math.round(link * resa))} prezzi`;

  console.log(
    `${eti} ${n(link).padStart(8)} link · resa ${String(Math.round(resa * 100)).padStart(3)}% ` +
      `(${conPrezzo}/${campione.length}) · ${aperte} aperte · ${verdetto}`,
  );
}

/* ── il conto ────────────────────────────────────────────────────────── */

const vive = esiti.filter((e) => e.resa > 0).sort((a, b) => b.link * b.resa - a.link * a.resa);
const morte = esiti.filter((e) => e.resa === 0);

console.log("");
if (vive.length > 0) {
  const guadagno = vive.reduce((a, e) => a + Math.round(e.link * e.resa), 0);
  console.log(`DA RIATTIVARE: ${vive.length} insegne · circa ${n(guadagno)} prezzi in piu'`);
  for (const e of vive) {
    console.log(
      `  ${e.f.paese} ${e.f.insegna.padEnd(24).slice(0, 24)} ${n(e.link).padStart(8)} link · ` +
        `resa ${Math.round(e.resa * 100)}% → ${n(Math.round(e.link * e.resa))} prezzi`,
    );
  }
  console.log("");
}
if (morte.length > 0) {
  const zavorra = morte.reduce((a, e) => a + e.link, 0);
  console.log(`CONFERMATE A ZERO: ${morte.length} insegne · ${n(zavorra)} indirizzi di zavorra`);
  console.log("");
}

if (!scrivi) {
  console.log("Niente e' stato scritto. Per aggiornare il campo `resa`:  ... prova-resa.ts --scrivi");
  console.log("");
  process.exit(0);
}

/* SI SCRIVE SOLO QUEL CHE SI E' MISURATO, E SI SCRIVE ANCHE LO ZERO.
   Uno zero confermato da trenta pagine aperte vale piu' di uno zero
   ereditato: la prossima volta che qualcuno guardera' questo campo sapra'
   che e' stato provato, e quando. Senza la nota, fra sei mesi rifara' lo
   stesso lavoro per riscoprire la stessa cosa. */
const oggi = new Date().toLocaleDateString("it-IT");
for (const e of esiti) {
  await collezione.updateOne(
    { paese: e.f.paese, insegna: e.f.insegna },
    {
      $set: {
        resa: Math.round(e.resa * 100) / 100,
        nota:
          `resa misurata il ${oggi} su ${e.campione} schede aperte davvero ` +
          `(${e.aperte} pagine rispondevano)`,
      },
    },
  );
}
console.log(`Aggiornate ${esiti.length} insegne.`);
console.log("");
process.exit(0);
