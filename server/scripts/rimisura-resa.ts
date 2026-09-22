/**
 * Riapre il caso delle insegne dichiarate mute.
 *
 * COS'E' LA RESA E PERCHE' UNO ZERO E' DEFINITIVO
 * ----------------------------------------------
 * `resa` e' la quota di schede che espongono il prezzo, da 0 a 1. A zero il
 * lettore non apre nemmeno le pagine di quell'insegna — ed e' la scelta
 * giusta: aprire centomila schede sapendo che non daranno niente e' lavoro
 * buttato per noi e richieste inutili per loro.
 *
 * Il guaio e' che uno zero non si corregge da solo. Nessuno lo rimisura,
 * perche' per rimisurarlo bisognerebbe aprire proprio le pagine che quello
 * zero dice di non aprire.
 *
 * E QUEGLI ZERI LI HA MESSI UN LETTORE CHE NON C'E' PIU'
 * ------------------------------------------------------
 * Fra il 19 e il 21 settembre il lettore e' cambiato in quattro punti che
 * riguardano esattamente questo:
 *
 *   · si presenta con tutte e nove le intestazioni di un browser invece che
 *     due (Alcampo e Continente rispondevano 403 e sembravano morti)
 *   · legge il JSON-LD come JSON invece che a colpi di espressione regolare
 *   · non scambia piu' le spese di spedizione per il prezzo
 *   · sa leggere `<meta itemprop="price">` con il simbolo di valuta davanti
 *
 * Misurato il 21 settembre: Auchan Polonia aveva `resa 0.17`, e aperta adesso
 * da' cinque prezzi su cinque. Ventitre insegne stanno a zero con un catalogo
 * vero, per 530.432 indirizzi che nessuno guardera' mai finche' quello zero
 * resta li'.
 *
 * COSA FA
 * -------
 * Apre davvero un campione di schede e conta. Se il prezzo c'e', scrive la
 * resa misurata e l'insegna torna in circolo; se non c'e', lo zero resta e
 * la nota dice quando e' stato riconfermato — cosi' fra un mese si sa che la
 * domanda e' gia' stata fatta.
 *
 * NON DISTINGUE I DIVIETI, E NON DEVE
 * -----------------------------------
 * Iperal, CoopShop ed Esselunga hanno zero perche' il prezzo lo mostrano solo
 * a chi ha un account. Quelle pagine si aprono e il prezzo non c'e': la misura
 * lo confermera' da sola, senza bisogno di un elenco di eccezioni da tenere
 * aggiornato a mano. Le insegne ESCLUSE (campo `esclusa`) non entrano proprio
 * in `tutteLeFonti`, quindi qui non arrivano mai.
 *
 *   npx tsx --env-file-if-exists=.env scripts/rimisura-resa.ts
 *   npx tsx --env-file-if-exists=.env scripts/rimisura-resa.ts --scrivi
 *   npx tsx --env-file-if-exists=.env scripts/rimisura-resa.ts --solo Greenweez --scrivi
 */

import { cataloghi, fonti } from "../src/base/db.js";
import { catalogoSalvato } from "../src/api/catalogo-magazzino.js";
import { assicuraFonti, tutteLeFonti } from "../src/api/catalogo-fonti.js";
import { verifyProductPage } from "../src/api/price-page.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const scrivi = process.argv.includes("--scrivi");
const solo = arg("--solo");
/** Quante schede si aprono per decidere. Dodici: «tre su dodici» e' un fatto. */
const CAMPIONE = Number(arg("--campione") ?? 12);
/** Sotto questo catalogo non vale la pena disturbare nessuno. */
const MINIMO = Number(arg("--minimo") ?? 1000);
/** Una richiesta ogni tanto e' il passo giusto: qui non c'e' nessuna fretta. */
const PAUSA = Number(arg("--pausa") ?? 2500);
/**
 * Quante devono dare un prezzo perche' l'insegna torni in circolo.
 *
 * Due su dodici. Basso di proposito: il rischio di sbagliare in eccesso e'
 * che il lettore apra qualche migliaio di pagine che non rendono, e se ne
 * accorge da solo mettendo l'insegna in pausa dopo venti rifiuti. Il rischio
 * di sbagliare in difetto e' che centomila prodotti veri restino invisibili
 * per sempre, e nessuno se ne accorga mai.
 */
const SOGLIA = Number(arg("--soglia") ?? 2 / 12);

