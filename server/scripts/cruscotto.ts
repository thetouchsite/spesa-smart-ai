/**
 * Il cruscotto, generato dal database invece che scritto a mano.
 *
 * PERCHE'
 * -------
 * La prima versione era una pagina HTML scritta a mano, e i suoi numeri
 * venivano dal campo `stimati` di `catalogo-fonti.ts`. Erano conteggi vecchi:
 * mostrava 1.902.334 prodotti dove il database ne serve 1.716.324, e contava
 * 80.000 articoli di Carrefour Brasile che oggi sono ZERO.
 *
 * Un cruscotto che riporta stime non e' un cruscotto: e' un promemoria di cosa
 * credevamo. Questo legge i due magazzini e basta.
 *
 * LE DUE COLONNE NON SI SOMMANO, E VA CAPITO
 * ------------------------------------------
 *   LINK    quanti prodotti sappiamo che esistono e dove. Valgono 30 ore.
 *   PREZZI  quanti di quegli indirizzi hanno una cifra letta e ancora valida.
 *           Valgono 24 ore.
 *
 * Un catalogo pieno e un magazzino prezzi vuoto non e' mezzo servizio: e'
 * un'app che apre le pagine dal vivo mentre l'utente aspetta. Al 16 settembre
 * 2026 e' esattamente la situazione — 1.716.324 link e 1.297 prezzi.
 *
 * Uso:
 *   npx tsx --env-file-if-exists=.env scripts/quadro-db.ts   (prima: raccoglie)
 *   npx tsx scripts/cruscotto.ts [uscita.html]               (poi: disegna)
 */

import { readFileSync, writeFileSync } from "node:fs";


interface RigaPaese {
  paese: string;
  insegneInElenco: number;
  insegneNelDb: number;
  link: number;
  linkFreschi: number;
  prezzi: number;
  prezziConCifra: number;
}

interface Quadro {
  quando: string;
  totale: { link: number; freschi: number; prezzi: number; cifre: number };
  stimati: number;
  orfane: number;
  orfaneLink: number;
  paesi: RigaPaese[];
  insegneInElenco: number;
  mute: Array<{ paese: string; insegna: string; stimati: number }>;
  tuttoMuto: string[];
  fuori: Array<{ paese: string; insegna: string; stimati: number; esclusa: string }>;
}

const q: Quadro = JSON.parse(readFileSync("diario/quadro-db.json", "utf8"));
const uscita = process.argv[2] ?? "diario/cruscotto.html";

/* `toLocaleString` italiano non mette il punto sotto le cinquemila: 1297
   invece di 1.297. In una tabella di numeri allineati stona, e soprattutto
   fa sembrare piu' grande un numero piccolo. Si raggruppa a mano. */
const n = (x: number) =>
  String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* Tutto viene dal quadro: questo file disegna e basta. Un disegnatore che
   interroga il database per conto suo puo' mostrare numeri diversi da quelli
   che ha in cima alla pagina, ed e' successo. */
const mute = q.mute;
const fuori = q.fuori;

/**
 * DUE MODI DIVERSI DI STARE AL BUIO, E VANNO SEPARATI.
 *
 * Un paese senza prezzi puo' esserlo per due ragioni opposte, e confonderle
 * fa sbagliare la mossa successiva:
 *
 *   NON ANCORA PREZZATO    ha insegne che il prezzo lo pubblicano, e basta
 *                          farci girare il notturno. Costa tempo macchina.
 *   NESSUNA INSEGNA RENDE  tutte le sue fonti hanno `resa: 0`. Qui il
 *                          notturno non puo' fare niente: servono insegne
 *                          nuove, o un lettore per la loro API.
 *
 * Misurato: sette paesi sono del secondo tipo — Bosnia, Belgio, Canada,
 * India, Corea, Serbia, Stati Uniti — per 126.742 indirizzi. In Belgio sono
 * mute tutte e quattro le insegne: 267 candidati saltati, zero pagine da
 * aprire.
 */
const tuttoMuto = new Set(q.tuttoMuto);

/** Paesi con il catalogo e nessun prezzo: e' il buco che conta. */
const alBuio = q.paesi.filter((r) => r.prezzi === 0 && r.link > 0).sort((a, b) => b.link - a.link);
const linkAlBuio = alBuio.reduce((a, r) => a + r.link, 0);

