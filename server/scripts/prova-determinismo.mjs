/**
 * La stessa spesa, due volte, senza cache: viene identica?
 *
 * E' il criterio 3 del goal. Un'API di dati che a due chiamate uguali risponde
 * in due modi non e' un'API: e' un oracolo.
 *
 * LA CACHE VA TOLTA DI MEZZO, se no si misura lei. La risposta viene salvata
 * su Mongo e la seconda chiamata la rilegge: sarebbe identica per forza, e non
 * direbbe niente sul motore. Quindi fra un giro e l'altro si cancella la voce
 * di cache e si rifa' il lavoro da capo.
 *
 * COSA SI CONFRONTA, E COSA NO. Il campo `letto` dice quando una pagina e'
 * stata guardata, e se nel frattempo il magazzino ne rilegge una quel numero
 * cambia — legittimamente. Si confronta tutto il resto: quali prodotti, di
 * quali insegne, a quale prezzo, con quali link.
 *
 * Uso:  CHIAVE=sk_live_... npx tsx scripts/prova-determinismo.mjs
 */

const API = process.env.API ?? "http://localhost:3101";
const CHIAVE = process.env.CHIAVE;

const LISTA = {
  items: [
    "Latte intero", "Pasta integrale", "Zucchine", "Pomodorini",
    "Uova", "Burro", "Riso", "Caffe", "Mele", "Pane integrale",
  ],
  city: "Milano",
  country: "IT",
  currency: "EUR",
  priceSource: "catalogo",
};

const { cache, closeDb } = await import("../src/base/db.js");

async function chiedi() {
  const r = await fetch(`${API}/v1/prezzi`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${CHIAVE}` },
    body: JSON.stringify(LISTA),
  });
  if (!r.ok) throw new Error(`/v1/prezzi ha risposto ${r.status}`);
  return r.json();
}

/** Toglie cio' che puo' cambiare legittimamente fra due letture. */
function confrontabile(r) {
  return JSON.stringify(
    {
      voci: (r.voci ?? []).map((v) => ({
        voce: v.voce,
        esito: v.esito,
        offerte: (v.offerte ?? []).map((o) => ({
          insegna: o.insegna,
          nome: o.nome,
          prezzo: o.prezzo,
          valuta: o.valuta,
          link: o.link,
        })),
      })),
      copertura: r.copertura,
      riepilogo: r.riepilogo,
    },
    null,
    1,
  );
}

/**
 * Toglie dalla cache SOLO quello che ha creato questa prova.
 *
 * Il database e' lo stesso di produzione. Svuotare tutte le risposte prezzi
 * per misurare noi vorrebbe dire far ripagare a chi usa l'app il lavoro gia'
 * fatto — e sarebbe successo, perche' la prima versione di questo script
 * cancellava tutto quello che cominciava per «prices:».
 *
 * Si cancella per data: solo le voci nate dopo che questa prova e' partita.
 */
const PARTITA = new Date();

async function svuotaLaCache() {
  const c = await cache();
  const n = await c.deleteMany({
    _id: { $regex: "^prices:" },
    createdAt: { $gte: PARTITA },
  });
  return n.deletedCount ?? 0;
}

console.log("  Dieci voci, Milano. Due giri, con la cache svuotata in mezzo.\n");

await svuotaLaCache();
const uno = await chiedi();
console.log(`  giro 1:  ${uno.riepilogo.trovate}/${uno.riepilogo.chieste} trovate, ${uno.secondi}s`);

const tolte = await svuotaLaCache();
console.log(`           (${tolte} risposte tolte dalla cache)`);

const due = await chiedi();
console.log(`  giro 2:  ${due.riepilogo.trovate}/${due.riepilogo.chieste} trovate, ${due.secondi}s`);

const a = confrontabile(uno);
const b = confrontabile(due);

console.log("");
if (a === b) {
  console.log("  ✓ IDENTICHE — stessi prodotti, stesse insegne, stessi prezzi, stessi link.");
} else {
  console.log("  ✗ DIVERSE. Le prime differenze:\n");
  const ra = a.split("\n");
  const rb = b.split("\n");
  let mostrate = 0;
  for (let i = 0; i < Math.max(ra.length, rb.length) && mostrate < 12; i++) {
    if (ra[i] !== rb[i]) {
      console.log(`    riga ${i}`);
      console.log(`      1: ${(ra[i] ?? "—").trim()}`);
      console.log(`      2: ${(rb[i] ?? "—").trim()}`);
      mostrate++;
    }
  }
}

await closeDb();
