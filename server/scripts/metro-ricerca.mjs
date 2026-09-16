/**
 * Il metro di misura della ricerca.
 *
 * Risponde alla domanda da cui dipende tutta la Fase 3: quanto ci perdiamo a
 * togliere il modello dalla strada dei prezzi?
 *
 * Oggi la risposta e' «non lo sappiamo». Si sa che su dieci voci classifica e
 * modello sceglievano cose diverse dieci volte su dieci, e che A OCCHIO in
 * sette casi la classifica sembrava migliore. A occhio. Quattordici secondi e
 * mezzo su diciassette dipendono da quella frase, e non si spegne un pezzo di
 * un prodotto sulla base di un'impressione.
 *
 * COSA CONFRONTA
 * --------------
 *   classifica   il primo che torna dalla ricerca, cosi' com'e'. Costa zero.
 *   modello      quello che il modello sceglie fra i candidati. Costa 14,6s.
 *
 * Le regole di cosa sia «giusto» stanno in `prove/ricerca.json`, scritte a
 * mano guardando i cataloghi veri. `prove/ricerca.md` spiega perche' sono
 * regole e non indirizzi: i cataloghi cambiano ogni giorno, e un elenco di
 * indirizzi misurerebbe quanto e' vecchio se stesso.
 *
 * Uso:
 *   npx tsx scripts/metro-ricerca.mjs
 *   npx tsx scripts/metro-ricerca.mjs --paese IT
 *   npx tsx scripts/metro-ricerca.mjs --senza-modello
 *   npx tsx scripts/metro-ricerca.mjs --sbagliate      solo quelle che falliscono
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const QUI = dirname(fileURLToPath(import.meta.url));
const PROVE = JSON.parse(readFileSync(join(QUI, "..", "prove", "ricerca.json"), "utf8"));

const arg = (nome) => {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? (process.argv[i + 1] ?? true) : null;
};
const soloPaese = arg("paese");
const senzaModello = process.argv.includes("--senza-modello");
const soloSbagliate = process.argv.includes("--sbagliate");

/** Come il catalogo scrive le cose: minuscolo, senza accenti. */
const piano = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Questo nome risponde alla voce?
 *
 * Tutte le `deve`, almeno una delle `unaDi`, nessuna delle `mai`. Le parole si
 * cercano come tronconi — `integral` prende `integrale`, `integrali`,
 * `integral bio` — cosi' una regola non va riscritta a ogni plurale.
 */
function giusto(nome, prova) {
  const n = piano(nome);
  if ((prova.deve ?? []).some((p) => !n.includes(piano(p)))) return false;
  if ((prova.unaDi ?? []).length && !prova.unaDi.some((p) => n.includes(piano(p)))) return false;
  if ((prova.mai ?? []).some((p) => n.includes(piano(p)))) return false;
  return true;
}

/** Perche' questo nome e' sbagliato: serve a chi legge il rapporto. */
function perche(nome, prova) {
  const n = piano(nome);
  const mancanti = (prova.deve ?? []).filter((p) => !n.includes(piano(p)));
  if (mancanti.length) return `manca «${mancanti.join(", ")}»`;
  if ((prova.unaDi ?? []).length && !prova.unaDi.some((p) => n.includes(piano(p)))) {
    return `nessuna di «${prova.unaDi.join(", ")}»`;
  }
  const trappola = (prova.mai ?? []).find((p) => n.includes(piano(p)));
  if (trappola) return `trappola «${trappola}»`;
  return "";
}

/**
 * Due servizi, non uno.
 *
 * Il confronto che conta e' fra «la stessa strada dei prezzi, col modello» e
 * «la stessa strada, senza». Una variabile sola. Il secondo servizio gira con
 * `SCELTA_MODELLO=no`, e tutto il resto — ricerca, magazzino, lettura delle
 * pagine, ordinamento per prezzo — e' identico.
 *
 * Un primo tentativo confrontava il primo per rilevanza con il piu' economico
 * fra gli approvati dal modello. Differivano per DUE cose, e il risultato non
 * diceva quale delle due contasse.
 */
const API = process.env.API ?? "http://localhost:3100";
const API_SENZA = process.env.API_SENZA ?? "http://localhost:3101";