/* LA RESA VERA, CONTATA SU QUEL CHE ABBIAMO APERTO DAVVERO.
   Questa pagina prometteva «99,9% con prezzo», un numero scritto a mano mesi
   fa su un campione fortunato. Misurato su novecentomila schede: 64%. Una
   promessa del genere in cima al cruscotto fa aspettare tre milioni di
   prodotti da un catalogo che ne dara' ottocentomila. */
const resaVera = q.totale.prezzi > 0 ? Math.round((q.totale.cifre / q.totale.prezzi) * 100) : 0;
const apertiQuota = q.totale.link > 0 ? Math.round((q.totale.prezzi / q.totale.link) * 100) : 0;

/* Dove si arriva a lavoro finito: i prodotti di oggi piu' quelli che ci si
   aspetta dagli indirizzi mai aperti, alla resa misurata. E' una proiezione e
   va detto che lo e' — ma una proiezione onesta vale piu' di un totale di
   indirizzi che nessuno leggera' mai come tale. */
const tetto = q.totale.cifre + Math.round((q.totale.link - q.totale.prezzi) * (resaVera / 100));

const quando = new Date(q.quando).toLocaleString("it-IT", {
  day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
});

const barra = (parte: number, tutto: number) =>
  tutto === 0 ? 0 : Math.max(1, Math.round((parte / tutto) * 100));

const righeTabella = q.paesi
  .map((r) => {
    const conPrezzo = r.prezziConCifra;
    const larg = barra(r.link, q.paesi[0].link);
    const classe = conPrezzo === 0 ? " zero" : conPrezzo < 100 ? " bassa" : "";
    return `    <div class="riga">
      <span class="sigla">${esc(r.paese)}</span>
      <span class="barra"><i style="width:${larg}%"></i></span>
      <span class="cifra-r">${n(r.link)}</span>
      <span class="quota${classe}">${conPrezzo === 0 ? "—" : n(conPrezzo)}</span>
    </div>`;
  })
  .join("\n");

const righeBuio = alBuio
  .slice(0, 16)
  .map(
    (r) =>
      `    <li><b>${esc(r.paese)}</b> &mdash; ${n(r.link)} link, ` +
      (tuttoMuto.has(r.paese)
        ? "<b>nessuna insegna pubblica il prezzo</b>"
        : "non ancora prezzato") +
      "</li>",
  )
  .join("\n");

