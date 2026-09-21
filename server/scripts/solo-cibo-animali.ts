/**
 * Nei negozi per animali si tiene il cibo e si butta il resto.
 *
 * LA DECISIONE, E DI CHI E'
 * ------------------------
 * Il catalogo ha quattro negozi per animali — Fressnapf, Pets at Home,
 * Petstop, Zooplus France — per 55.088 indirizzi e 54.815 prodotti gia'
 * contati. Altri tre (Zooplus, Arcaplanet, Tiendanimal) erano stati esclusi
 * proprio perche' negozi per animali: la regola era applicata a meta'.
 *
 * Antonio ha scelto la terza strada: tenerli, ma solo per il cibo. E' la
 * risposta giusta — il cibo per animali si compra facendo la spesa, una
 * lettiera no — ed e' anche la piu' cara, perche' va deciso prodotto per
 * prodotto invece che insegna per insegna.
 *
 * PERCHE' NON BASTA `alimentarePlausibile`
 * ----------------------------------------
 * Perche' e' tarato sul cibo per PERSONE, e su questi cataloghi fa
 * l'esatto contrario di quel che serve. Misurato su Fressnapf:
 *
 *     TENUTI    savic vogelkaefig primo 60           (una gabbia per uccelli)
 *               biokats diamond care fresh 10 l      (lettiera per gatti)
 *               anione toiletenvorleger 37x45 cm     (un tappetino da bagno)
 *     BUTTATI   happy cat trockenfutter katze adult  (crocchette)
 *               premiere nassfutter katze ragout     (scatolette)
 *               katzenliebe adult bio rind 15x100 g  (cibo umido)
 *
 * Non e' un difetto di quella funzione: «trockenfutter» non e' una parola che
 * descrive cibo umano, e «bio rind» senza contesto puo' essere qualunque cosa.
 * Serve un vocabolario diverso, non uno piu' largo.
 *
 * COME DECIDE, IN DUE PASSI
 * -------------------------
 *   1. se il nome contiene una parola di ACCESSORIO — gabbia, lettiera,
 *      guinzaglio, ciotola, acquario — si butta, sempre. Vince su tutto:
 *      «snack ball» e' un giocattolo anche se dice «snack».
 *   2. se contiene una parola di CIBO — futter, food, snack, croccantini,
 *      pate — si tiene. Altrimenti si butta.
 *
 * Nel dubbio si BUTTA, ed e' il contrario di come ragioniamo di solito. Qui
 * pero' un errore in piu' costa un prodotto perso su un'insegna marginale; un
 * errore in meno mette un guinzaglio nella lista della spesa di un cliente.
 *
 * I REPARTI DI PETS AT HOME
 * -------------------------
 * Il suo catalogo non e' fatto di schede: «dog food», «dry dog food»,
 * «listing». Sono reparti, e un reparto ha venti prodotti con venti prezzi di
 * cui ne leggiamo uno. Passano tutti e due i filtri qui sopra — «dog food»
 * contiene «food» — quindi vanno riconosciuti a parte: un nome di due o tre
 * parole generiche, senza marca, senza peso, senza numeri, non e' un prodotto.
 *
 *   npx tsx --env-file-if-exists=.env scripts/solo-cibo-animali.ts
 *   npx tsx --env-file-if-exists=.env scripts/solo-cibo-animali.ts --scrivi
 */

import { prezzi } from "../src/base/db.js";
import { catalogoSalvato, salvaCatalogo } from "../src/api/catalogo-magazzino.js";
import { assicuraFonti } from "../src/api/catalogo-fonti.js";
import { improntaUrl, numeroInsegnaPubblico } from "../src/api/prezzi-magazzino.js";

const scrivi = process.argv.includes("--scrivi");
const arg = (nome: string) =>
  process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : undefined;
const solo = arg("--solo");

