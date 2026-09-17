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
import { tutteLeFonti } from "./catalogo-fonti.js";
import { verifyProductPage } from "./price-page.js";
import { prezziGiaVisti, salvaPrezzi, statoMagazzino, type PrezzoSalvato } from "./prezzi-magazzino.js";
import { LINGUA_DEL_PAESE, traduciVoce } from "./vocabolario.js";
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

/**
 * La lista della spesa di un paese, scritta a mano o ricavata.
 *
 * QUINDICI PAESI AVEVANO IL CATALOGO E ZERO PREZZI.
 * Le liste qui sopra sono sei, scritte a mano. Per tutti gli altri questa
 * funzione rispondeva «nessuna lista» e il lavoro notturno se ne andava —
 * catalogo pieno, magazzino dei prezzi vuoto. Irlanda, Austria, Belgio,
 * Sudafrica, Brasile, Svizzera: cataloghi buoni, mai un prezzo salvato.
 *
 * Il dizionario della spesa pero' copre sei LINGUE e le mappa su ventidue
 * PAESI — un irlandese compra in inglese, un austriaco in tedesco. Quindi
 * dove la lista scritta a mano non c'e' si traduce quella italiana, voce per
 * voce, con lo stesso dizionario che usa la ricerca.
 *
 * SI BUTTANO LE VOCI CHE NON SI SANNO TRADURRE, E NON E' UNA PERDITA.
 * Meglio sessanta voci di cui quaranta giuste che sessanta di cui venti
 * cercate con parole italiane in un catalogo tedesco: quelle non trovano
 * niente, e intanto aprono pagine.
 *
 * Una lista scritta a mano resta sempre meglio di una tradotta — «olio
 * extravergine di oliva» e' piu' preciso di «olio» — quindi dove c'e' vince
 * lei. Questa e' la rete, non la regola.
 */
/**
 * Le parole con cui cercare nelle API a blocchi.
 *
 * Sono le stesse voci della spesa: quel che la gente compra. Cercarle una per
 * una in un'API che torna cento risultati copre migliaia di prodotti con
 * poche decine di richieste — e copre proprio quelli giusti, invece di un
 * campione qualunque del catalogo.
 */
export function paroleDellaSpesa(paese: string): string[] {
  return listaDellaSpesa(paese).voci;
}

function listaDellaSpesa(paese: string): { voci: string[]; come: string } {
  const aMano = SPESA[paese];
  if (aMano?.length) return { voci: aMano, come: "scritta a mano" };

  const lingua = LINGUA_DEL_PAESE[paese];
  if (!lingua) return { voci: [], come: "nessuna lingua nota" };

  const base = SPESA.IT ?? [];
  const tradotte: string[] = [];
  for (const voce of base) {
    const { tradotta, sconosciute } = traduciVoce(voce, lingua);
    if (sconosciute.length > 0) continue;
    const pulita = tradotta.trim();
    if (pulita.length >= 3 && !tradotte.includes(pulita)) tradotte.push(pulita);
  }
  return { voci: tradotte, come: `tradotta in ${lingua} dal dizionario` };
}

/**
 * Quando non c'e' una lista della spesa: si prezza a tappeto.
 *
 * VENTINOVE PAESI AVEVANO IL CATALOGO E ZERO PREZZI.
 * Il notturno prezza le voci di una lista, e le liste esistono per sedici
 * paesi su trentasei. Per gli altri venti il dizionario non conosce la lingua,
 * quindi `riempiPrezzi` rispondeva «nessuna lista» e se ne andava: 903.868
 * indirizzi salvati e mai quotati, e l'app costretta ad aprire le pagine dal
 * vivo mentre l'utente aspetta — esattamente cio' che il magazzino doveva
 * togliere.
 *
 * Ma per RIEMPIRE il magazzino la lista non serve. Serve a decidere QUALI
 * prezzi prendere per primi, ed e' la cosa giusta dove la lista c'e': si
 * prezza quel che la gente chiede. Dove non c'e', qualunque prezzo vale piu'
 * di nessun prezzo.
 *
 * PERCHE' NON SI RICAVA UNA LISTA DALLE PAROLE PIU' FREQUENTI
 * -----------------------------------------------------------
 * Sembrava l'idea buona: i nomi dei prodotti lituani sono in lituano, e le
 * parole piu' frequenti di un catalogo alimentare dovrebbero essere la spesa
 * di base. Provato, e non regge:
 *
 *   LT   gerimas (bevanda), suris (formaggio)... ma anche knyga (LIBRO) e
 *        sampunas (shampoo)
 *   PL   woda, herbata, makaron... e karma (cibo per animali), krem
 *   NO   riesling, chardonnay, brut, 2023, 2022 — il catalogo norvegese e'
 *        quasi tutto VINO
 *
 * Una lista cosi' manderebbe il lavoro notturno a prezzare libri e shampoo.
 * Meglio non fingere di avere una lista: si prende dal catalogo a passo
 * costante e si dichiara che e' un campione, non una scelta.
 *
 * SI SPARGE, NON SI PRENDONO I PRIMI
 * ----------------------------------
 * A passo costante lungo tutto il catalogo, e un giro per insegna prima di
 * tornare sulla stessa: prendere i primi mille significherebbe mille prodotti
 * della stessa lettera dello stesso negozio.
 */