async function post(rotta, corpo, base = API) {
  const r = await fetch(`${base}${rotta}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.CHIAVE ? { authorization: `Bearer ${process.env.CHIAVE}` } : {}),
    },
    body: JSON.stringify(corpo),
  });
  if (!r.ok) throw new Error(`${base}${rotta} ha risposto ${r.status}`);
  return r.json();
}

const CITTA = { IT: "Milano", GB: "London", DE: "München", ES: "Madrid", FR: "Paris" };
const VALUTA = { IT: "EUR", GB: "GBP", DE: "EUR", ES: "EUR", FR: "EUR" };

const totali = { classifica: 0, modello: 0, senza: 0, prove: 0, senzaCandidati: 0 };
const perPaese = [];

for (const [paese, prove] of Object.entries(PROVE)) {
  // Le chiavi che cominciano per `_` sono note per chi legge, non paesi.
  if (paese.startsWith("_") || !Array.isArray(prove)) continue;
  if (soloPaese && paese !== String(soloPaese).toUpperCase()) continue;

  const conto = { paese, prove: prove.length, classifica: 0, modello: 0, senza: 0, vuote: 0 };
  const sbagliate = [];

  /* TUTTA LA LISTA IN UNA CHIAMATA SOLA, come in produzione.
     Il modello riceve l'elenco intero e sceglie per tutte le voci insieme:
     provarlo una voce alla volta lo metterebbe in condizioni che non ha mai —
     senza il contesto delle altre voci — e costerebbe quaranta chiamate al
     posto di una. Misureremmo un modello diverso da quello che gira. */
  const sceltiDalModello = new Map();
  const sceltiSenzaModello = new Map();
  if (!senzaModello) {
    /* A gruppi di venti. La rotta ne accetta ventiquattro, ed e' un limite
       giusto: una lista della spesa vera non ha quaranta voci. Venti e' anche
       la lunghezza su cui il modello e' stato provato, quindi resta nelle sue
       condizioni abituali. */
    const GRUPPO = 20;
    for (let i = 0; i < prove.length; i += GRUPPO) {
      const pezzo = prove.slice(i, i + GRUPPO);
      const r = await post("/v1/prezzi", {
        items: pezzo.map((p) => p.voce),
        city: CITTA[paese] ?? "",
        country: paese,
        currency: VALUTA[paese] ?? "EUR",
        priceSource: "catalogo",
      });
      for (const v of r.voci ?? []) sceltiDalModello.set(v.voce, v.offerte?.[0]?.nome ?? null);

      const senza = await post(
        "/v1/prezzi",
        {
          items: pezzo.map((p) => p.voce),
          city: CITTA[paese] ?? "",
          country: paese,
          currency: VALUTA[paese] ?? "EUR",
          priceSource: "catalogo",
        },
        API_SENZA,
      );
      for (const v of senza.voci ?? []) sceltiSenzaModello.set(v.voce, v.offerte?.[0]?.nome ?? null);
    }
  }

  for (const prova of prove) {
    /* LA CLASSIFICA: il primo che torna dalla ricerca, senza nessun aiuto. */
    const { prodotti = [] } = await post("/v1/prodotti", {
      paese,
      q: prova.voce,
      quanti: 1,
    });
    const primo = prodotti[0]?.nome ?? null;
    const classificaOk = primo ? giusto(primo, prova) : false;
    if (classificaOk) conto.classifica++;
    if (!primo) conto.vuote++;

    /* IL MODELLO: quello che finisce davvero nella risposta dei prezzi, cioe'
       dopo che il modello ha scelto fra i candidati. */
    let scelto = null;
    let modelloOk = null;
    let sceltoSenza = null;
    let senzaOk = null;
    if (!senzaModello) {
      scelto = sceltiDalModello.get(prova.voce) ?? null;
      modelloOk = scelto ? giusto(scelto, prova) : false;
      if (modelloOk) conto.modello++;

      sceltoSenza = sceltiSenzaModello.get(prova.voce) ?? null;
      senzaOk = sceltoSenza ? giusto(sceltoSenza, prova) : false;
      if (senzaOk) conto.senza++;
    }

    if (!classificaOk || modelloOk === false || senzaOk === false) {
      sbagliate.push({
        voce: prova.voce, primo, scelto, sceltoSenza, prova, classificaOk, modelloOk, senzaOk,
      });
    }

    if (!soloSbagliate) {
      const segno = (ok) => (ok === null ? " " : ok ? "✓" : "✗");
      console.log(
        `  ${segno(classificaOk)}${segno(modelloOk)}  ${prova.voce.slice(0, 24).padEnd(26)}` +
          `${String(primo ?? "— niente —").slice(0, 40)}`,
      );
    }
  }

  if (sbagliate.length) {
    console.log(`\n  ── ${paese}: dove sbaglia ──`);
    for (const s of sbagliate) {
      console.log(`    ${s.voce}`);
      if (!s.classificaOk) {
        console.log(`       classifica  ${s.primo ?? "— niente —"}   ← ${s.primo ? perche(s.primo, s.prova) : "nessun candidato"}`);
      }
      if (s.senzaOk === false) {
        console.log(`       senza IA    ${s.sceltoSenza ?? "— niente —"}   ← ${s.sceltoSenza ? perche(s.sceltoSenza, s.prova) : "niente"}`);
      }
      if (s.modelloOk === false) {
        console.log(`       con IA      ${s.scelto ?? "— niente —"}   ← ${s.scelto ? perche(s.scelto, s.prova) : "non ha scelto"}`);
      }
    }
  }

  perPaese.push(conto);
  totali.prove += conto.prove;
  totali.classifica += conto.classifica;
  totali.modello += conto.modello;
  totali.senza += conto.senza;
  totali.senzaCandidati += conto.vuote;
  console.log("");
}

/* IL MODELLO HA DAVVERO RISPOSTO?
   La prima volta che questo confronto e' girato ha dato punteggi identici su
   tutte e ottanta le prove, errore per errore. Sembrava una scoperta: «il
   modello non serve a niente». Era invece che la quota Google era finita e il
   servizio «con IA» ripiegava sull'ordine del catalogo — cioe' faceva
   esattamente quel che fa l'altro.

   Un metro che in quel caso stampa una tabella e' peggio di un metro rotto: e'
   un metro che mente con convinzione. Quindi adesso guarda, e se il modello
   non ha risposto si rifiuta di confrontare. */
let modelloVivo = null;
if (!senzaModello) {
  try {
    const r = await fetch(`${API}/v1/stato`, {
      headers: process.env.CHIAVE ? { authorization: `Bearer ${process.env.CHIAVE}` } : {},
    });
    modelloVivo = (await r.json())?.ia?.funziona ?? null;
  } catch {
    modelloVivo = null;
  }
}

const pct = (n, su) => (su ? ((n / su) * 100).toFixed(0).padStart(3) + "%" : "  —");

console.log("═".repeat(72));
console.log("  paese   prove   sola ricerca    prezzi SENZA IA   prezzi CON IA");
console.log("─".repeat(72));
const riga = (nome, prove, a, b, c) =>
  `  ${String(nome).padEnd(8)}${String(prove).padStart(4)}   ` +
  `${String(a).padStart(4)} ${pct(a, prove)}       ` +
  (senzaModello ? "      —           —" : `${String(b).padStart(4)} ${pct(b, prove)}        ${String(c).padStart(4)} ${pct(c, prove)}`);

for (const c of perPaese) console.log(riga(c.paese, c.prove, c.classifica, c.senza, c.modello));
console.log("─".repeat(72));
console.log(riga("TOTALE", totali.prove, totali.classifica, totali.senza, totali.modello));

if (!senzaModello && modelloVivo === false) {
  console.log("");
  console.log("  ⚠  IL CONFRONTO NON VALE.");
  console.log("");
  console.log("  Il modello non ha risposto — quota finita, chiave rifiutata o rete.");
  console.log("  Vuol dire che anche il servizio «con IA» ha ripiegato sull'ordine");
  console.log("  del catalogo, cioe' ha fatto esattamente quel che fa l'altro: le");
  console.log("  due colonne a destra sono la stessa cosa, non un confronto.");
  console.log("");
  console.log("  Guarda `/v1/stato` per sapere perche', e rifai la misura quando");
  console.log("  il modello risponde. La colonna «sola ricerca» invece vale:");
  console.log("  non passa dal modello e non e' stata toccata.");
} else if (!senzaModello) {
  const differenza = totali.modello - totali.senza;
  console.log("");
  console.log("  Le due colonne a destra sono la STESSA strada dei prezzi: cambia");
  console.log("  solo se il modello sceglie fra i candidati o no. Una variabile.");
  console.log("");
  if (differenza > 0) {
    console.log(
      `  Con il modello se ne azzeccano ${differenza} in piu' su ${totali.prove}.
` +
        `  Costa 14,6 secondi su 17: ${(14.6 / differenza).toFixed(1)} secondi per ogni voce in piu'.`,
    );
  } else if (differenza < 0) {
    console.log(
      `  SENZA il modello se ne azzeccano ${-differenza} in piu' su ${totali.prove}, e gratis.
` +
        `  Non sta aiutando: sta scegliendo peggio, e ci mette 14,6 secondi su 17.`,
    );
  } else {
    console.log(
      "  Stesso punteggio esatto. Una delle due colonne costa 14,6 secondi" +
        "\n  su 17 e l'altra costa zero.",
    );
  }
}

if (totali.senzaCandidati) {
  console.log(
    `\n  ${totali.senzaCandidati} voci non hanno trovato NESSUN candidato:` +
      `\n  li' non e' la scelta a sbagliare, e' la ricerca che non pesca.`,
  );
}
console.log("");
