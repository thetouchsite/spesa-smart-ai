/**
 * Riempire il magazzino dei prezzi: il vero lavoro della notte.
 *
 * PERCHE' STA QUI E NON PIU' IN UNO SCRIPT
 * ----------------------------------------
 * Perche' era uno script e basta, e nessuno lo lanciava. Il lavoro notturno
 * rinfrescava gli INDIRIZZI — e lo dice ancora nel suo commento, «qui dentro
 * non ci sono prezzi» — mentre i prezzi li leggeva l'app, una pagina alla
 * volta, mentre l'utente aspettava il piano.
 *
 * Cosi' il magazzino dei prezzi si riempiva solo se qualcuno si ricordava di
 * lanciare `riempi-prezzi.ts` a mano. L'architettura voluta era un'altra: di
 * notte si riempie, di giorno si legge. Mettendo il lavoro qui lo possono
 * chiamare tutti e due — lo script, per farlo adesso; il notturno, per farlo
 * da solo.
 *
 * QUANTE VOCI, E PERCHE' COSI' POCHE
 * ----------------------------------
 * Non servono i due milioni di prodotti che le sitemap dichiarano. La spesa
 * vera ha un vocabolario minuscolo e stabilissimo — latte, pane, uova, pollo,
 * pasta, pomodori — e quelle voci tornano in quasi tutte le liste dello stesso
 * paese. Ne bastano qualche centinaio per paese, ed e' la differenza fra un
 * lavoro di mezz'ora e uno impossibile.
 *
 * SUL RISPETTO DEI NEGOZI
 * -----------------------
 * Questo lavoro TOGLIE carico, non lo aggiunge: le stesse pagine che oggi si
 * aprono a ogni richiesta utente qui si aprono una volta sola. Con cento
 * persone su Madrid si passa da seimila richieste a novanta. Ed e' traffico
 * prevedibile, di notte, a ritmo costante — non raffiche quando capita.
 */

import { catalogoDi, cercaNelCatalogo } from "./catalogo.js";
import { FONTI } from "./catalogo-fonti.js";
import { verifyProductPage } from "./price-page.js";
import { prezziGiaVisti, salvaPrezzi, statoMagazzino, type PrezzoSalvato } from "./prezzi-magazzino.js";
/**
 * La spesa di base, nella lingua di chi la compra.
 *
 * Scritte a mano e nella lingua del negozio: il catalogo di Alcampo dice
 * `leche`, non `latte`, e una voce nella lingua sbagliata non trova niente.
 *
 * Sono le cose che finiscono in quasi ogni lista: non un catalogo, la spesa
 * che si fa davvero.
 */