/** I quattro negozi per animali rimasti in elenco. */
const NEGOZI: Array<[string, string]> = [
  ["DE", "Fressnapf"],
  ["GB", "Pets at Home"],
  ["IE", "Petstop"],
  ["FR", "Zooplus France"],
];

/**
 * Accessori. Vince su tutto il resto.
 *
 * Quattro lingue perche' quattro sono i paesi. Le parole sono quelle che
 * compaiono DAVVERO nei loro cataloghi, non quelle che verrebbero in mente:
 * «toiletenvorleger» e «vogelkaefig» le ho lette li' dentro.
 *
 * `poop` e `holder` sono entrati al secondo giro: «3 peaks dog walking treat
 * and poop bag black» e' un porta-sacchetti, e passava perche' nel nome c'e'
 * «treat». Una parola di cibo dentro il nome di un accessorio e' il caso
 * normale in questi negozi, non l'eccezione: per questo gli accessori si
 * guardano PRIMA e vincono su tutto.
 */
const ACCESSORIO =
  /\b(kaefig|kafig|cage|gabbia|jaula|streu|litter|lettiera|liti[eè]re|toilette|toiletten?vorleger|halsband|leine|leash|guinzaglio|laisse|collar|collier|napf|bowl|ciotola|gamelle|spielzeug|toy|giocatt|jouet|kratzbaum|scratching|transportbox|carrier|trasportino|aquarium|acquario|terrarium|filter|pumpe|pump|heizung|lampe|lamp|decke|blanket|coperta|panier|bed|cuccia|korb|basket|shampoo|buerste|brush|spazzola|brosse|schere|clipper|tondeuse|zaun|fence|tuer|door|klappe|flap|geschirr|harness|pettorina|harnais|windel|diaper|streusch|sand|kies|gravel|substrat|heu|stroh|straw|einstreu|poop|kot|waste|dispenser|holder|wipes|salviett|lead|muzzle|maulkorb|crate|kennel|hutch|vivarium|tank|bedding|clicker|whistle|buggy|stroller|rampe|ramp|treppe|stairs|zubehoer|accessoire|accessori)\b/i;

/**
 * Cibo. Serve che ci sia, dopo che gli accessori sono gia' usciti.
 */
const CIBO =
  /\b(futter|trockenfutter|nassfutter|alleinfutter|erganzungsfutter|leckerli|snack|snacks|kausnack|kaustange|food|feed|treat|treats|kibble|biscuit|biscotti|croccantini|crocchette|umido|patee|pat[eé]|alimento|comida|pienso|nourriture|croquette|croquettes|friandise|bocconcini|mangime|menu|men[uù]|ragout|filet|fillet|chunks|mousse|terrine|dose|dosen|beutel|pouch|bustina|lattina|sacco|sack|milch|milk|latte|lait|joghurt|yoghurt|vitamin|vitamine|supplement|integrat)\b/i;

/**
 * Un reparto travestito da prodotto.
 *
 * «dog food», «dry dog food», «puppy food», «listing»: tre parole generiche,
 * nessuna marca, nessun peso, nessun numero. Una scheda vera di questi negozi
 * si chiama «happy cat minkas trockenfutter katze adult hairball control
 * gefluegel 10 kg» — marca, tipo, animale, eta', gusto, peso.
 */
function eUnReparto(nome: string): boolean {
  const parole = nome.trim().split(/\s+/);
  if (parole.length > 4) return false;
  /* Un numero quasi sempre e' un peso o una quantita', e i reparti non ne
     hanno: basta a distinguere «dry dog food» da «bonzo dog food 10 kg». */
  if (/\d/.test(nome)) return false;
  return true;
}