const html = `<title>Cruscotto dati MealMint</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
  :root {
    --fondo: #F4F6F3; --piano: #FFFFFF; --incavo: #EDF0EB;
    --inch: #16211B; --inch-tenue: #5A6862; --inch-lieve: #8B978F;
    --filo: #DCE2DA;
    --verde: #17724A; --verde-tenue: #E2EFE7;
    --ambra: #9A6206; --ambra-tenue: #FAEFD9;
    --rosso: #97291E; --rosso-tenue: #F8E3E0;
    --sans: "IBM Plex Sans", system-ui, sans-serif;
    --titolo: "Space Grotesk", var(--sans);
    --mono: "IBM Plex Mono", ui-monospace, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --fondo: #0E1311; --piano: #161C19; --incavo: #1B221E;
      --inch: #E6EBE7; --inch-tenue: #97A39C; --inch-lieve: #6B776F;
      --filo: #262E29; --verde: #4FBF89; --verde-tenue: #15291F;
      --ambra: #D8A252; --ambra-tenue: #2A2315;
      --rosso: #E08C7E; --rosso-tenue: #2C1B18;
    }
  }
  :root[data-theme="dark"] {
    --fondo: #0E1311; --piano: #161C19; --incavo: #1B221E;
    --inch: #E6EBE7; --inch-tenue: #97A39C; --inch-lieve: #6B776F;
    --filo: #262E29; --verde: #4FBF89; --verde-tenue: #15291F;
    --ambra: #D8A252; --ambra-tenue: #2A2315;
    --rosso: #E08C7E; --rosso-tenue: #2C1B18;
  }
  * { box-sizing: border-box; }
  body {
    background: var(--fondo); color: var(--inch);
    font-family: var(--sans); font-size: 15px; line-height: 1.55;
    padding-block: 32px 72px; padding-left: 18px; padding-right: 18px;
  }
  .foglio { max-width: 1000px; margin: 0 auto; }
  .testa { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px; margin-bottom: 4px; }
  h1 { font-family: var(--titolo); font-size: clamp(24px, 4vw, 32px); font-weight: 700; letter-spacing: -.02em; margin: 0; }
  .chi { font-family: var(--mono); font-size: 12px; color: var(--verde); background: var(--verde-tenue); padding: 3px 9px; border-radius: 5px; font-weight: 600; }
  .quando { font-family: var(--mono); font-size: 11.5px; color: var(--inch-lieve); }
  .intro { color: var(--inch-tenue); margin: 10px 0 0; max-width: 64ch; }
  h2 { font-family: var(--titolo); font-size: 13px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; color: var(--inch-tenue); margin: 44px 0 14px; padding-bottom: 7px; border-bottom: 1px solid var(--filo); }
  .allarme { background: var(--rosso-tenue); border-left: 3px solid var(--rosso); border-radius: 0 8px 8px 0; padding: 16px 18px; margin: 22px 0 0; }
  .allarme b { color: var(--rosso); }
  .allarme p { margin: 0 0 8px; } .allarme p:last-child { margin: 0; }
  .avviso { background: var(--ambra-tenue); border-left: 3px solid var(--ambra); border-radius: 0 8px 8px 0; padding: 16px 18px; margin: 18px 0 0; }
  .avviso b { color: var(--ambra); }
  .avviso p { margin: 0; }
  .cifre { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--filo); border: 1px solid var(--filo); border-radius: 9px; overflow: hidden; margin: 20px 0; }
  .cifra { background: var(--piano); padding: 14px 16px; }
  .cifra b { display: block; font-family: var(--titolo); font-size: 24px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .cifra span { display: block; font-size: 11px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: var(--inch-lieve); margin-top: 4px; }
  .cifra.ok b { color: var(--verde); }
  .cifra.male b { color: var(--rosso); }
  .paesi { background: var(--piano); border: 1px solid var(--filo); border-radius: 9px; overflow: hidden; }
  .riga { display: grid; grid-template-columns: 46px 1fr 104px 92px; gap: 12px; align-items: center; padding: 8px 16px; border-bottom: 1px solid var(--filo); }
  .riga:last-child { border-bottom: none; }
  .riga.intestazione { background: var(--incavo); font-size: 10.5px; font-weight: 600; letter-spacing: .07em; text-transform: uppercase; color: var(--inch-lieve); }
  .sigla { font-family: var(--mono); font-weight: 600; font-size: 13px; }
  .barra { height: 8px; border-radius: 5px; background: var(--incavo); overflow: hidden; }
  .barra i { display: block; height: 100%; background: var(--verde); border-radius: 5px; }
  .cifra-r { font-family: var(--mono); font-size: 12.5px; text-align: right; font-variant-numeric: tabular-nums; color: var(--inch-tenue); }
  .quota { font-family: var(--mono); font-size: 12.5px; text-align: right; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--verde); }
  .quota.bassa { color: var(--ambra); }
  .quota.zero { color: var(--rosso); }
  .nota { font-size: 13.5px; color: var(--inch-tenue); border-left: 2px solid var(--filo); padding-left: 13px; margin: 16px 0 0; }
  .nota b { color: var(--inch); }
  ul.semplice { list-style: none; padding: 0; margin: 12px 0 0; columns: 2; column-gap: 28px; }
  ul.semplice li { padding: 5px 0 5px 18px; position: relative; font-size: 14px; break-inside: avoid; }
  ul.semplice li::before { content: ""; position: absolute; left: 3px; top: 13px; width: 5px; height: 5px; border-radius: 50%; background: var(--rosso); }
  .pie { margin-top: 48px; padding-top: 16px; border-top: 1px solid var(--filo); font-size: 12.5px; color: var(--inch-lieve); }
  .pie code { font-family: var(--mono); }
  @media (max-width: 620px) {
    .riga { grid-template-columns: 38px 1fr 76px 66px; }
    ul.semplice { columns: 1; }
  }
</style>

<div class="foglio">

  <div class="testa">
    <h1>Cruscotto dati</h1>
    <span class="chi">OPERATORE A &middot; ANTONIO</span>
  </div>
  <p class="quando">${esc(quando)} &middot; LETTO DAL DATABASE, NON DALLE STIME</p>
  <p class="intro">Questa pagina la genera <code>scripts/cruscotto.ts</code> leggendo i due magazzini su Mongo. La versione precedente sommava il campo <code>stimati</code> di un file scritto a mano, e mostrava ${n(q.stimati)} prodotti dove il database ne serve ${n(q.totale.link)}.</p>

  <div class="avviso">
    <p><b>Un indirizzo non &egrave; un prodotto con prezzo.</b> Gli indirizzi dicono dove guardare; li danno le sitemap dei negozi e costano niente. Il prezzo si ha solo dopo aver aperto quella pagina, e non tutte ce l&#39;hanno: parecchie catene lo disegnano con JavaScript, e nell&#39;HTML non c&#39;&egrave; niente da leggere. <b>Su quel che abbiamo aperto finora, il ${resaVera}% aveva un prezzo.</b></p>
    <p>Per questo qui sotto ci sono tre numeri e non uno. Confonderli &egrave; il modo piu&#39; rapido di credersi al triplo di dove si &egrave;.</p>
  </div>

  <div class="cifre">
    <div class="cifra"><b>${n(q.totale.link)}</b><span>indirizzi da aprire</span></div>
    <div class="cifra ok"><b>${n(q.totale.cifre)}</b><span>prodotti con prezzo</span></div>
    <div class="cifra"><b>${n(q.totale.vendibili)}</b><span>vendibili adesso</span></div>
    <div class="cifra"><b>${q.paesi.length}</b><span>paesi</span></div>
    <div class="cifra"><b>${q.insegneInElenco}</b><span>insegne</span></div>
    <div class="cifra ${apertiQuota >= 60 ? "ok" : "male"}"><b>${apertiQuota}%</b><span>catalogo aperto</span></div>
  </div>

  <p class="nota"><b>Il tetto, per non aspettarsi quel che non pu&ograve; arrivare.</b>
  Restano ${n(q.totale.link - q.totale.prezzi)} indirizzi mai aperti. Alla resa misurata, a lavoro finito si arriva
  intorno ai <b>${n(tetto)} prodotti con prezzo</b> — non ai milioni che il numero degli indirizzi lascerebbe sperare.
  Per salire oltre servono insegne nuove che il prezzo lo pubblichino, non altre letture di queste.</p>

  <p class="nota"><b>Come leggere le cinque cifre qui sopra.</b>
  <b>Link servibili</b>: indirizzi di prodotto salvati, di insegne ancora in elenco — quel che l&#39;API pu&ograve; dare subito.
  <b>Insegne in elenco</b>: le catene attive nella collezione <code>fonti</code> su Mongo.
  <b>Prezzi validi</b>: indirizzi con una cifra letta nelle ultime <b>settantadue</b> ore.
  <b>Paesi senza prezzi</b>: hanno il catalogo e nessuna cifra.</p>

  <h2>Paese per paese, dal database</h2>
  <p class="nota"><b>Due numeri per riga, e non si sommano.</b>
  <b>Link salvati</b> sono gli indirizzi di prodotto che il magazzino conosce: l&#39;API li serve senza aprire una pagina. Valgono trenta ore e li riscrive il lavoro notturno.
  <b>Con prezzo</b> sono quanti di quegli indirizzi hanno una cifra letta e ancora valida: valgono settantadue ore, poi la riga resta ma non si mostra e la pagina si riapre. Tre giorni, non uno: un magazzino che si svuota ogni giorno non pu&ograve; essere pi&ugrave; grande di quanto riesci a riempirlo in un giorno.
  La barra dice solo quanto pesa quel paese rispetto al piu&#39; grande.</p>
  <div class="paesi">
    <div class="riga intestazione"><span>Paese</span><span>quanto pesa</span><span>link salvati</span><span>con prezzo</span></div>
${righeTabella}
  </div>

  <h2>I paesi al buio</h2>
  <p class="nota">Catalogo salvato e fresco, zero prezzi: ${n(linkAlBuio)} indirizzi che l&#39;API conosce e non sa quotare. <b>Ma sono due problemi diversi.</b> Dove c&#39;&egrave; scritto &laquo;non ancora prezzato&raquo; basta far girare il lavoro notturno. Dove nessuna insegna pubblica il prezzo il notturno non pu&ograve; farci niente: servono insegne nuove o un lettore per la loro API. Sono ${tuttoMuto.size} paesi, ${n(alBuio.filter((r) => tuttoMuto.has(r.paese)).reduce((a, r) => a + r.link, 0))} indirizzi.</p>
  <ul class="semplice">
${righeBuio}
  </ul>

  <div class="avviso">
    <p><b>La causa non &egrave; la copertura: sono le liste della spesa.</b> Il lavoro notturno prezza le voci della spesa di base, e quelle liste esistono scritte a mano per sei paesi. Da stanotte, dove mancano si ricavano dal dizionario di <code>vocabolario.ts</code> &mdash; che copre sei lingue mappate su ventidue paesi. Restano fuori Lituania, Estonia, Danimarca, Polonia, Olanda, Norvegia, Romania, Croazia, Svezia, Bulgaria e Grecia: il dizionario le loro lingue non le conosce.</p>
  </div>

  <h2>Quel che non torna fra elenco e database</h2>
  <div class="cifre">
    <div class="cifra"><b>${n(q.stimati)}</b><span>stimato nel file</span></div>
    <div class="cifra ok"><b>${n(q.totale.link)}</b><span>servibile davvero</span></div>
    <div class="cifra male"><b>${n(q.stimati - q.totale.link)}</b><span>di scarto</span></div>
    <div class="cifra"><b>${q.orfane}</b><span>insegne orfane</span></div>
  </div>
  <p class="nota"><b>Le orfane sono insegne tolte dall&#39;elenco e mai cancellate dal magazzino</b> — ${n(q.orfaneLink)} indirizzi che il catalogo non chiedera&#39; mai. La chiave del magazzino &egrave; <code>PAESE|Insegna</code>, quindi anche solo rinominare un&#39;insegna ne abbandona il catalogo salvato: &laquo;Iperal&raquo; diventato &laquo;Iperal Spesa Online&raquo; ha lasciato indietro 23.371 indirizzi. Stanotte ne sono state cancellate 14 &mdash; generalisti, vestiti, cibo per animali, drogherie &mdash; per 439.659 indirizzi.</p>

  <h2>Insegne senza prezzo leggibile</h2>
  <p class="nota">${mute.length} insegne in elenco hanno <code>resa: 0</code>: le pagine si aprono, il prezzo non c&#39;&egrave;. Restano nel catalogo perch&eacute; un nome e un link valgono anche senza prezzo, ma <b>il lavoro notturno non le apre pi&ugrave;</b> &mdash; misurato: 684 pagine risparmiate su otto paesi.</p>
  <p class="nota">Altre ${fuori.length} sono uscite del tutto, per ${n(fuori.reduce((a, f) => a + f.stimati, 0))} prodotti: CoopShop, Esselunga, Al&igrave;, Tigros e Basko vogliono che uno acceda. Stanno in <code>SENZA_PREZZO</code> con accanto il motivo, per non rifare quel lavoro fra sei mesi.</p>

  <p class="pie">
    Generato da <code>scripts/cruscotto.ts</code> a partire da <code>diario/quadro-db.json</code>, che scrive <code>scripts/quadro-db.ts</code> leggendo Mongo.
    Per rifarlo: <code>npx tsx --env-file-if-exists=.env scripts/quadro-db.ts &amp;&amp; npx tsx scripts/cruscotto.ts</code>.
    Le regole del lavoro stanno in <code>LAVORO-DIVISO.md</code>.
  </p>

</div>
`;

writeFileSync(uscita, html, "utf8");
console.log(`cruscotto scritto in ${uscita} (${(html.length / 1024).toFixed(0)} KB)`);
console.log(`  ${n(q.totale.link)} link servibili · ${n(q.totale.cifre)} prezzi validi · ${alBuio.length} paesi al buio`);
