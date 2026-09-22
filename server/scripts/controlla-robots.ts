/**
 * Il `robots.txt` di un'insegna, letto prima di riattivarla.
 *
 * PERCHE' SI CONTROLLA OGNI VOLTA
 * -------------------------------
 * Perche' cambia, e cambia senza dirlo a nessuno. Un divieto dato per scontato
 * a marzo puo' essere sparito a settembre, e — molto piu' grave — un permesso
 * dato per scontato a marzo puo' essere diventato un divieto. Un'API che si
 * vende a un cliente non puo' poggiare su un ricordo: il cliente si prende la
 * diffida, non noi.
 *
 * COME SI LEGGE UNA REGOLA
 * ------------------------
 * Si guardano i blocchi `User-agent: *` — se un negozio ci volesse trattare
 * diversamente lo direbbe con un nome preciso, e noi non ne abbiamo uno. Fra
 * le regole che combaciano col percorso vince **la piu' lunga**, ed e' cosi'
 * che si risolvono le coppie del tipo:
 *
 *     Disallow: /prodotti/
 *     Allow: /prodotti/scheda/
 *
 * Il `*` vale qualsiasi cosa, il `$` ancora alla fine. A parita' di lunghezza
 * vince `Allow`: e' la regola di Google, ed e' quella prudente per chi scrive
 * il robots — se ha scritto tutte e due, intendeva permettere.
 *
 *   npx tsx --env-file-if-exists=.env scripts/controlla-robots.ts GB|Morrisons EE|"Barbora EE"
 *   npx tsx --env-file-if-exists=.env scripts/controlla-robots.ts            (tutte le orfane)
 */

import { gunzipSync } from "node:zlib";
import { cataloghi, fonti } from "../src/base/db.js";
import { leggiRegole, permesso } from "../src/base/robots.js";

const chiesti = process.argv.slice(2);
const col = await cataloghi();
const note = new Set<string>();
for (const f of await (await fonti()).find({}).project({ insegna: 1 }).toArray()) {
  note.add(String((f as { insegna?: string }).insegna ?? ""));
}

const elenco = chiesti.length
  ? await col.find({ _id: { $in: chiesti } }).toArray()
  : (await col.find({}).toArray()).filter(
      (c) => !note.has(String((c as unknown as { insegna: string }).insegna)),
    );

for (const c of elenco) {
  const x = c as unknown as { _id: string; prodotti: number; dati: { buffer: Buffer } };
  const righe = gunzipSync(Buffer.from(x.dati.buffer)).toString("utf8").split("\n").filter(Boolean);
  if (righe.length === 0) continue;

  const url = new URL(righe[Math.floor(righe.length / 2)].split("\t")[0]);
  try {
    const risposta = await fetch(`${url.origin}/robots.txt`, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MealMintBot/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!risposta.ok) {
      console.log(`${x._id.padEnd(22)} robots.txt risponde ${risposta.status} → nessun divieto scritto`);
      continue;
    }
    const regole = leggiRegole(await risposta.text());
    const esito = permesso(regole, url.pathname);
    console.log(
      `${x._id.padEnd(22)} ${esito.ok ? "PERMESSO" : "VIETATO "} · ${esito.regola} · ${url.pathname.slice(0, 44)}`,
    );
  } catch (err) {
    console.log(
      `${x._id.padEnd(22)} robots.txt non raggiungibile: ${err instanceof Error ? err.message : err}`,
    );
  }
}
process.exit(0);