const SPESA: Record<string, string[]> = {
  IT: [
    "latte intero", "latte parzialmente scremato", "pane", "pane integrale", "uova",
    "burro", "yogurt bianco", "yogurt greco", "parmigiano", "mozzarella", "ricotta",
    "prosciutto cotto", "prosciutto crudo", "petto di pollo", "macinato di manzo",
    "salmone", "tonno in scatola", "merluzzo", "pasta", "spaghetti", "riso",
    "farina", "zucchero", "sale", "olio extravergine di oliva", "aceto",
    "passata di pomodoro", "pomodori pelati", "pomodori", "insalata", "patate",
    "cipolle", "carote", "zucchine", "melanzane", "peperoni", "spinaci", "broccoli",
    "aglio", "limoni", "mele", "banane", "arance", "pere", "fragole", "uva",
    "caffe", "te", "acqua naturale", "succo di frutta", "biscotti", "cereali",
    "marmellata", "miele", "cioccolato", "lenticchie", "ceci", "fagioli", "piselli",
    "funghi",
  ],
  ES: [
    "leche entera", "leche desnatada", "pan", "pan integral", "huevos",
    "mantequilla", "yogur natural", "yogur griego", "queso", "queso rallado",
    "jamon serrano", "jamon cocido", "pechuga de pollo", "carne picada",
    "salmon", "atun en lata", "merluza", "pasta", "macarrones", "arroz",
    "harina", "azucar", "sal", "aceite de oliva", "vinagre",
    "tomate frito", "tomate triturado", "tomates", "lechuga", "patatas",
    "cebollas", "zanahorias", "calabacin", "berenjena", "pimientos", "espinacas",
    "brocoli", "ajo", "limones", "manzanas", "platanos", "naranjas", "peras",
    "fresas", "uvas", "cafe", "te", "agua", "zumo de naranja", "galletas",
    "cereales", "mermelada", "miel", "chocolate", "lentejas", "garbanzos",
    "judias", "guisantes", "champinones", "pollo entero",
  ],
  FR: [
    "lait entier", "lait demi ecreme", "pain", "pain complet", "oeufs",
    "beurre", "yaourt nature", "fromage", "emmental", "camembert",
    "jambon", "blanc de poulet", "viande hachee", "saumon", "thon en boite",
    "cabillaud", "pates", "spaghetti", "riz", "farine", "sucre", "sel",
    "huile d olive", "vinaigre", "coulis de tomate", "tomates", "salade",
    "pommes de terre", "oignons", "carottes", "courgettes", "aubergines",
    "poivrons", "epinards", "brocoli", "ail", "citrons", "pommes", "bananes",
    "oranges", "poires", "fraises", "raisin", "cafe", "the", "eau",
    "jus d orange", "biscuits", "cereales", "confiture", "miel", "chocolat",
    "lentilles", "pois chiches", "haricots", "petits pois", "champignons",
    "poulet", "creme fraiche", "farine de ble",
  ],
  GB: [
    "whole milk", "semi skimmed milk", "bread", "wholemeal bread", "eggs",
    "butter", "natural yoghurt", "greek yoghurt", "cheddar cheese", "mozzarella",
    "ham", "chicken breast", "minced beef", "salmon", "tuna", "cod",
    "pasta", "spaghetti", "rice", "flour", "sugar", "salt", "olive oil",
    "vinegar", "chopped tomatoes", "tomatoes", "lettuce", "potatoes",
    "onions", "carrots", "courgettes", "aubergine", "peppers", "spinach",
    "broccoli", "garlic", "lemons", "apples", "bananas", "oranges", "pears",
    "strawberries", "grapes", "coffee", "tea", "water", "orange juice",
    "biscuits", "cereal", "jam", "honey", "chocolate", "lentils", "chickpeas",
    "beans", "peas", "mushrooms", "whole chicken", "cream", "yoghurt",
  ],
  PT: [
    "leite meio gordo", "leite gordo", "pao", "pao integral", "ovos",
    "manteiga", "iogurte natural", "queijo", "fiambre", "presunto",
    "peito de frango", "carne picada", "salmao", "atum em lata", "bacalhau",
    "massa", "esparguete", "arroz", "farinha", "acucar", "sal",
    "azeite", "vinagre", "tomate pelado", "tomates", "alface", "batatas",
    "cebolas", "cenouras", "courgette", "beringela", "pimentos", "espinafres",
    "brocolos", "alho", "limoes", "macas", "bananas", "laranjas", "peras",
    "morangos", "uvas", "cafe", "cha", "agua", "sumo de laranja", "bolachas",
    "cereais", "compota", "mel", "chocolate", "lentilhas", "grao de bico",
    "feijao", "ervilhas", "cogumelos", "frango",
  ],
  DE: [
    "vollmilch", "fettarme milch", "brot", "vollkornbrot", "eier",
    "butter", "naturjoghurt", "kase", "gouda", "mozzarella",
    "schinken", "hahnchenbrust", "hackfleisch", "lachs", "thunfisch",
    "nudeln", "spaghetti", "reis", "mehl", "zucker", "salz", "olivenol",
    "essig", "passierte tomaten", "tomaten", "salat", "kartoffeln",
    "zwiebeln", "karotten", "zucchini", "aubergine", "paprika", "spinat",
    "brokkoli", "knoblauch", "zitronen", "apfel", "bananen", "orangen",
    "birnen", "erdbeeren", "trauben", "kaffee", "tee", "wasser",
    "orangensaft", "kekse", "musli", "marmelade", "honig", "schokolade",
    "linsen", "kichererbsen", "bohnen", "erbsen", "champignons", "hahnchen",
  ],
};

/** Quanti candidati provare per voce: lo stesso numero che usa l'API. */
const CANDIDATI = 6;
/** Quante pagine insieme. Otto, come di giorno: non si va piu' forte di notte. */
const INSIEME = 8;
/** Una pausa fra una pagina e l'altra: siamo ospiti, anche alle tre di notte. */
const PAUSA_MS = 120;

const attendi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Finestra scorrevole: appena una pagina finisce ne parte un'altra. */
async function aBrani<T>(cose: T[], quante: number, lavoro: (c: T) => Promise<void>) {
  let prossima = 0;
  const lavoratore = async () => {
    while (prossima < cose.length) await lavoro(cose[prossima++]);
  };
  await Promise.all(Array.from({ length: Math.min(quante, cose.length) }, lavoratore));
}

const orologio = (s: number) =>
  `${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, "0")}s`;

