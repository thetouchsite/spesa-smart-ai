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

import { chiStaLavorando, giriPassati, lavoroPerGiorno } from "./giri.js";
import { comandi, isDbConfigured } from "../base/db.js";
import { rotteMontate } from "../base/http.js";
import { giroContinuo } from "./prezzi-continuo.js";
import { chiTieneIPaesi } from "./turni.js";
import { assicuraFonti, tutteLeFonti } from "./catalogo-fonti.js";
import { contiPesanti } from "./statistiche.js";
import { statoMagazzino } from "./prezzi-magazzino.js";
import { statoCataloghi } from "./catalogo-magazzino.js";
import { statoCatalogo } from "./catalogo.js";
import { statoFonti, paesiConCatalogo } from "./catalogo-fonti.js";

export async function datiPannello() {
  const [vivi, passati, perGiorno, prezzi, cataloghi] = await Promise.all([
    chiStaLavorando(),
    giriPassati(10),
    lavoroPerGiorno(14),
    statoMagazzino(),
    statoCataloghi(),
  ]);
  return {
    adesso: new Date().toISOString(),
    vivi,
    passati,
    perGiorno,
    prezzi,
    cataloghi,
    memoria: statoCatalogo(),
    rotte: rotteMontate(),
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
const PAESI_A_MANO = Number(process.env.PANNELLO_PAESI ?? 4);

/**
 * I paesi in ordine di quanto rendono, e mai quelli al buio.
 *
 * Il primo giro lanciato a mano ha preso AL AR AT BA BE BG BR CA CH CZ DE DK —
 * l'ordine alfabetico. Dentro c'erano BA, BE e CA, dove NESSUNA insegna
 * pubblica i prezzi: pagine aperte sapendo gia' che non avrebbero dato niente.
 * La resa e' scesa dall'80% di una notte normale al 33%: due pagine su tre
 * buttate, e ogni pagina buttata e' comunque una richiesta a un negozio.
 *
 * Il punteggio e' la somma di `resa x stimati` delle insegne del paese: quante
 * schede prezzate ci si puo' aspettare di trovarci. Chi fa zero non entra mai.
 */
function paesiCheRendono(): string[] {
  const punteggio = new Map<string, number>();
  for (const f of tutteLeFonti()) {
    if (f.resa <= 0) continue;
    punteggio.set(f.paese, (punteggio.get(f.paese) ?? 0) + f.resa * f.stimati);
  }
  return [...punteggio.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
}

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
  const tutti = paesiCheRendono();
  if (tutti.length === 0) return "Nessun paese con insegne che pubblicano prezzi.";

  /* SI SCEGLIE FRA I PAESI LIBERI, non fra tutti.
     Da quando i paesi si prenotano, un lettore acceso altrove — il PC di
     casa — puo' averli gia' in mano. Prima questo pulsante li sceglieva con
     la sua rotazione e li passava al giro, che li trovava occupati e tornava
     indietro senza far niente: il pannello diceva «Partito» e non partiva
     nulla. Un fallimento che non lascia nemmeno il sospetto di essere tale.

     Adesso si guarda prima chi tiene cosa, si prende quel che e' libero, e se
     non c'e' niente di libero lo si dice — con il nome di chi sta lavorando,
     che e' la sola informazione utile in quel momento. */
  const tenuti = await chiTieneIPaesi();
  const liberi = tutti.filter((p) => !tenuti.has(p));
  if (liberi.length === 0) {
    const chi = [...new Set(tenuti.values())].join(", ");
    return `Tutti i paesi sono gia' in mano a un altro lettore${chi ? ` (${chi})` : ""}. Non c'e' niente da leggere che non stia gia' leggendo qualcun altro.`;
  }

  const scelti: string[] = [];
  for (let i = 0; i < Math.min(PAESI_A_MANO, liberi.length); i++) {
    scelti.push(liberi[(daQualePaese + i) % liberi.length]);
  }
  daQualePaese = (daQualePaese + scelti.length) % Math.max(1, liberi.length);

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

  const occupati = tenuti.size > 0 ? ` (${tenuti.size} paesi sono presi da un altro lettore)` : "";
  return `Partito: ${MINUTI_A_MANO} minuti su ${scelti.length} paesi (${scelti.join(" ")})${occupati}. Comparira' fra i vivi entro cinque secondi.`;
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
  /* LE SCHEDE DEI LETTORI, STRETTE.
     Erano due griglie sovrapposte, cinque numeri sopra e tre sotto, con un
     titolo in mezzo: centosettanta punti d'altezza a testa, e con tre
     macchine accese il resto del pannello finiva sotto la piega. I numeri
     sono gli stessi — non si toglie informazione per fare spazio — ma stanno
     su una riga sola, e quelli che si guardano di rado (RAM, carico, da
     quanto e' accesa) scendono in una riga minuta in fondo. */
  .scheda.viva{padding:11px 14px}
  .scheda.viva .testa{margin-bottom:7px}
  .scheda.viva .righe{grid-template-columns:repeat(auto-fit,minmax(88px,1fr));gap:7px}
  .scheda.viva .righe div span{font-size:9.5px;margin-bottom:0}
  .scheda.viva .righe div b{font-size:13px}
  .scheda.viva .barra{height:5px;margin-top:8px}
  .coda{display:flex;flex-wrap:wrap;gap:4px 14px;margin-top:8px;font-family:var(--mono);
    font-size:10.5px;color:var(--lieve)}
  .coda b{font-weight:600;color:var(--tenue)}

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

  /* Giorno per giorno. Stessa griglia dei paesi ma cinque colonne diverse:
     la barra e' la DURATA, perche' la domanda e' «quanto abbiamo letto», e le
     pagine stanno accanto in cifra. Due barre sovrapposte — tempo e pagine —
     sarebbero piu' complete e illeggibili. */
  /* Le rotte. Una riga per rotta, raggruppate per primo pezzo del percorso:
     e' l'ordine in cui il server e' organizzato davvero, e mette vicine le
     cose che si toccano insieme. */
  /* IL TOTALE, IN CIMA.
     Le schede dicono cosa fa ogni macchina, e va bene per capire chi e'
     fermo. Ma la domanda che uno si fa aprendo il pannello e' «quanto stiamo
     macinando», e quella risposta non c'era: bisognava sommare a mente
     quattro ritmi. Il totale e' il numero che conta, le singole macchine sono
     il dettaglio. */
  /* UNA RIGA PER LETTORE.
     Le schede erano leggibili con una macchina e diventavano un muro con
     quattro: centodieci punti a testa, e il magazzino finiva sotto la piega.
     Qui ogni lettore &egrave; una riga, la resa &egrave; il riempimento chiaro dietro i
     numeri invece di una barra a parte, e i paesi in mano stanno nel
     suggerimento del mouse — si guardano di rado e occupavano una riga. */
  /* LA BARRA DELLE VISTE.
     Tre viste e non tre pagine: i dati arrivano tutti nella stessa risposta —
     una sola — e ricaricarli per cambiare sezione sarebbe tre volte il lavoro
     per gli stessi numeri. L&rsquo;indirizzo cambia lo stesso (#raccolta), quindi
     una vista si pu&ograve; mandare a qualcuno per collegamento. */
  h2.stretto{margin-top:4px}
  .cima{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;
    gap:14px;margin-bottom:18px}
  .cima h1{margin:0}
  .cima .quando{margin:2px 0 0}
  .viste{display:flex;gap:2px;background:var(--incavo);padding:3px;border-radius:8px}
  .viste a{text-decoration:none;font-size:12.5px;font-weight:600;color:var(--tenue);
    padding:6px 14px;border-radius:6px;white-space:nowrap}
  .viste a:hover{color:var(--inchiostro)}
  .viste a.acceso{background:var(--piano);color:var(--verde);
    box-shadow:0 1px 2px rgba(0,0,0,.06)}

  .titolo-riga{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;
    gap:10px}
  .scelta-vista{display:flex;gap:2px;background:var(--incavo);padding:3px;border-radius:7px}
  .scelta-vista button{font:inherit;font-size:11.5px;font-weight:600;color:var(--tenue);
    background:none;border:0;padding:5px 11px;border-radius:5px;cursor:pointer}
  .scelta-vista button.acceso{background:var(--piano);color:var(--verde);
    box-shadow:0 1px 2px rgba(0,0,0,.06)}

  .intro{font-size:12.5px;color:var(--lieve);margin:-8px 0 12px;max-width:70ch;line-height:1.5}
  .intro code{font-family:var(--mono);font-size:11.5px;background:var(--incavo);
    padding:1px 5px;border-radius:3px}

  .lettori{background:var(--piano);border:1px solid var(--filo);border-radius:9px;overflow:hidden;
    margin-bottom:14px}
  .lt{position:relative;display:grid;
    grid-template-columns:minmax(120px,1.4fr) 76px 84px 52px 62px 96px 52px auto;
    gap:10px;align-items:center;padding:8px 14px;border-bottom:1px solid var(--filo)}
  .lt:last-child{border-bottom:none}
  .lt.cap{background:var(--incavo);font-size:9.5px;font-weight:700;letter-spacing:.07em;
    text-transform:uppercase;color:var(--lieve)}
  .lt.cap span{text-align:right}
  .lt.cap span:first-child{text-align:left}
  .lt .fondo{position:absolute;left:0;top:0;bottom:0;background:var(--verde-velo);
    z-index:0;border-right:1px solid rgba(0,0,0,.04)}
  .lt > span{position:relative;z-index:1}
  .lt .chi{display:flex;align-items:center;gap:6px;min-width:0}
  .lt .chi b{font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis}
  .lt .chi em{font-family:var(--mono);font-style:normal;font-size:10px;color:var(--lieve)}
  .lt .num{font-family:var(--mono);font-size:12.5px;text-align:right;
    font-variant-numeric:tabular-nums}
  .lt .num.forte{color:var(--verde);font-weight:600}
  .lt .num.tenue{color:var(--lieve)}
  .lt.zitta .fondo{background:var(--ambra-velo)}
  .lt.zitta .num.forte{color:var(--ambra)}

  .adesso{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;
    background:var(--filo);border:1px solid var(--filo);border-radius:9px;overflow:hidden;
    margin-bottom:18px}
  .adesso div{background:var(--piano);padding:11px 14px}
  .adesso span{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;
    color:var(--lieve);margin-bottom:2px}
  .adesso b{font-family:var(--mono);font-size:19px;font-weight:600;
    font-variant-numeric:tabular-nums}
  .adesso b.forte{color:var(--verde)}
  .adesso b.spenta{color:var(--lieve)}

  /* Le rotte del prodotto: poche, con scritto cosa fanno. Vedi la nota nel
     disegno per il motivo di mostrarne sei invece di quarantuno. */
  .rt{display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;
    padding:6px 16px;border-bottom:1px solid var(--filo)}
  .rt:last-child{border-bottom:none}
  .rt .met{font-family:var(--mono);font-size:10px;font-weight:700;letter-spacing:.06em;
    text-align:center;padding:2px 0;border-radius:3px;background:var(--incavo);color:var(--lieve)}
  .rt .met.post{background:var(--verde-velo);color:var(--verde)}
  .rt .via{font-family:var(--mono);font-size:12.5px;color:var(--tenue);min-width:0}
  .rt .via em{display:block;font-style:normal;font-size:11.5px;
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
    color:var(--lieve);margin-top:2px;line-height:1.4}
  .rt .chiave{font-family:var(--mono);font-size:10px;color:var(--ambra);
    background:var(--ambra-velo);padding:2px 7px;border-radius:3px}
  .gruppo.frase{text-transform:none;font-weight:400;letter-spacing:0;font-size:11.5px;
    font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--lieve)}
  .gruppo{background:var(--incavo);padding:5px 16px;font-size:10px;font-weight:700;
    letter-spacing:.07em;text-transform:uppercase;color:var(--lieve);
    border-bottom:1px solid var(--filo)}

  .gg{display:grid;grid-template-columns:70px 1fr 74px 96px 56px;gap:12px;align-items:center;
    padding:7px 16px;border-bottom:1px solid var(--filo)}
  .gg:last-child{border-bottom:none}
  .gg.cap{background:var(--incavo);font-size:10px;font-weight:700;letter-spacing:.07em;
    text-transform:uppercase;color:var(--lieve)}
  .gg .sig{font-family:var(--mono);font-weight:600;font-size:12.5px}
  .gg .num{font-family:var(--mono);font-size:12.5px;text-align:right;font-variant-numeric:tabular-nums;
    color:var(--tenue)}
  .gg .qta{font-family:var(--mono);font-size:12.5px;text-align:right;font-weight:600;
    font-variant-numeric:tabular-nums;color:var(--verde)}
  .gg .qta.bassa{color:var(--ambra)} .gg .qta.zero{color:var(--rosso)}
  /* Un giorno senza lettura ha la barra vuota e il nome spento: si deve vedere
     che c'e' stato, e che non e' successo niente. */
  .gg.vuoto .sig{color:var(--lieve)}
  .gg.oggi .sig{color:var(--verde)}

  .paesi{background:var(--piano);border:1px solid var(--filo);border-radius:9px;overflow:hidden}
  .pr{display:grid;grid-template-columns:26px minmax(132px,1.1fr) 2fr 92px 84px 58px;gap:12px;
    align-items:center;padding:7px 16px;border-bottom:1px solid var(--filo)}
  /* LA BANDIERA E' UN'IMMAGINE, E NON PER SCELTA.
     Prima era il carattere emoji, ricavato dal codice: elegante, zero file,
     zero elenchi da aggiornare. Solo che Windows le bandiere non le disegna —
     e' una decisione di Microsoft, non un difetto — e al loro posto mostra le
     due lettere. Su una dashboard guardata da tre macchine Windows, una
     colonna che mostra «IT» accanto a «Italia IT» e' peggio che non averla.
     Venti per quindici punti da flagcdn: se il servizio non risponde resta un
     buco, e accanto c'e' comunque la sigla. */
  .pr .bnd{width:20px;height:15px;border-radius:2px;display:block;
    box-shadow:0 0 0 1px rgba(0,0,0,.08)}
  .pr .nome{display:flex;align-items:baseline;gap:7px;min-width:0}
  .pr .nome b{font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;
    text-overflow:ellipsis}
  /* La sigla resta, piccola: e' quella che si scrive in «--solo IT,ES» e
     nelle variabili, quindi toglierla farebbe perdere il collegamento fra
     quello che si legge qui e quello che si digita altrove. */
  .pr .nome i{font-family:var(--mono);font-style:normal;font-size:10.5px;color:var(--lieve);
    letter-spacing:.04em}
  .pr:last-child{border-bottom:none}
  .pr.cap{background:var(--incavo);font-size:10px;font-weight:700;letter-spacing:.07em;
    text-transform:uppercase;color:var(--lieve)}
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
  <div class="cima">
    <div>
      <h1>Centrale</h1>
      <p class="quando" id="quando">carico&hellip;</p>
    </div>
    <nav class="viste">
      <a href="#operativa" data-vista="operativa">Operativa</a>
      <a href="#raccolta" data-vista="raccolta">Raccolta</a>
      <a href="#api" data-vista="api">API</a>
    </nav>
  </div>

  <div id="adesso" class="adesso"></div>

  <!-- CHI STA LAVORANDO NON STA IN NESSUNA VISTA: STA SOPRA TUTTE.
       E' l'unica cosa che si guarda mentre si fa altro — si apre la raccolta
       per capire dove spingere, e intanto si vuole vedere se una macchina si
       e' fermata. Metterlo dentro una scheda vorrebbe dire scoprire un lettore
       morto solo tornando indietro. -->
  <h2 class="stretto">Chi sta lavorando</h2>
  <div class="lettori" id="vivi"><p class="vuoto">carico&hellip;</p></div>
  <div class="comandi">
    <button id="avvia" type="button" class="primario">Avvia la lettura qui</button>
    <button id="ferma" type="button">Ferma la lettura</button>
    <span id="esito"></span>
  </div>

  <section data-vista="operativa">
    <h2>I magazzini</h2>
    <div class="cifre" id="magazzini"></div>

    <h2>Spazio su Mongo</h2>
    <div id="spazio"></div>

    <h2>Gli ultimi giri</h2>
    <div id="passati"></div>
  </section>

  <section data-vista="raccolta" hidden>
    <div class="titolo-riga">
      <h2>Copertura</h2>
      <div class="scelta-vista" id="scelta-copertura">
        <button type="button" data-per="paese" class="acceso">per paese</button>
        <button type="button" data-per="insegna">per insegna</button>
      </div>
    </div>
    <div class="paesi" id="perpaese"></div>

    <h2>Giorno per giorno</h2>
    <div class="paesi" id="pergiorno"></div>
  </section>

  <section data-vista="api" hidden>
    <h2>Le API del prodotto</h2>
    <p class="intro" id="apiIntro"></p>
    <div class="paesi" id="rotte"></div>

    <h2>Dove arriviamo</h2>
    <p class="intro">Quello che <code>/v1/copertura</code> risponde a chi chiede, paese per paese.</p>
    <div class="paesi" id="coperturaApi"></div>
  </section>

  <p class="pie" id="pie"></p>
</div>

<script>
const nomiPaese = (() => {
  try { return new Intl.DisplayNames([navigator.language || "it"], { type: "region" }); }
  catch { return null; }
})();
const nomePaese = (c) => {
  try { return (nomiPaese && nomiPaese.of(c)) || c; } catch { return c; }
};
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
  const ritmo = corso > 0 ? g.aperte / (corso / 1000) : 0;
  const resa = g.aperte > 0 ? Math.round((g.conPrezzo / g.aperte) * 100) : 0;
  /* Un lettore ucciso non fa in tempo a dire che sta morendo: la sua riga resta
     li&rsquo; fino a che il silenzio non &egrave; abbastanza lungo da essere una risposta.
     Nel frattempo va detto che non risponde, altrimenti per due minuti un morto
     ha lo stesso aspetto di uno che lavora. */
  const zitto = fermo > SOSPETTO_MS;
  const ram = g.ramTotaleMb ? n(g.ramUsataMb) + "/" + n(g.ramTotaleMb) : "&mdash;";
  const paesi = (g.paesi || []).join(" ");
  return '<div class="lt' + (zitto ? " zitta" : "") + '" title="' + paesi + '">' +
    '<i class="fondo" style="width:' + resa + '%"></i>' +
    '<span class="chi"><span class="pallino"></span><b>' + g.macchina + '</b>' +
      (g.pid ? '<em>#' + g.pid + '</em>' : "") + "</span>" +
    '<span class="num">' + n(g.aperte) + "</span>" +
    '<span class="num">' + n(g.conPrezzo) + "</span>" +
    '<span class="num forte">' + resa + "%</span>" +
    '<span class="num">' + ritmo.toFixed(1) + "/s</span>" +
    '<span class="num tenue">' + ram + "</span>" +
    '<span class="num tenue">' + durata(corso) + "</span>" +
    (zitto ? '<span class="etichetta att">zitto da ' + durata(fermo) + "</span>" : '<span></span>') +
    "</div>";
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

/* L&rsquo;ultima risposta, tenuta da parte: il selettore della copertura deve
   poter ridisegnare senza rifare la richiesta. */
let datiUltimi = {};

async function aggiorna() {
  let d;
  try {
    d = await (await fetch("/pannello/dati", { cache: "no-store" })).json();
  } catch {
    document.getElementById("quando").textContent = "il server non risponde — riprovo fra 5 secondi";
    return;
  }

  datiUltimi = d;

  document.getElementById("quando").textContent =
    "aggiornato alle " + ora(d.adesso) + " · si rinfresca da solo ogni 5 secondi";

  /* L&rsquo;INTESTAZIONE UNA VOLTA SOLA.
     Prima ogni scheda ripeteva le stesse cinque etichette — aperte, con
     prezzo, resa, ritmo, ultimo colpo — e con quattro macchine accese erano
     venti parole scritte per dire cinque cose. In una tabella le etichette
     stanno in cima e sotto ci sono solo i numeri, che &egrave; anche il modo in cui
     si confrontano fra loro: incolonnati. */
  document.getElementById("vivi").innerHTML = d.vivi.length
    ? '<div class="lt cap"><span></span><span>aperte</span><span>con prezzo</span><span>resa</span><span>ritmo</span><span>RAM MB</span><span>da</span><span></span></div>' + d.vivi.map((g) => schedaViva(g, d.adesso)).join("")
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
  /* LA COPERTURA, PER PAESE O PER INSEGNA.
     «L&rsquo;Italia sta al 26%» non dice cosa fare: l&rsquo;Italia sono ventotto insegne,
     e quel ventisei &egrave; la media fra chi pubblica tutto e chi non pubblica
     niente. Il lavoro da fare sta sempre in una delle due, mai nella media —
     per questo il selettore, e per questo il dettaglio &egrave; ordinato per
     quanti link ha, non per quanto &egrave; bravo: in cima sta chi ha pi&ugrave; da dare.

     Le barre sono la copertura, non i link: due colonne di numeri raccontano
     quanto, la barra racconta quanto MANCA, che &egrave; la domanda vera. */
  let perCosa = "paese";

  function disegnaCopertura() {
    const righe = perCosa === "paese" ? (datiUltimi.paesi || []) : (datiUltimi.insegne || []);
    const dove = document.getElementById("perpaese");
    if (!righe.length) {
      dove.innerHTML = '<div class="pr"><span></span><span class="nome"><b>&mdash;</b></span>' +
        '<span>i conti si rifanno una volta al minuto: il primo arriva a momenti</span>' +
        '<span></span><span></span><span></span></div>';
      return;
    }
    const capo = perCosa === "paese" ? "paese" : "insegna";
    dove.innerHTML =
      '<div class="pr cap"><span></span><span>' + capo + '</span><span>copertura</span>' +
      '<span>link</span><span>prezzi</span><span>quota</span></div>' +
      righe.slice(0, 60).map((r) => {
        const q = Math.round(r.copertura * 100);
        const classe = q === 0 ? "zero" : q < 25 ? "bassa" : "";
        const iso = (r.paese || "").toLowerCase();
        const titolo = perCosa === "paese" ? nomePaese(r.paese) : r.insegna;
        const sotto = perCosa === "paese" ? r.paese : r.paese;
        return '<div class="pr">' +
          '<img class="bnd" alt="" loading="lazy" src="https://flagcdn.com/20x15/' + iso + '.png">' +
          '<span class="nome"><b>' + titolo + '</b><i>' + sotto + '</i></span>' +
          '<span class="barra"><i style="width:' + q + '%"></i></span>' +
          '<span class="num">' + n(r.link) + '</span>' +
          '<span class="num">' + n(r.prezzi) + '</span>' +
          '<span class="qta ' + classe + '">' + q + '%</span>' +
        '</div>';
      }).join("");
  }

  for (const b of document.querySelectorAll("#scelta-copertura button")) {
    b.addEventListener("click", () => {
      perCosa = b.dataset.per;
      for (const x of document.querySelectorAll("#scelta-copertura button")) {
        x.classList.toggle("acceso", x === b);
      }
      disegnaCopertura();
    });
  }

  disegnaCopertura();

  /* DOVE ARRIVIAMO, nella vista delle API: &egrave; la stessa tabella dei paesi ma
     senza i link interni — a chi valuta l&rsquo;API interessa quanti prezzi ci sono
     e che quota del catalogo coprono, non quante pagine dobbiamo ancora
     aprire noi. */
  const perApi = (datiUltimi.paesi || []).filter((r) => r.prezzi > 0);
  document.getElementById("coperturaApi").innerHTML = perApi.length
    ? '<div class="pr cap"><span></span><span>paese</span><span>copertura</span>' +
      '<span>prodotti</span><span>con prezzo</span><span>quota</span></div>' +
      perApi.map((r) => {
        const q = Math.round(r.copertura * 100);
        const classe = q === 0 ? "zero" : q < 25 ? "bassa" : "";
        return '<div class="pr">' +
          '<img class="bnd" alt="" loading="lazy" src="https://flagcdn.com/20x15/' +
            (r.paese || "").toLowerCase() + '.png">' +
          '<span class="nome"><b>' + nomePaese(r.paese) + '</b><i>' + r.paese + '</i></span>' +
          '<span class="barra"><i style="width:' + q + '%"></i></span>' +
          '<span class="num">' + n(r.link) + '</span>' +
          '<span class="num">' + n(r.prezzi) + '</span>' +
          '<span class="qta ' + classe + '">' + q + '%</span>' +
        '</div>';
      }).join("")
    : '<div class="pr"><span></span><span class="nome"><b>&mdash;</b></span><span>i conti arrivano a momenti</span><span></span><span></span><span></span></div>';

  document.getElementById("apiIntro").innerHTML =
    'Sono le sole rotte pubblicate: quello che un cliente compra. Vogliono tutte una chiave ' +
    'nell&rsquo;intestazione <code>X-Api-Key</code>. Le altre ' + ((d.rotte || []).length - 6) +
    ' rotte del server sono l&rsquo;app — accesso, piani, ricette, questo pannello — e non sono parte ' +
    'del prodotto.';

  /* IL TOTALE.  /* IL TOTALE. Il ritmo si somma; la resa no — si rifa' sul totale, o una
     macchina lentissima al 100% falserebbe la media di tutte. */
  const vv = d.vivi || [];
  const ritmoTot = vv.reduce((t, g) => {
    const sec = Math.max(1, (new Date(g.tocco) - new Date(g.inizio)) / 1000);
    return t + g.aperte / sec;
  }, 0);
  const aperteTot = vv.reduce((t, g) => t + (g.aperte || 0), 0);
  const conPrezzoTot = vv.reduce((t, g) => t + (g.conPrezzo || 0), 0);
  const resaTot = aperteTot > 0 ? Math.round((conPrezzoTot / aperteTot) * 100) : 0;
  const paesiPresi = new Set();
  for (const g of vv) for (const p of g.paesi || []) paesiPresi.add(p);

  document.getElementById("adesso").innerHTML =
    '<div><span>lettori accesi</span><b class="' + (vv.length ? "forte" : "spenta") + '">' +
      vv.length + '</b></div>' +
    '<div><span>ritmo totale</span><b class="' + (ritmoTot > 0 ? "forte" : "spenta") + '">' +
      ritmoTot.toFixed(1) + '/s</b></div>' +
    '<div><span>aperte adesso</span><b>' + n(aperteTot) + '</b></div>' +
    '<div><span>resa</span><b>' + resaTot + '%</b></div>' +
    '<div><span>paesi in lavorazione</span><b>' + paesiPresi.size + '</b></div>';

  /* LE API ESPOSTE — SOLO QUELLE CHE SONO IL PRODOTTO.
     Il registro ne conta quarantuno, ma trentacinque sono l&rsquo;app: login,
     piani, ricette, il pannello stesso. Metterle tutte qui dentro trasforma
     la sezione in un elenco di cose interne, e chi la guarda per capire
     «cosa vendiamo» non lo capisce pi&ugrave;. Il prodotto sono le sei sotto
     /v1, ed &egrave; la stessa linea che il build fa rispettare fra api/ e app/.
     Il resto si dice in una riga, col numero, perch&eacute; saperlo serve.

     Accanto a ognuna c&rsquo;&egrave; cosa fa: un elenco di percorsi senza descrizioni
     non &egrave; documentazione, e questo pannello lo guarda anche chi l&rsquo;API la
     sta valutando. */
  const COSA_FANNO = {
    "POST /v1/offerte": "I prezzi di una lista della spesa, confrontati fra le insegne del paese. &Egrave; il cuore del prodotto.",
    "POST /v1/prezzi": "Lo stesso di sopra, col nome di prima. Un&rsquo;API non spegne un indirizzo gi&agrave; pubblicato.",
    "POST /v1/prodotti": "Cerca un prodotto nel catalogo di un paese: insegna, nome e link alla scheda.",
    "POST /v1/negozi": "I punti vendita di un paese, o di una sola citt&agrave;.",
    "GET /v1/copertura": "Cosa copriamo paese per paese, anche quando &egrave; brutto. Chi valuta deve saperlo prima.",
    "GET /v1/stato": "Se il servizio &egrave; in piedi e quanto ha in magazzino.",
  };
  const rotte = d.rotte || [];
  const delProdotto = rotte.filter((r) => r.split(" ")[1].startsWith("/v1/"));
  const interne = rotte.length - delProdotto.length;

  document.getElementById("rotte").innerHTML = delProdotto.length
    ? delProdotto.map((r) => {
        const met = r.split(" ")[0];
        const via = r.split(" ")[1];
        return '<div class="rt"><span class="met ' + met.toLowerCase() + '">' + met +
          '</span><span class="via">' + via +
          '<em>' + (COSA_FANNO[r] || "") + '</em></span>' +
          '<span class="chiave">chiave</span></div>';
      }).join("") +
      '<div class="gruppo frase">pi&ugrave; ' + interne +
      ' rotte interne dell&rsquo;app, non pubblicate: accesso, piani, ricette, questo pannello</div>'
    : '<div class="rt"><span></span><span class="via">nessuna rotta registrata</span><span></span></div>';

  /* GIORNO PER GIORNO.
     Si riempiono anche i giorni senza righe: un giorno in cui non si e' letto
     e' un dato, e saltarlo lo nasconderebbe proprio a chi sta cercando di
     capire quando ci si e' fermati. La barra e' proporzionale al giorno piu'
     lungo, non a un massimo fisso: le giornate cambiano di un fattore dieci e
     una scala fissa le appiattirebbe tutte. */
  const gg = d.perGiorno || [];
  const perData = new Map(gg.map((r) => [r.giorno, { ...r }]));

  /* I GIRI IN CORSO CONTANO NELLA BARRA DI OGGI.
     Nel registro un giro entra quando si chiude, non quando lavora: con giri
     da tre quarti d'ora la barra di oggi resterebbe vuota mentre tre lettori
     stanno macinando, e chi guarda concluderebbe che oggi non si e' fatto
     niente. Qui si sommano i vivi a mano, col tempo trascorso finora. */
  const adesso = new Date();
  const chiaveOggi = adesso.getFullYear() + "-" + String(adesso.getMonth() + 1).padStart(2, "0") +
    "-" + String(adesso.getDate()).padStart(2, "0");
  if (d.vivi && d.vivi.length) {
    const o = perData.get(chiaveOggi) || { giorno: chiaveOggi, aperte: 0, conPrezzo: 0, minuti: 0, giri: 0 };
    for (const v of d.vivi) {
      o.aperte += v.aperte || 0;
      o.conPrezzo += v.conPrezzo || 0;
      o.minuti += Math.max(0, Math.round((Date.now() - new Date(v.inizio).getTime()) / 60000));
      o.giri += 1;
    }
    perData.set(chiaveOggi, o);
  }
  const maxMin = Math.max(1, ...[...perData.values()].map((r) => r.minuti));
  const oggi = new Date();
  const giorni = [];
  for (let i = 13; i >= 0; i--) {
    const x = new Date(oggi.getTime() - i * 86400000);
    const chiave = x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" +
      String(x.getDate()).padStart(2, "0");
    giorni.push({ chiave, data: x, r: perData.get(chiave) });
  }
  const NOMI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  document.getElementById("pergiorno").innerHTML =
    '<div class="gg cap"><span>giorno</span><span>tempo di lettura</span><span>ore</span><span>aperte</span><span>resa</span></div>' +
    giorni.map((g, i) => {
      const r = g.r;
      const min = r ? r.minuti : 0;
      const resa = r && r.aperte > 0 ? Math.round((r.conPrezzo / r.aperte) * 100) : 0;
      const classe = !r ? "vuoto" : i === giorni.length - 1 ? "oggi" : "";
      const qc = !r ? "zero" : resa < 40 ? "bassa" : "";
      const ore = min >= 60 ? (min / 60).toFixed(1) + "h" : min > 0 ? min + "m" : "&mdash;";
      return \`<div class="gg \${classe}">
        <span class="sig">\${NOMI[g.data.getDay()]} \${g.data.getDate()}</span>
        <span class="barra"><i style="width:\${Math.round((min / maxMin) * 100)}%"></i></span>
        <span class="num">\${ore}</span>
        <span class="num">\${r ? n(r.aperte) : "&mdash;"}</span>
        <span class="qta \${qc}">\${r ? resa + "%" : "&mdash;"}</span>
      </div>\`;
    }).join("");

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

/* LE VISTE.
   Si sceglie dall&rsquo;indirizzo, cos&igrave; il ricaricamento automatico ogni cinque
   secondi non riporta alla prima: senza, chi guarda la raccolta si vedrebbe
   sbattuto sull&rsquo;operativa a ogni giro. */
function mostraVista(quale) {
  const q = quale || "operativa";
  for (const sez of document.querySelectorAll("section[data-vista]")) {
    sez.hidden = sez.dataset.vista !== q;
  }
  for (const a of document.querySelectorAll(".viste a")) {
    a.classList.toggle("acceso", a.dataset.vista === q);
  }
}
mostraVista((location.hash || "#operativa").slice(1));
window.addEventListener("hashchange", () => mostraVista(location.hash.slice(1)));

document.getElementById("avvia").addEventListener("click", (e) => comanda("/pannello/avvia", e.currentTarget));
document.getElementById("ferma").addEventListener("click", (e) => comanda("/pannello/ferma", e.currentTarget));

aggiorna();
setInterval(aggiorna, 5000);
</script>
</body></html>`;
}