/**
 * Il reparto si riconosce anche dall'INDIRIZZO, e li' non ci sono dubbi.
 *
 * Pets at Home lo dice in chiaro: `/product/listing/dog/dog-food` e' un
 * reparto, `/product/pets-at-home-christmas-tree-cookies/7156046P` e' una
 * scheda. Il nome no — «dog food for health conditions» ha cinque parole e
 * nessun numero, quindi passa il controllo qui sopra e sembra un prodotto.
 *
 * Zooplus Francia pubblica SOLO indirizzi cosi': 269 voci, tutte
 * `/shop/animaux-ferme/reservoirs-cages-accessoires/...`. Nemmeno una scheda.
 */
const INDIRIZZO_DI_REPARTO = /\/(listing|shop)\//i;

/** Vero se questa scheda e' cibo per animali e non un accessorio o un reparto. */
export function eCiboPerAnimali(nome: string, url = ""): boolean {
  if (url && INDIRIZZO_DI_REPARTO.test(url)) return false;
  const n = nome.toLowerCase();
  if (eUnReparto(n)) return false;
  if (ACCESSORIO.test(n)) return false;
  return CIBO.test(n);
}

await assicuraFonti();
const P = await prezzi();
const n = (v: number) => v.toLocaleString("it-IT");

console.log("");
console.log("SOLO IL CIBO, NEI NEGOZI PER ANIMALI");
console.log("");

let tenuteTot = 0;
let butteTot = 0;
let righeVia = 0;

for (const [pa, ins] of NEGOZI) {
  if (solo && !ins.toLowerCase().includes(solo.toLowerCase())) continue;

  const voci = await catalogoSalvato(pa, ins);
  if (!voci || voci.length === 0) {
    console.log(`  ${(pa + "|" + ins).padEnd(22)} catalogo non leggibile, salto`);
    continue;
  }

  const tenute = voci.filter((v) => eCiboPerAnimali(v.nome, v.url));
  const buttate = voci.filter((v) => !eCiboPerAnimali(v.nome, v.url));
  tenuteTot += tenute.length;
  butteTot += buttate.length;

  console.log(
    `  ${(pa + "|" + ins).padEnd(22)} ${n(voci.length).padStart(7)} voci · ` +
      `${n(tenute.length).padStart(7)} cibo · ${n(buttate.length).padStart(7)} fuori ` +
      `(${Math.round((tenute.length / voci.length) * 100)}% tenuto)`,
  );
  console.log(`       tengo:  ${tenute.slice(0, 3).map((x) => x.nome.slice(0, 46)).join(" | ")}`);
  console.log(`       butto:  ${buttate.slice(0, 3).map((x) => x.nome.slice(0, 46)).join(" | ")}`);

  if (!scrivi) continue;

  if (tenute.length === 0) {
    console.log(`       niente cibo riconosciuto: il catalogo NON si tocca, guarda gli esempi`);
    continue;
  }

  await salvaCatalogo(pa, ins, tenute);

  /* E si tolgono i prezzi di quel che e' uscito: il catalogo riscritto ferma i
     prodotti futuri e non tocca quelli gia' in magazzino. Senza questo pezzo
     resterebbero li' a contare, senza piu' un indirizzo che spieghi da dove
     vengono — lo stesso difetto dei doppioni di lingua. */
  const c = numeroInsegnaPubblico(ins);
  const impronte = buttate.map((v) => improntaUrl(v.url));
  let via = 0;
  for (let i = 0; i < impronte.length; i += 2000) {
    const e = await P.deleteMany({ c, _id: { $in: impronte.slice(i, i + 2000) } } as never);
    via += e.deletedCount;
  }
  righeVia += via;
  console.log(`       riscritto · ${n(via)} righe di prezzo tolte`);
}

console.log("");
console.log(`  ${n(tenuteTot)} schede di cibo tenute · ${n(butteTot)} fuori`);
if (scrivi) console.log(`  ${n(righeVia)} prodotti tolti dal totale: erano accessori o reparti`);
else console.log("\n  Niente e' stato toccato. Per farlo:  ... solo-cibo-animali.ts --scrivi");
console.log("");
process.exit(0);