function aTappeto(
  voci: ReadonlyArray<{ url: string; nome: string; insegna: string }>,
  mute: ReadonlySet<string>,
  quanti: number,
): Array<{ url: string; nome: string; insegna: string }> {
  const perInsegna = new Map<string, Array<{ url: string; nome: string; insegna: string }>>();
  for (const v of voci) {
    if (mute.has(v.insegna)) continue;
    const suoi = perInsegna.get(v.insegna) ?? [];
    suoi.push(v);
    perInsegna.set(v.insegna, suoi);
  }
  if (perInsegna.size === 0) return [];

  /* Da ogni insegna la sua quota, presa a passo costante. */
  const quota = Math.max(1, Math.ceil(quanti / perInsegna.size));
  const mazzi: Array<Array<{ url: string; nome: string; insegna: string }>> = [];
  for (const suoi of perInsegna.values()) {
    const passo = Math.max(1, Math.floor(suoi.length / quota));
    const presi: Array<{ url: string; nome: string; insegna: string }> = [];
    for (let i = 0; i < quota && i * passo < suoi.length; i++) presi.push(suoi[i * passo]);
    mazzi.push(presi);
  }

  /* A giro: uno per insegna prima di tornare sulla stessa. */
  const scelti: Array<{ url: string; nome: string; insegna: string }> = [];
  for (let i = 0; scelti.length < quanti; i++) {
    let aggiunto = false;
    for (const m of mazzi) {
      if (i >= m.length) continue;
      scelti.push(m[i]);
      aggiunto = true;
      if (scelti.length >= quanti) break;
    }
    if (!aggiunto) break;
  }
  return scelti;
}

export async function riempiPrezzi(paese: string, quanteVoci: number): Promise<void> {
  const { voci: tutte, come } = listaDellaSpesa(paese);
  const voci = tutte.slice(0, quanteVoci);
  const conLista = voci.length > 0;
  console.log(
    conLista
      ? `${paese}  lista ${come}: ${voci.length} voci`
      : `${paese}  nessuna lista (${come}): si prezza a tappeto`,
  );

  const inizio = Date.now();
  const cat = await catalogoDi(paese);
  if (!cat) {
    console.log(`${paese}  catalogo non caricato`);
    return;
  }
  console.log(
    `\n${paese}  catalogo pronto: ${cat.voci.length.toLocaleString("it-IT")} prodotti ` +
      `da ${cat.insegne.length} insegne · ${conLista ? `${voci.length} voci da risolvere` : "campione a tappeto"}`,
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
    tutteLeFonti()
      .filter((f) => f.paese === paese.toUpperCase() && f.resa === 0)
      .map((f) => f.insegna),
  );

  let candidati: Array<{ url: string; nome: string; insegna: string }> = [];
  let scartate = 0;

  if (conLista) {
    for (const voce of voci) {
      for (const c of await cercaNelCatalogo(paese, voce, CANDIDATI)) {
        if (mute.has(c.insegna)) { scartate++; continue; }
        candidati.push({ url: c.url, nome: c.nome, insegna: c.insegna });
      }
    }
  }

  /* POI SI COMPLETA A TAPPETO, ANCHE QUANDO LA LISTA C'E'.
     La prima versione faceva una cosa sola delle due, e usciva un risultato
     rovesciato: i paesi CON una lista scritta a mano finivano meno coperti di
     quelli senza. Misurato nello stesso giro: Italia 89 pagine aperte,
     Lituania 356, Romania 360.

     Il motivo e' che una lista di sessanta voci per sei candidati non fa
     trecentosessanta schede diverse: i candidati si ripetono fra una voce e
     l'altra, molti sono gia' freschi dal giro precedente, e le insegne mute si
     saltano. Resta un pugno di pagine, e intanto centoventinovemila indirizzi
     italiani restano senza prezzo.

     Adesso la lista viene prima, perche' e' quel che la gente chiede davvero,
     e poi si riempie il budget rimasto pescando dal catalogo. Le due cose non
     si tolgono niente a vicenda: la lista sceglie, il tappeto copre. */
  const budget = quanteVoci * CANDIDATI;
  if (candidati.length < budget) {
    const presi = new Set(candidati.map((c) => c.url));
    const extra = aTappeto(
      cat.voci.map((v) => ({ url: v.url, nome: v.nome, insegna: v.insegna })),
      mute,
      budget,
    ).filter((c) => !presi.has(c.url));
    const quanti = Math.min(extra.length, budget - candidati.length);
    if (quanti > 0) {
      candidati.push(...extra.slice(0, quanti));
      console.log(`${paese}  completato a tappeto: +${quanti} schede`);
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