export async function riempiPrezzi(paese: string, quanteVoci: number): Promise<void> {
  const voci = (SPESA[paese] ?? []).slice(0, quanteVoci);
  if (voci.length === 0) {
    console.log(`${paese}  nessuna lista della spesa scritta per questo paese`);
    return;
  }

  const inizio = Date.now();
  const cat = await catalogoDi(paese);
  if (!cat) {
    console.log(`${paese}  catalogo non caricato`);
    return;
  }
  console.log(
    `\n${paese}  catalogo pronto: ${cat.voci.length.toLocaleString("it-IT")} prodotti ` +
      `da ${cat.insegne.length} insegne · ${voci.length} voci da risolvere`,
  );

  // Prima si raccolgono tutti gli indirizzi candidati, poi si guarda quali
  // mancano: cosi' il magazzino si interroga una volta sola invece di
  // sessanta.
  /* LE INSEGNE CHE UN PREZZO NON LO DANNO MAI NON SI APRONO.
     E' diverso dall'ordinare per resa, che e' una preferenza fra scommesse:
     `resa: 0` non e' una scommessa sfortunata, e' una certezza misurata. Sei
     insegne italiane su diciannove vogliono che uno acceda per vedere un
     prezzo — CoopShop, Esselunga, Basko, Ali', Tigros, Pam — e le loro pagine
     rispondono benissimo, con tutto tranne la cifra.

     Aprirle ogni notte e' tempo buttato due volte: nostro, e loro. Misurato su
     una spesa italiana di sedici voci: ventitre pagine aperte in 6,2 secondi,
     di cui sei su queste insegne — 1,7 secondi, il 27%, per raccogliere sei
     «no» che sapevamo gia' in partenza.

     Restano nel catalogo, e va bene cosi': un nome e un indirizzo valgono
     anche senza prezzo, e per qualche prodotto di nicchia sono l'unica
     risposta. Quel che non devono fare e' costarci una pagina aperta. */
  const mute = new Set(
    FONTI.filter((f) => f.paese === paese.toUpperCase() && f.resa === 0).map((f) => f.insegna),
  );

  const candidati: Array<{ url: string; nome: string; insegna: string }> = [];
  let scartate = 0;
  for (const voce of voci) {
    for (const c of await cercaNelCatalogo(paese, voce, CANDIDATI)) {
      if (mute.has(c.insegna)) { scartate++; continue; }
      candidati.push({ url: c.url, nome: c.nome, insegna: c.insegna });
    }
  }
  if (scartate > 0) {
    console.log(`${paese}  ${scartate} candidati saltati: ${[...mute].join(", ")} il prezzo non lo pubblicano`);
  }

  const unici = [...new Map(candidati.map((c) => [c.url, c])).values()];
  const gia = await prezziGiaVisti(unici.map((c) => c.url));
  const daAprire = unici.filter((c) => !gia.has(c.url));

  console.log(
    `${paese}  ${unici.length} schede distinte · ${gia.size} gia' fresche · ` +
      `${daAprire.length} da aprire`,
  );
  if (daAprire.length === 0) return;

  const raccolte: PrezzoSalvato[] = [];
  let conPrezzo = 0;
  let fatte = 0;

  await aBrani(daAprire, INSIEME, async (c) => {
    const v = await verifyProductPage(c.url);
    raccolte.push({
      url: c.url,
      prezzo: v.page?.current ?? null,
      valuta: v.page?.currency ?? "",
      nome: c.nome.charAt(0).toUpperCase() + c.nome.slice(1),
      insegna: c.insegna,
      verifica: v.status,
      visto: new Date(),
    });
    if (v.page?.current != null) conPrezzo++;

    // Si salva a blocchi invece che alla fine: se lo script si ferma a meta',
    // il lavoro fatto resta in magazzino.
    if (raccolte.length >= 50) {
      await salvaPrezzi(raccolte.splice(0, raccolte.length));
    }

    if (++fatte % 25 === 0) {
      process.stdout.write(
        `\r${paese}  ${fatte}/${daAprire.length} aperte · ${conPrezzo} con prezzo   `,
      );
    }
    await attendi(PAUSA_MS);
  });

  if (raccolte.length > 0) await salvaPrezzi(raccolte);

  const secondi = (Date.now() - inizio) / 1000;
  console.log(
    `\r${paese}  fatto: ${fatte} schede aperte, ${conPrezzo} con prezzo ` +
      `(${Math.round((conPrezzo / Math.max(1, fatte)) * 100)}%) in ${orologio(secondi)}          `,
  );
}
