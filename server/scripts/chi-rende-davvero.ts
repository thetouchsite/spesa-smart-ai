/**
 * Apre a mano un campione di ogni insegna, e dice quali rendono davvero.
 *
 * PERCHE' ESISTE
 * --------------
 * Il 22 settembre 2026 ho scambiato QUATTRO volte un difetto di
 * configurazione per un rifiuto dei negozi: Argentina, Emirati, Colombia,
 * Spagna. Ogni volta il sintomo era identico — zero per cento su migliaia di
 * pagine — e ogni volta la causa era in casa:
 *
 *   · il lettore apriva sempre la testa della sitemap, che e' roba tolta
 *   · due insegne sulla stessa piattaforma interrogate insieme, cioe' il
 *     doppio del carico su un backend solo (Alcampo e Bonpreu)
 *   · una pausa tarata su un'insegna e applicata a tutte
 *
 * La verifica che distingue le due cose costa sei richieste per insegna, e
 * l'ho rifatta a mano ogni volta. Tanto vale averla come comando.
 *
 * COSA FA, E PERCHE' COSI'
 * ------------------------
 * Per ogni insegna con lavoro residuo apre SEI schede MAI VISTE, una ogni tre
 * secondi, una insegna per volta. Tre dettagli che contano tutti:
 *
 *   MAI VISTE    aprire schede a caso misura la resa dell'insegna, che
 *                sappiamo gia'. La domanda qui e' un'altra: quel che il
 *                lettore ha ancora DAVANTI, rende?
 *   SPARSE       ordinate per impronta, come fa il lettore. Prese in ordine
 *                di catalogo si finisce nella testa morta e si misura zero
 *                su un'insegna che rende il novanta per cento.
 *   UNA PER VOLTA  il punto e' sapere cosa risponde un negozio quando nessuno
 *                lo sta stressando. Se qui rende e col lettore no, il
 *                problema e' come lo stiamo interrogando — ed e' esattamente
 *                la risposta che serve.
 *
 * Tre secondi e sei schede: centottanta richieste in tutto per trenta
 * insegne, meno di quel che fa un utente che sfoglia un sito.
 *
 *   npx tsx --env-file-if-exists=.env scripts/chi-rende-davvero.ts
 *   npx tsx --env-file-if-exists=.env scripts/chi-rende-davvero.ts --paese ES
 *   npx tsx --env-file-if-exists=.env scripts/chi-rende-davvero.ts --minimo 20000
 */

import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { cataloghi, prezzi } from "../src/base/db.js";
import { assicuraFonti, fontiDi, tutteLeFonti } from "../src/api/catalogo-fonti.js";
import { improntaUrl, numeroInsegnaPubblico } from "../src/api/prezzi-magazzino.js";
import { scartiDi } from "../src/api/scarti.js";
import { verifyProductPage } from "../src/api/price-page.js";

const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const soloPaese = (arg("--paese") ?? "").toUpperCase();
/** Sotto questo lavoro residuo non vale la pena disturbare nessuno. */
const MINIMO = Number(arg("--minimo") ?? 5000);
const CAMPIONE = Number(arg("--campione") ?? 6);
const PAUSA = Number(arg("--pausa") ?? 3000);

const n = (v: number) => v.toLocaleString("it-IT");
const aspetta = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* Il catalogo si legge dal DISCO, non dal database: questo comando gira
   mentre i lettori lavorano, e chiedere ad Atlas cinquanta cataloghi mentre
   loro leggono vuol dire rubargli la banda che serve a salvare i prezzi. */
function dalDisco(paese: string, insegna: string): string[] | null {
  const base = `diario/cataloghi/${paese}-${insegna.replace(/[^\p{L}\p{N}]+/gu, "_")}`;
  try {
    if (!existsSync(`${base}.gz`)) return null;
    const fuori: string[] = [];
    for (let i = 0; ; i++) {
      const f = i === 0 ? `${base}.gz` : `${base}-${i + 1}.gz`;
      if (!existsSync(f)) break;
      for (const riga of gunzipSync(readFileSync(f)).toString("utf8").split("\n")) {
        const t = riga.indexOf("\t");
        if (t > 0) fuori.push(riga.slice(0, t));
      }
    }
    return fuori.length > 0 ? fuori : null;
  } catch {
    return null;
  }
}

