/**
 * Il pannello: una pagina sola che dice cosa sta succedendo, adesso.
 *
 * PERCHE' ESISTE
 * --------------
 * I numeri c'erano gia' tutti, sparsi: `/catalogo/stato` li da' in JSON, e per
 * il resto bisognava lanciare `quadro-db.ts` a mano, poi `cruscotto.ts`, poi
 * ripubblicare l'artefatto. Tre comandi ogni tre minuti per guardare una cosa
 * che cambia da sola.
 *
 * Questa pagina li legge da sé e si aggiorna ogni cinque secondi.
 *
 * QUELLO CHE AGGIUNGE DAVVERO
 * ---------------------------
 * Non e' il riassunto: e' il BATTITO. Il magazzino dice quanti prezzi ci sono,
 * ma non se qualcuno li sta ancora raccogliendo — un magazzino fermo e uno che
 * cresce hanno lo stesso aspetto se guardi solo il totale. Il registro dei giri dice chi
 * sta lavorando, da quale macchina, da quanto, e a che ritmo.
 *
 * E lo dice anche quando il lettore gira ALTROVE: PC di casa, un VPS, Render.
 * Passa tutto dal database, che e' l'unica cosa che le macchine condividono.
 *
 * PERCHE' NON TIENE SVEGLIO NIENTE
 * --------------------------------
 * Una pagina aperta nel browser chiama il server ogni cinque secondi, quindi
 * finche' la guardi il servizio non si addormenta. Ma di notte il browser e'
 * chiuso, e quello e' esattamente il momento in cui il lettore lavora. Tenere
 * sveglio Render e' il mestiere di `.github/workflows/tieni-sveglio.yml`, che
 * gira su GitHub e non ha bisogno che nessuno guardi niente.
 */

import { chiStaLavorando, giriPassati } from "./giri.js";
import { comandi, isDbConfigured } from "../base/db.js";
import { giroContinuo } from "./prezzi-continuo.js";
import { assicuraFonti } from "./catalogo-fonti.js";
import { contiPesanti } from "./statistiche.js";
import { statoMagazzino } from "./prezzi-magazzino.js";
import { statoCataloghi } from "./catalogo-magazzino.js";
import { statoCatalogo } from "./catalogo.js";
import { statoFonti, paesiConCatalogo } from "./catalogo-fonti.js";

export async function datiPannello() {
  const [vivi, passati, prezzi, cataloghi] = await Promise.all([
    chiStaLavorando(),
    giriPassati(10),
    statoMagazzino(),
    statoCataloghi(),
  ]);
  return {
    adesso: new Date().toISOString(),
    vivi,
    passati,
    prezzi,
    cataloghi,
    memoria: statoCatalogo(),
    fonti: statoFonti(),
    /* `quantiPaesi` e non `paesi`: i conti pesanti portano gia' un `paesi` che
       e' l'elenco riga per riga, e due campi con lo stesso nome fanno sparire
       quello che arriva prima senza dire niente. */
    quantiPaesi: paesiConCatalogo().length,
    ...contiPesanti(),
  };
}

/**
 * Quanto dura un giro lanciato a mano, e quanti paesi tocca.
 *
 * Un'ora e non tutta la notte: un giro lanciato da un pulsante e' quasi sempre
 * una prova, e uno da otto ore lanciato per sbaglio si ferma solo sapendo dove
 * sta il pulsante per fermarlo. Il lavoro lungo lo fa il programma notturno,
 * che parte da solo.
 */
const MINUTI_A_MANO = Number(process.env.PANNELLO_MINUTI ?? 60);

/**
 * Quanti paesi tocca un giro lanciato a mano.
 *
 * Non tutti e trentotto. Montare la coda vuol dire leggere e decomprimere il
 * catalogo di ogni paese, e su un piano da mezzo giga farlo per trentotto paesi
 * insieme e' il modo piu' rapido di farsi uccidere dal sistema prima di aver
 * aperto una sola pagina. E' successo: «Partito», poi silenzio.
 *
 * Dodici alla volta bastano a tenere i lavoratori occupati — sono comunque
 * dodici negozi diversi a ogni istante — e il giro successivo riparte dai paesi
 * dopo, perche' l'ordine ruota a ogni avvio.
 */
const PAESI_A_MANO = Number(process.env.PANNELLO_PAESI ?? 12);

/* Da dove ricominciare il prossimo giro. Senza, un pulsante premuto dieci volte
   rifarebbe dieci volte i primi dodici paesi e gli altri ventisei non li
   vedrebbe mai nessuno. */
