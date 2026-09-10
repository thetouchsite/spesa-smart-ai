/**
 * Il secondo flusso, misurato: prima la spesa, poi il menù.
 *
 * PERCHÉ ESISTE QUESTO FLUSSO
 * ---------------------------
 * Il cliente, in call, ha posto la domanda giusta: «e se costruissimo il menù
 * con quello che è davvero comprabile online?». Nel flusso normale succede il
 * contrario — il modello inventa sette giorni di pasti e poi si cercano i
 * prezzi di ciò che ha chiesto, e ciò che nessun negozio vende resta senza.
 *
 * Qui l'ordine è rovesciato:
 *
 *   1. LISTA      il modello propone la spesa della settimana
 *   2. PREZZI     si cercano, si aprono le pagine, si verifica
 *   3. MENÙ       i pasti nascono SOLO dai prodotti sopravvissuti
 *
 * Il numero che conta è quanti prodotti arrivano al passo 3: è la misura di
 * quanto piano resta in piedi quando si accetta solo ciò che si può comprare.
 *
 * Uso:  node scripts/prova-spesa-prima.mjs
 * Richiede il backend avviato.
 */

import { writeFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://localhost:3000";

const GIRI = [
  {
    etichetta: "Napoli",
    body: { city: "Napoli", country: "Italia", household: "4 persone", budget: 120,
      currency: "EUR", frequency: "weekly", style: "mediterraneo", allergies: [],
      dislikes: "funghi", language: "it", withRecipes: true },
  },
  {
    etichetta: "Atene",
    body: { city: "Athina", country: "Ελλάδα", household: "3 άτομα", budget: 110,
      currency: "EUR", frequency: "weekly", style: "μεσογειακή", allergies: [],
      dislikes: "", language: "el", withRecipes: true },
  },
  {
    etichetta: "Tokyo",
    body: { city: "東京", country: "日本", household: "3人", budget: 18000,
      currency: "JPY", frequency: "weekly", style: "和食", allergies: [],
      dislikes: "", language: "ja", withRecipes: true },
  },
  {
    etichetta: "Londra",
    body: { city: "London", country: "United Kingdom", household: "4 people", budget: 110,
      currency: "GBP", frequency: "weekly", style: "balanced", allergies: [],
      dislikes: "", language: "en", withRecipes: true },
  },
];

async function chiama(percorso, corpo, secondi = 180) {
  const t0 = Date.now();
  const res = await fetch(`${API}${percorso}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(secondi * 1000),
  });
  const testo = await res.text();
  const durata = (Date.now() - t0) / 1000;
  if (!res.ok) throw new Error(`${percorso} HTTP ${res.status}: ${testo.slice(0, 200)}`);
  return { dati: JSON.parse(testo), durata };
}

/**
 * Un prodotto è "comprabile" se ha un prezzo E un indirizzo dove andarlo a
 * prendere. Non pretende la verifica della pagina: un negozio che ci blocca
 * il server resta un negozio dove l'utente compra davvero.
 */
function comprabile(p) {
  const o = p.offerte?.[0];
  return Boolean(o && o.prezzo > 0 && (o.link || o.linkRicerca));
}

async function main() {
  const rapporto = [];

  // Senza argomenti li fa tutti; con argomenti solo quelli nominati, cosi' si
  // puo' rifare un singolo paese senza ripagare gli altri.
  const scelti = process.argv.slice(2).map((a) => a.toLowerCase());
  const daFare = scelti.length
    ? GIRI.filter((g) => scelti.includes(g.etichetta.toLowerCase()))
    : GIRI;

  for (const giro of daFare) {
    console.log("\n" + "═".repeat(64));
    console.log(`  ${giro.etichetta.toUpperCase()} — flusso SPESA PRIMA`);
    console.log("═".repeat(64));

    const riga = { paese: giro.etichetta };
    try {
      // ── 1. Lista ────────────────────────────────────────────────────
      const lista = await chiama("/ai/lista", giro.body);
      const voci = lista.dati.lista ?? [];
      riga.voci = voci.length;
      riga.secondiLista = Math.round(lista.durata);
      console.log(`\n1. LISTA  ${voci.length} voci in ${lista.durata.toFixed(0)}s`);
      for (const v of voci.slice(0, 6)) {
        console.log(`     · ${v.nome ?? v}${v.nomeLocale ? `  [${v.nomeLocale}]` : ""}`);
      }
      if (voci.length > 6) console.log(`     … e altre ${voci.length - 6}`);

      // ── 2. Prezzi ───────────────────────────────────────────────────
      const daCercare = voci.map((v) => v.nomeLocale || v.nome || String(v)).slice(0, 24);
      const prezzi = await chiama("/ai/prices", {
        items: daCercare,
        city: giro.body.city,
        country: giro.body.country,
        currency: giro.body.currency,
      });
      const prodotti = prezzi.dati.prodotti ?? [];
      const ok = prodotti.filter(comprabile);
      const tot = prezzi.dati.totali ?? {};
      const meta = prezzi.dati.meta ?? {};

      riga.secondiPrezzi = meta.secondiPrezzi;
      riga.costoUsd = meta.costoStimatoUsd;
      riga.conPrezzo = ok.length;
      riga.copertura = Math.round((ok.length / Math.max(1, daCercare.length)) * 100);
      riga.verificati = meta.prezziVerificati;
      riga.insegne = meta.insegneConfrontate;
      riga.totale = tot.spesaAlMiglioPrezzo;

      console.log(`\n2. PREZZI  ${meta.secondiPrezzi}s, $${meta.costoStimatoUsd}`);
      console.log(`     comprabili   ${ok.length}/${daCercare.length}  (${riga.copertura}%)`);
      console.log(`     verificati   ${meta.prezziVerificati}/${meta.prezziTotali} offerte`);
      console.log(`     insegne      ${meta.insegneConfrontate}`);
      console.log(`     totale       ${tot.spesaAlMiglioPrezzo} ${tot.valuta}`);
      for (const p of ok.slice(0, 6)) {
        const o = p.offerte[0];
        console.log(`     · ${String(p.prodotto).slice(0, 26).padEnd(28)} ${String(o.prezzo).padStart(7)} ${o.negozio}`);
      }

      if (ok.length === 0) {
        riga.esito = "nessun prodotto comprabile: il menù non si può costruire";
        console.log("\n3. MENÙ  saltato — niente da cui partire");
        rapporto.push(riga);
        continue;
      }

      // ── 3. Menù dai soli prodotti comprabili ────────────────────────
      const menu = await chiama("/ai/menu-da-prodotti", {
        ...giro.body,
        disponibili: ok.map((p) => p.prodotto),
      });
      const giorni = menu.dati.menu ?? [];
      riga.giorni = giorni.length;
      riga.secondiMenu = Math.round(menu.durata);

      // Il vincolo vero: il menù non deve contenere nulla fuori dalla spesa.
      const permessi = new Set(ok.map((p) => String(p.prodotto).toLowerCase()));
      const usati = new Set();
      let fuori = 0;
      for (const g of giorni) {
        for (const pasto of [g.colazione, g.pranzo, g.cena]) {
          for (const ing of pasto?.ingredienti ?? []) {
            const n = String(typeof ing === "string" ? ing : ing.nome ?? "").toLowerCase();
            if (!n) continue;
            const dentro = [...permessi].some((p) => n.includes(p) || p.includes(n));
            if (dentro) usati.add(n);
            else fuori++;
          }
        }
      }
      riga.ingredientiFuoriLista = fuori;
      riga.secondiTotali = riga.secondiLista + riga.secondiPrezzi + riga.secondiMenu;

      console.log(`\n3. MENÙ  ${giorni.length} giorni in ${menu.durata.toFixed(0)}s`);
      console.log(`     ingredienti fuori dalla spesa: ${fuori}`);
      for (const g of giorni.slice(0, 3)) {
        console.log(`     ${String(g.giorno).padEnd(12)} ${String(g.cena?.nome ?? g.cena ?? "").slice(0, 44)}`);
      }
      console.log(`\n   TOTALE ${riga.secondiTotali}s — $${riga.costoUsd}`);
      riga.esito = "ok";
    } catch (err) {
      riga.esito = String(err.message ?? err).slice(0, 160);
      console.log(`\n   FALLITO: ${riga.esito}`);
    }
    rapporto.push(riga);
  }

  console.log("\n" + "═".repeat(64));
  console.log("  RIEPILOGO — flusso spesa prima");
  console.log("═".repeat(64));
  for (const r of rapporto) {
    console.log(
      `${String(r.paese).padEnd(10)} voci ${String(r.voci ?? "-").padStart(3)}  ` +
        `comprabili ${String(r.conPrezzo ?? "-").padStart(3)} (${r.copertura ?? "-"}%)  ` +
        `giorni ${String(r.giorni ?? "-").padStart(2)}  ` +
        `fuori-lista ${String(r.ingredientiFuoriLista ?? "-").padStart(3)}  ` +
        `${String(r.secondiTotali ?? "-").padStart(3)}s  $${r.costoUsd ?? "-"}`,
    );
  }

  const suffisso = scelti.length ? "-" + scelti.join("-") : "";
  const dove = new URL(`../diario/spesa-prima${suffisso}.json`, import.meta.url);
  writeFileSync(dove, JSON.stringify(rapporto, null, 2), "utf8");
  console.log(`\nDettaglio in ${dove.pathname}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