const n = (v: number) => v.toLocaleString("it-IT");
const aspetta = (ms: number) => new Promise((r) => setTimeout(r, ms));

await assicuraFonti();
const C = await cataloghi();
const F = await fonti();

let elenco = tutteLeFonti().filter((f) => f.resa <= 0);
if (solo) elenco = elenco.filter((f) => f.insegna.toLowerCase().includes(solo.toLowerCase()));

console.log("");
console.log(`RIMISURO LA RESA · ${elenco.length} insegne a zero · ${CAMPIONE} schede ciascuna`);
console.log("");

let tornate = 0;
let indirizziTornati = 0;

for (const f of elenco) {
  const doc = (await C.findOne(
    { _id: `${f.paese}|${f.insegna}` } as never,
    { projection: { prodotti: 1 } },
  )) as { prodotti?: number } | null;
  const ind = Number(doc?.prodotti ?? 0);
  if (ind < MINIMO) continue;

  const voci = await catalogoSalvato(f.paese, f.insegna);
  if (!voci || voci.length === 0) {
    console.log(`  ${(f.paese + "|" + f.insegna).padEnd(28)} catalogo non leggibile, salto`);
    continue;
  }

  /* Sparse per tutto l'elenco: le prime mille voci di un catalogo sono spesso
     una categoria sola, e una categoria non descrive l'insegna. */
  const passo = Math.max(1, Math.floor(voci.length / CAMPIONE));
  const campione = [];
  for (let i = 0; i < voci.length && campione.length < CAMPIONE; i += passo) campione.push(voci[i]);

  process.stdout.write(
    `  ${(f.paese + "|" + f.insegna).padEnd(28)} ${n(ind).padStart(8)} indirizzi · provo ${campione.length} ...`,
  );

  let con = 0;
  let rifiuti = 0;
  for (const x of campione) {
    const v = await verifyProductPage(x.url);
    if (v.page?.current != null) con++;
    else if (v.status === "bloccato") rifiuti++;
    await aspetta(PAUSA);
  }

  const eti = `  ${(f.paese + "|" + f.insegna).padEnd(28)} ${n(ind).padStart(8)} indirizzi · ${con}/${campione.length} con prezzo`;

  /* UN'INSEGNA CHE CI RIFIUTA NON SI GIUDICA.
     Meta' del campione «bloccato» non dice se il prezzo c'e': dice che in
     questo momento non ci parlano. Scrivere zero su quella base vorrebbe dire
     mettere in archivio come «non pubblica i prezzi» un negozio che i prezzi
     li pubblica benissimo — che e' il modo in cui uno zero sbagliato diventa
     definitivo. */
  if (rifiuti >= campione.length / 2) {
    console.log(`\r${eti} · ${rifiuti} RIFIUTI: non giudico`);
    continue;
  }

  const quota = con / campione.length;
  if (quota < SOGLIA) {
    console.log(`\r${eti} · lo zero regge`);
    if (scrivi) {
      await F.updateOne(
        { _id: `${f.paese}|${f.insegna}` } as never,
        {
          $set: {
            nota:
              `${f.nota ? f.nota + "; " : ""}resa 0 riconfermata il ` +
              `${new Date().toLocaleDateString("it-IT")} su ${campione.length} schede aperte davvero`,
          },
        },
      );
    }
    continue;
  }

  const resa = Math.round(quota * 100) / 100;
  console.log(`\r${eti} · TORNA IN CIRCOLO con resa ${resa}${scrivi ? "" : " (prova a vuoto)"}`);
  tornate++;
  indirizziTornati += ind;

  if (!scrivi) continue;
  await F.updateOne(
    { _id: `${f.paese}|${f.insegna}` } as never,
    {
      $set: {
        resa,
        nota:
          `${f.nota ? f.nota + "; " : ""}era a 0; resa ${resa} rimisurata il ` +
          `${new Date().toLocaleDateString("it-IT")} su ${campione.length} schede aperte davvero, ` +
          `dopo che il lettore ha imparato a leggere JSON-LD e intestazioni da browser`,
      },
    },
  );
}

console.log("");
console.log(`  ${tornate} insegne tornano in circolo · ${n(indirizziTornati)} indirizzi`);
if (!scrivi && tornate > 0) {
  console.log("");
  console.log("  Niente e' stato scritto. Per farlo:  ... rimisura-resa.ts --scrivi");
}
console.log("");
process.exit(0);