let daQualePaese = 0;

/* Un giro alla volta per processo. Due giri sullo stesso server non vanno due
   volte piu' veloci: si dividono la stessa rete e la stessa memoria, e su un
   piano da mezzo giga la memoria e' gia' il vincolo. */
let giroInCorsoQui = false;

/**
 * Avvia la lettura QUI, nel processo che serve questa pagina.
 *
 * PERCHE' AVVIARE E FERMARE NON SI SOMIGLIANO
 * -------------------------------------------
 * Fermare e' un biglietto sul database, e funziona ovunque sia il lettore.
 * Avviare no: un biglietto lo puo' leggere solo un processo che gia' gira. Per
 * questo `avvia` non lascia nessun ordine — fa partire il giro dentro il
 * server che ha ricevuto la richiesta.
 *
 * Il che vuol dire: il pulsante accende il lettore DOVE STA IL PANNELLO. Su
 * Render accende Render. Sul PC di casa non accende niente, perche' li' il
 * server non gira.
 */
export async function avviaQui(chiave: string): Promise<string> {
  const attesa = process.env.PANNELLO_CHIAVE;
  if (!attesa) return "I comandi sono spenti: manca PANNELLO_CHIAVE fra le variabili.";
  if (chiave !== attesa) return "Parola d'ordine sbagliata.";
  if (giroInCorsoQui) return "Un giro e' gia' in corso su questa macchina.";

  const quante = await assicuraFonti();
  if (quante === 0) return "Nessuna insegna sul database: non c'e' niente da leggere.";

  /* Si ruota: ogni avvio riparte da dove aveva smesso il precedente. */
  const tutti = paesiConCatalogo();
  const scelti: string[] = [];
  for (let i = 0; i < Math.min(PAESI_A_MANO, tutti.length); i++) {
    scelti.push(tutti[(daQualePaese + i) % tutti.length]);
  }
  daQualePaese = (daQualePaese + scelti.length) % Math.max(1, tutti.length);

  giroInCorsoQui = true;

  /* NON si aspetta la fine: un giro dura un'ora e la richiesta scadrebbe molto
     prima. Si risponde subito «e' partito», e il pannello lo vede comparire fra
     i vivi al battito successivo — che e' anche la conferma che e' vero.
     
     E si parte con `setTimeout` e non chiamando direttamente: il corpo di una
     funzione asincrona comincia SUBITO, e prima del primo `await` il giro
     costruisce la coda decomprimendo i cataloghi con `gunzipSync`, che e'
     sincrono. Su trentotto paesi sono decine di secondi in cui il processo non
     risponde a nessuno — compresa la richiesta che ha appena premuto il
     pulsante, che moriva senza risposta. Col rinvio la risposta parte prima, e
     il lavoro pesante comincia quando il browser ha gia' ricevuto. */
  setTimeout(() => void (async () => {
    try {
      const e = await giroContinuo(scelti, MINUTI_A_MANO);
      console.info(
        `[pannello] giro finito: ${e.aperte} aperte, ${e.conPrezzo} con prezzo, ` +
          `${e.secondi.toFixed(0)}s`,
      );
    } catch (err) {
      console.error("[pannello] il giro e' fallito:", err);
    } finally {
      giroInCorsoQui = false;
    }
  })(), 0);

  return `Partito: ${MINUTI_A_MANO} minuti su ${scelti.length} paesi (${scelti.join(" ")}). Comparira' fra i vivi entro cinque secondi.`;
}

/**
 * L'ordine di fermarsi, lasciato sul database.
 *
 * PROTETTO DA UNA PAROLA D'ORDINE, e non e' un eccesso di prudenza: senza,
 * chiunque conosca l'indirizzo puo' fermare la raccolta di una notte intera
 * con una richiesta sola. Se `PANNELLO_CHIAVE` non e' impostata il comando non
 * esiste proprio — meglio un pulsante che non c'e' di uno aperto a tutti.
 */
export async function ordinaDiFermare(chiave: string, per = "tutti"): Promise<string> {
  const attesa = process.env.PANNELLO_CHIAVE;
  if (!attesa) return "I comandi sono spenti: manca PANNELLO_CHIAVE fra le variabili.";
  if (chiave !== attesa) return "Parola d'ordine sbagliata.";
  if (!isDbConfigured()) return "Senza database non si puo' lasciare nessun ordine.";

  const c = await comandi();
  await c.replaceOne(
    { _id: "comando" },
    { azione: "ferma" as const, per, quando: new Date(), da: "pannello" },
    { upsert: true },
  );
  /* «Chiesto», non «fermato»: il lettore se ne accorge al prossimo battito, e
     poi finisce la pagina che ha in mano. Dire «fermato» sarebbe una bugia di
     cinque secondi, e chi guarda il pannello penserebbe a un guasto. */
  return `Ordine lasciato per ${per}. Si ferma entro pochi secondi.`;
}