await assicuraFonti();
const P = await prezzi();
const C = await cataloghi();

const elenco = (soloPaese ? fontiDi(soloPaese) : tutteLeFonti()).filter((f) => f.resa > 0);

console.log("");
console.log(`CHI RENDE DAVVERO · ${CAMPIONE} schede mai viste per insegna, una ogni ${PAUSA}ms`);
console.log("");

const buone: Array<{ chi: string; resta: number; quota: number }> = [];
const mute: Array<{ chi: string; resta: number }> = [];

for (const f of elenco) {
  const doc = (await C.findOne(
    { _id: `${f.paese}|${f.insegna}` } as never,
    { projection: { prodotti: 1 } },
  )) as { prodotti?: number } | null;
  if (!doc) continue;

  const url = dalDisco(f.paese, f.insegna);
  if (!url) continue;

  const c = numeroInsegnaPubblico(f.insegna);
  const quante = await P.countDocuments({ c } as never);
  const sc = await scartiDi(f.insegna, f.paese);
  /* Il conto grossolano basta a decidere se vale la pena aprire sei pagine. */
  const resta = Math.max(0, url.length - quante - sc.size);
  if (resta < MINIMO) continue;

  const viste =
    quante === 0
      ? new Set<string>()
      : new Set(
          ((await P.find({ c }, { projection: { _id: 1 } }).toArray()) as Array<{ _id: string }>).map(
            (x) => x._id,
          ),
        );

  const mv = url
    .filter((u) => {
      const i = improntaUrl(u);
      return !viste.has(i) && !sc.has(i);
    })
    .sort((a, b) => (improntaUrl(a) < improntaUrl(b) ? -1 : 1));

  if (mv.length === 0) continue;

  process.stdout.write(`  ${(f.paese + "|" + f.insegna).padEnd(28)} ${n(resta).padStart(7)} da fare · provo ...`);

  let ok = 0;
  const stati: string[] = [];
  const passo = Math.max(1, Math.floor(mv.length / CAMPIONE));
  for (let k = 0; k < CAMPIONE; k++) {
    const v = await verifyProductPage(mv[Math.min(k * passo, mv.length - 1)]);
    if (v.page?.current != null) ok++;
    else stati.push(v.status);
    await aspetta(PAUSA);
  }

  const quota = ok / CAMPIONE;
  console.log(
    `\r  ${(f.paese + "|" + f.insegna).padEnd(28)} ${n(resta).padStart(7)} da fare · ` +
      `${ok}/${CAMPIONE}${stati.length ? "  " + [...new Set(stati)].join(" ") : ""}`,
  );

  if (quota >= 0.5) buone.push({ chi: `${f.paese}|${f.insegna}`, resta, quota });
  else if (quota === 0) mute.push({ chi: `${f.paese}|${f.insegna}`, resta });
}

console.log("");
if (buone.length > 0) {
  const tot = buone.reduce((a, b) => a + Math.round(b.resta * b.quota), 0);
  console.log(`  RENDONO, aperte una per volta: ${buone.length} insegne, circa ${n(tot)} prodotti da prendere`);
  buone
    .sort((a, b) => b.resta * b.quota - a.resta * a.quota)
    .slice(0, 12)
    .forEach((b) => console.log(`    ${b.chi.padEnd(28)} ${n(b.resta).padStart(7)} × ${Math.round(b.quota * 100)}%`));
  console.log("");
  console.log("  Se una di queste nel lettore da' zero, il problema NON e' il negozio:");
  console.log("  guarda quante insegne della stessa piattaforma sta interrogando insieme,");
  console.log("  e con che pausa. Vedi il commento in testa a questo file.");
}
if (mute.length > 0) {
  console.log("");
  console.log(`  ZERO su ${CAMPIONE} anche cosi': ${mute.length} insegne`);
  mute.slice(0, 10).forEach((m) => console.log(`    ${m.chi.padEnd(28)} ${n(m.resta).padStart(7)} da fare`));
  console.log("  Qui il negozio il prezzo non lo pubblica, o non ci parla davvero.");
}
console.log("");
process.exit(0);