/**
 * La pagina.
 *
 * E' una stringa e non un file perche' cosi' viaggia col codice: niente
 * cartella statica da ricordarsi di copiare nel pacchetto, niente percorso che
 * funziona in sviluppo e non in produzione.
 */
export function paginaPannello(): string {
  return `<!doctype html>
<html lang="it"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pannello &middot; MealMint</title>
<style>
  :root {
    --fondo:#F4F6F3; --piano:#fff; --incavo:#EDF0EB; --inch:#16211B;
    --tenue:#5A6862; --lieve:#8B978F; --filo:#DCE2DA;
    --verde:#17724A; --verde-velo:#E2EFE7;
    --ambra:#9A6206; --ambra-velo:#FAEFD9;
    --rosso:#97291E; --rosso-velo:#F8E3E0;
    --mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme:dark){:root{
    --fondo:#0E1311; --piano:#161C19; --incavo:#1B221E; --inch:#E6EBE7;
    --tenue:#97A39C; --lieve:#6B776F; --filo:#262E29;
    --verde:#4FBF89; --verde-velo:#15291F;
    --ambra:#D8A252; --ambra-velo:#2A2315;
    --rosso:#E08C7E; --rosso-velo:#2C1B18;
  }}
  *{box-sizing:border-box}
  body{margin:0;background:var(--fondo);color:var(--inch);
    font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;
    padding:26px 16px 60px;-webkit-font-smoothing:antialiased}
  .foglio{max-width:920px;margin:0 auto}
  h1{font-size:26px;letter-spacing:-.02em;margin:0 0 3px}
  .quando{font-family:var(--mono);font-size:11.5px;color:var(--lieve);margin:0 0 22px}
  h2{font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;
    color:var(--tenue);margin:34px 0 12px;padding-bottom:6px;border-bottom:1px solid var(--filo)}

  .cifre{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));
    gap:1px;background:var(--filo);border:1px solid var(--filo);border-radius:9px;overflow:hidden}
  .cifre div{background:var(--piano);padding:13px 15px}
  .cifre b{display:block;font-size:23px;font-weight:700;letter-spacing:-.02em;
    font-variant-numeric:tabular-nums}
  .cifre span{display:block;font-size:10.5px;font-weight:600;letter-spacing:.05em;
    text-transform:uppercase;color:var(--lieve);margin-top:4px}
  .cifre .v b{color:var(--verde)} .cifre .r b{color:var(--rosso)}

  .scheda{background:var(--piano);border:1px solid var(--filo);border-radius:9px;
    padding:15px 17px;margin-bottom:10px}
  .scheda.viva{border-left:3px solid var(--verde);background:var(--verde-velo)}
  .scheda.viva.zitta{border-left-color:var(--ambra);background:var(--ambra-velo)}
  .scheda.viva.zitta .pallino{background:var(--ambra);animation:none}
  .scheda.viva.zitta .barra i{background:var(--ambra)}
  .testa{display:flex;flex-wrap:wrap;align-items:baseline;gap:5px 12px;margin-bottom:9px}
  .testa b{font-size:16px}
  .pallino{display:inline-block;width:8px;height:8px;border-radius:50%;
    background:var(--verde);margin-right:6px;animation:batte 1.6s ease-in-out infinite}
  @keyframes batte{0%,100%{opacity:1}50%{opacity:.25}}
  @media (prefers-reduced-motion:reduce){.pallino{animation:none}}
  .etichetta{font-family:var(--mono);font-size:10.5px;font-weight:600;letter-spacing:.06em;
    text-transform:uppercase;padding:2px 7px;border-radius:3px;
    background:var(--incavo);color:var(--tenue)}
  .etichetta.ok{background:var(--verde-velo);color:var(--verde)}
  .etichetta.male{background:var(--rosso-velo);color:var(--rosso)}
  .etichetta.att{background:var(--ambra-velo);color:var(--ambra)}
  .righe{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:10px}
  .righe div span{display:block;font-size:10.5px;letter-spacing:.04em;text-transform:uppercase;
    color:var(--lieve);margin-bottom:1px}
  .righe div b{font-family:var(--mono);font-size:14px;font-variant-numeric:tabular-nums;font-weight:600}
  .barra{height:7px;border-radius:5px;background:var(--incavo);overflow:hidden;margin-top:11px}
  .barra i{display:block;height:100%;background:var(--verde);border-radius:5px;
    transition:width .6s ease}
  .vuoto{color:var(--tenue);font-style:italic;padding:16px 0}
  .comandi{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:12px}
  .comandi button{font:inherit;font-weight:600;font-size:14px;cursor:pointer;
    padding:8px 15px;border-radius:7px;border:1px solid var(--filo);
    background:var(--piano);color:var(--inch)}
  .comandi button:hover{border-color:var(--rosso);color:var(--rosso)}
  .comandi button.primario{background:var(--verde);color:#fff;border-color:var(--verde)}
  .comandi button.primario:hover{opacity:.88;color:#fff;border-color:var(--verde)}
  .comandi button:disabled{opacity:.45;cursor:default}
  .comandi button:focus-visible{outline:2px solid var(--verde);outline-offset:2px}
  .comandi span{font-size:13px;color:var(--tenue)}
  .spazio{background:var(--piano);border:1px solid var(--filo);border-radius:9px;padding:15px 17px}
  .spazio .su{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:6px 14px}
  .spazio .su b{font-size:20px;font-variant-numeric:tabular-nums}
  .spazio .su span{font-family:var(--mono);font-size:12px;color:var(--lieve)}
  .spazio .barra{height:10px;margin-top:10px}
  .spazio .barra i{background:var(--verde)}
  .spazio.stretto .barra i{background:var(--ambra)}
  .spazio.pieno .barra i{background:var(--rosso)}

  .paesi{background:var(--piano);border:1px solid var(--filo);border-radius:9px;overflow:hidden}
  .pr{display:grid;grid-template-columns:42px 1fr 96px 88px 64px;gap:12px;align-items:center;
    padding:7px 16px;border-bottom:1px solid var(--filo)}
  .pr:last-child{border-bottom:none}
  .pr.cap{background:var(--incavo);font-size:10px;font-weight:700;letter-spacing:.07em;
    text-transform:uppercase;color:var(--lieve)}
  .pr .sig{font-family:var(--mono);font-weight:600;font-size:13px}
  .pr .num{font-family:var(--mono);font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums;
    color:var(--tenue)}
  .pr .qta{font-family:var(--mono);font-size:12.5px;text-align:right;font-weight:600;
    font-variant-numeric:tabular-nums;color:var(--verde)}
  .pr .qta.bassa{color:var(--ambra)} .pr .qta.zero{color:var(--rosso)}
  @media (max-width:620px){
    .pr{grid-template-columns:34px 1fr 72px 62px 46px;gap:8px;padding:7px 11px}
    .pr .num,.pr .qta{font-size:11px}
  }
  .pie{margin-top:40px;padding-top:14px;border-top:1px solid var(--filo);
    font-family:var(--mono);font-size:11px;color:var(--lieve)}
</style></head>
<body>
<div class="foglio">
  <h1>Pannello</h1>
  <p class="quando" id="quando">carico&hellip;</p>

  <h2>Chi sta lavorando</h2>
  <div id="vivi"><p class="vuoto">carico&hellip;</p></div>
  <div class="comandi">
    <button id="avvia" type="button" class="primario">Avvia la lettura qui</button>
    <button id="ferma" type="button">Ferma la lettura</button>
    <span id="esito"></span>
  </div>

  <h2>I magazzini</h2>
  <div class="cifre" id="magazzini"></div>

  <h2>Spazio su Mongo</h2>
  <div id="spazio"></div>

  <h2>Paese per paese</h2>
  <div class="paesi" id="perpaese"></div>

  <h2>Gli ultimi giri</h2>
  <div id="passati"></div>

  <p class="pie" id="pie"></p>
</div>

<script>
const n = (x) => (x ?? 0).toLocaleString("it-IT");
const ora = (s) => new Date(s).toLocaleTimeString("it-IT");

function durata(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m " + String(s % 60).padStart(2, "0") + "s";
  return Math.floor(m / 60) + "h " + String(m % 60).padStart(2, "0") + "m";
}

/* Oltre questo silenzio la scheda cambia faccia. Quindici secondi sono tre
   battiti persi: uno solo capita per un rallentamento della rete, tre no. */
const SOSPETTO_MS = 15000;

function schedaViva(g, adesso) {
  const corso = new Date(adesso) - new Date(g.inizio);
  const fermo = new Date(adesso) - new Date(g.tocco);
  const ritmo = corso > 0 ? (g.aperte / (corso / 1000)) : 0;
  const resa = g.aperte > 0 ? Math.round((g.conPrezzo / g.aperte) * 100) : 0;
  /* Un lettore ucciso non fa in tempo a dire che sta morendo: la sua riga resta
     li' fino a che il silenzio non e' abbastanza lungo da essere una risposta.
     Nel frattempo va detto che non risponde, altrimenti per due minuti un morto
     ha lo stesso aspetto di uno che lavora. */
  const zitto = fermo > SOSPETTO_MS;
  return \`<div class="scheda viva\${zitto ? " zitta" : ""}">
    <div class="testa">
      <b><span class="pallino"></span>\${g.macchina}</b>
      <span class="etichetta \${zitto ? "att" : "ok"}">\${g.lavoro}</span>
      <span class="etichetta">da \${durata(corso)}</span>
      \${zitto ? '<span class="etichetta att">non risponde da ' + durata(fermo) + '</span>' : ""}
    </div>
    <div class="righe">
      <div><span>aperte</span><b>\${n(g.aperte)}</b></div>
      <div><span>con prezzo</span><b>\${n(g.conPrezzo)}</b></div>
      <div><span>resa</span><b>\${resa}%</b></div>
      <div><span>ritmo</span><b>\${ritmo.toFixed(1)}/s</b></div>
      <div><span>ultimo colpo</span><b>\${ora(g.tocco)}</b></div>
    </div>
    <div class="barra"><i style="width:\${resa}%"></i></div>
    <div class="righe" style="margin-top:12px;padding-top:11px;border-top:1px solid var(--filo)">
      <div><span>RAM macchina</span><b>\${g.ramTotaleMb ? n(g.ramUsataMb) + " / " + n(g.ramTotaleMb) + " MB" : "&mdash;"}</b></div>
      <div><span>carico</span><b>\${g.carico ? g.carico.toFixed(2) : "non misurato"}</b></div>
      <div><span>accesa da</span><b>\${g.accesaDaSec ? durata(g.accesaDaSec * 1000) : "&mdash;"}</b></div>
    </div>
  </div>\`;
}

function schedaPassata(g) {
  const durò = new Date(g.tocco) - new Date(g.inizio);
  const resa = g.aperte > 0 ? Math.round((g.conPrezzo / g.aperte) * 100) : 0;
  const male = g.esito === "morto senza chiudere";
  return \`<div class="scheda">
    <div class="testa">
      <b>\${g.macchina}</b>
      <span class="etichetta">\${g.lavoro}</span>
      <span class="etichetta \${male ? "male" : "ok"}">\${g.esito}</span>
      <span class="etichetta">\${new Date(g.inizio).toLocaleString("it-IT")}</span>
    </div>
    <div class="righe">
      <div><span>durata</span><b>\${durata(durò)}</b></div>
      <div><span>aperte</span><b>\${n(g.aperte)}</b></div>
      <div><span>con prezzo</span><b>\${n(g.conPrezzo)}</b></div>
      <div><span>resa</span><b>\${resa}%</b></div>
    </div>
  </div>\`;
}

async function aggiorna() {
  let d;
  try {
    d = await (await fetch("/pannello/dati", { cache: "no-store" })).json();
  } catch {
    document.getElementById("quando").textContent = "il server non risponde — riprovo fra 5 secondi";
    return;
  }

  document.getElementById("quando").textContent =
    "aggiornato alle " + ora(d.adesso) + " · si rinfresca da solo ogni 5 secondi";

  document.getElementById("vivi").innerHTML = d.vivi.length
    ? d.vivi.map((g) => schedaViva(g, d.adesso)).join("")
    : '<p class="vuoto">Nessun lettore sta lavorando in questo momento.</p>';

  const p = d.prezzi, c = d.cataloghi;
  const quota = p.righe > 0 ? Math.round((p.fresche / p.righe) * 100) : 0;
  document.getElementById("magazzini").innerHTML = \`
    <div class="v"><b>\${n(c.prodotti)}</b><span>link in catalogo</span></div>
    <div><b>\${n(c.insegne)}</b><span>insegne</span></div>
    <div><b>\${n(d.quantiPaesi)}</b><span>paesi</span></div>
    <div class="\${p.fresche > 0 ? "v" : "r"}"><b>\${n(p.fresche)}</b><span>prezzi freschi</span></div>
    <div><b>\${n(p.righe)}</b><span>righe in magazzino</span></div>
    <div><b>\${quota}%</b><span>ancora validi</span></div>\`;

  /* Lo spazio. La barra e' l'unica cosa che dice quando il progetto si ferma:
     riempito il piano, il magazzino smette di crescere e non c'e' codice che
     rimedi. */
  const sp = d.spazio;
  if (sp) {
    const q = Math.round(sp.pieno * 100);
    const classe = q >= 90 ? "pieno" : q >= 70 ? "stretto" : "";
    document.getElementById("spazio").innerHTML = \`
      <div class="spazio \${classe}">
        <div class="su">
          <b>\${sp.totaleMb.toLocaleString("it-IT")} MB <span>di \${n(sp.tettoMb)} MB &middot; \${q}%</span></b>
          <span>dati \${sp.datiMb} MB &middot; indici \${sp.indiciMb} MB</span>
        </div>
        <div class="barra"><i style="width:\${q}%"></i></div>
        <div class="righe" style="margin-top:12px">
          <div><span>un prezzo pesa</span><b>\${n(sp.bytePerPrezzo)} byte</b></div>
          <div><span>ce ne stanno ancora</span><b>\${n(sp.prezziCheCiStanno)}</b></div>
          <div><span>indici sul totale</span><b>\${sp.totaleMb > 0 ? Math.round((sp.indiciMb / sp.totaleMb) * 100) : 0}%</b></div>
        </div>
      </div>\`;
  }

  /* Paese per paese. La quota e' prezzi freschi su link conosciuti: dice quanto
     di quel paese l'app puo' servire senza aprire una pagina mentre uno
     aspetta, che e' il punto di tutto il magazzino. */
  const pp = d.paesi || [];
  document.getElementById("perpaese").innerHTML = pp.length
    ? '<div class="pr cap"><span>paese</span><span>copertura</span><span>link</span><span>prezzi</span><span>quota</span></div>' +
      pp.map((r) => {
        const q = Math.round(r.copertura * 100);
        const classe = q === 0 ? "zero" : q < 25 ? "bassa" : "";
        return \`<div class="pr">
          <span class="sig">\${r.paese}</span>
          <span class="barra"><i style="width:\${q}%"></i></span>
          <span class="num">\${n(r.link)}</span>
          <span class="num">\${n(r.prezzi)}</span>
          <span class="qta \${classe}">\${q}%</span>
        </div>\`;
      }).join("")
    : '<div class="pr"><span class="sig">&mdash;</span><span>i conti per paese si fanno una volta al minuto: il primo arriva a momenti</span><span></span><span></span><span></span></div>';

  document.getElementById("passati").innerHTML = d.passati.length
    ? d.passati.map(schedaPassata).join("")
    : '<p class="vuoto">Nessun giro registrato. Il registro parte dal primo giro dopo questo aggiornamento.</p>';

  document.getElementById("pie").textContent =
    d.fonti.quante + " insegne in memoria · " +
    d.memoria.caricati.length + " paesi caldi · " +
    "magazzino prezzi " + p.interruttore + " · cataloghi " + c.interruttore +
    (d.presiIl ? " · conti per paese e spazio presi alle " + ora(d.presiIl) : "");
}

/* La parola d'ordine si chiede una volta e resta nel browser. Non viaggia mai
   verso nessuno tranne questo server, e non finisce in nessun indirizzo: se
   stesse nella barra del browser resterebbe nella cronologia. */
async function comanda(rotta, bottone) {
  let chiave = localStorage.getItem("pannello-chiave");
  if (!chiave) {
    chiave = prompt("Parola d'ordine del pannello");
    if (!chiave) return;
  }
  bottone.disabled = true;
  const esito = document.getElementById("esito");
  esito.textContent = "invio…";
  try {
    const r = await fetch(rotta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chiave }),
    });
    const d = await r.json();
    esito.textContent = d.messaggio;
    if (d.ok) { localStorage.setItem("pannello-chiave", chiave); aggiorna(); }
    else localStorage.removeItem("pannello-chiave");
  } catch {
    esito.textContent = "il server non ha risposto";
  }
  bottone.disabled = false;
}

document.getElementById("avvia").addEventListener("click", (e) => comanda("/pannello/avvia", e.currentTarget));
document.getElementById("ferma").addEventListener("click", (e) => comanda("/pannello/ferma", e.currentTarget));

aggiorna();
setInterval(aggiorna, 5000);
</script>
</body></html>`;
}
