/**
 * Le parole della spesa, nelle lingue dei paesi che copriamo.
 *
 * PERCHE' UN DIZIONARIO E NON UNA TRADUZIONE
 * ------------------------------------------
 * Un italiano a Londra chiede «Funghi» e nelle sitemap britanniche quella
 * parola non esiste: c'e' «mushrooms». Senza un ponte fra le due, un catalogo
 * da settantamila prodotti risponde «nessun negozio ha questo prodotto».
 *
 * La prima cura era chiedere al modello di tradurre la lista a ogni richiesta.
 * Funzionava, ma ha tre difetti che si sono visti tutti e tre in una sera:
 *
 *   SI FERMA.       Finita la quota Google, la traduzione non partiva e Londra
 *                   dava tre voci su sei invece di otto su otto. Non un errore
 *                   visibile: semplicemente meta' della spesa spariva.
 *   COSTA.          $0,0037 a piano, il venti per cento del totale, per un
 *                   lavoro che un file risolve a costo zero.
 *   NON SI RIPETE.  Stessa lista domani, traduzione magari diversa. Un'API di
 *                   dati non puo' permetterselo.
 *
 * Il dizionario e' deterministico, gratis, istantaneo e — la cosa che conta di
 * piu' — CORREGGIBILE: quando sbaglia si apre il file, si trova la riga e si
 * sistema. Il modello sbaglia in un modo che non si puo' ne' prevedere ne'
 * riparare.
 *
 * E' la stessa tesi che `sinonimi.ts` sostiene per il catalano dentro la
 * Spagna. Qui si estende al caso fra paesi diversi.
 *
 * PERCHE' BASTANO DUECENTO PAROLE
 * -------------------------------
 * Perche' una lista della spesa pesca da un vocabolario minuscolo e
 * stabilissimo: la roba che si mangia. Non cambia con le mode, non cambia con
 * le stagioni, e in vent'anni si e' allungato di «quinoa» e poco altro.
 *
 * COSA NON FA, E VA DETTO
 * -----------------------
 * Non traduce le quantita' — «1 sacchetto da 1 kg», «2 confezioni da 500 g» —
 * e non deve: la ricerca nel catalogo quelle parole le scarta comunque, conta
 * solo il nome del prodotto. E non conosce la coda lunga: «cuori di merluzzo
 * surgelati» non stara' mai in un elenco scritto a mano. Per quella resta il
 * modello, chiamato pero' SOLO sulle parole che qui non ci sono.
 */

/** Le lingue in cui il vocabolario e' scritto. */
export type Lingua = "it" | "en" | "es" | "fr" | "de" | "pt";

/**
 * Da paese a lingua del suo catalogo.
 *
 * E' la lingua in cui i negozi di quel paese scrivono i nomi dei prodotti, che
 * non sempre e' la lingua ufficiale: in Belgio i cataloghi che leggiamo sono
 * in francese, e per il Brasile vale il portoghese.
 */
export const LINGUA_DEL_PAESE: Partial<Record<string, Lingua>> = {
  IT: "it",
  GB: "en", IE: "en", US: "en", CA: "en", ZA: "en", IN: "en", AU: "en", NZ: "en",
  ES: "es", AR: "es", MX: "es", CL: "es",
  FR: "fr", BE: "fr", LU: "fr",
  DE: "de", AT: "de", CH: "de",
  PT: "pt", BR: "pt",
};

/**
 * Un concetto per riga: la stessa cosa, nelle sei lingue.
 *
 * L'ordine e' quello di un reparto, non alfabetico: serve a chi legge il file
 * per correggerlo, ed e' piu' facile accorgersi che manca il sedano guardando
 * le verdure che scorrendo la lettera esse.
 */
const CONCETTI: Array<Record<Lingua, string>> = [
  /* ── latticini e uova ─────────────────────────────────────────── */
  { it: "latte",        en: "milk",         es: "leche",       fr: "lait",        de: "milch",       pt: "leite" },
  { it: "burro",        en: "butter",       es: "mantequilla", fr: "beurre",      de: "butter",      pt: "manteiga" },
  { it: "formaggio",    en: "cheese",       es: "queso",       fr: "fromage",     de: "kase",        pt: "queijo" },
  { it: "mozzarella",   en: "mozzarella",   es: "mozzarella",  fr: "mozzarella",  de: "mozzarella",  pt: "mussarela" },
  { it: "yogurt",       en: "yoghurt",      es: "yogur",       fr: "yaourt",      de: "joghurt",     pt: "iogurte" },
  { it: "panna",        en: "cream",        es: "nata",        fr: "creme",       de: "sahne",       pt: "natas" },
  { it: "uova",         en: "eggs",         es: "huevos",      fr: "oeufs",       de: "eier",        pt: "ovos" },
  { it: "ricotta",      en: "ricotta",      es: "requeson",    fr: "ricotta",     de: "ricotta",     pt: "ricota" },
  { it: "parmigiano",   en: "parmesan",     es: "parmesano",   fr: "parmesan",    de: "parmesan",    pt: "parmesao" },

  /* ── carne e salumi ───────────────────────────────────────────── */
  { it: "pollo",        en: "chicken",      es: "pollo",       fr: "poulet",      de: "hahnchen",    pt: "frango" },
  { it: "petto",        en: "breast",       es: "pechuga",     fr: "blanc",       de: "brust",       pt: "peito" },
  { it: "manzo",        en: "beef",         es: "ternera",     fr: "boeuf",       de: "rind",        pt: "carne de vaca" },
  { it: "maiale",       en: "pork",         es: "cerdo",       fr: "porc",        de: "schwein",     pt: "porco" },
  { it: "agnello",      en: "lamb",         es: "cordero",     fr: "agneau",      de: "lamm",        pt: "cordeiro" },
  { it: "tacchino",     en: "turkey",       es: "pavo",        fr: "dinde",       de: "pute",        pt: "peru" },
  { it: "macinata",     en: "mince",        es: "picada",      fr: "hache",       de: "hackfleisch", pt: "picada" },
  { it: "prosciutto",   en: "ham",          es: "jamon",       fr: "jambon",      de: "schinken",    pt: "presunto" },
  { it: "pancetta",     en: "bacon",        es: "bacon",       fr: "lardons",     de: "speck",       pt: "bacon" },
  { it: "salsiccia",    en: "sausage",      es: "salchicha",   fr: "saucisse",    de: "wurst",       pt: "salsicha" },
  { it: "salame",       en: "salami",       es: "salchichon",  fr: "salami",      de: "salami",      pt: "salame" },

  /* ── pesce ────────────────────────────────────────────────────── */
  { it: "pesce",        en: "fish",         es: "pescado",     fr: "poisson",     de: "fisch",       pt: "peixe" },
  { it: "tonno",        en: "tuna",         es: "atun",        fr: "thon",        de: "thunfisch",   pt: "atum" },
  { it: "salmone",      en: "salmon",       es: "salmon",      fr: "saumon",      de: "lachs",       pt: "salmao" },
  { it: "merluzzo",     en: "cod",          es: "bacalao",     fr: "cabillaud",   de: "kabeljau",    pt: "bacalhau" },
  { it: "gamberi",      en: "prawns",       es: "gambas",      fr: "crevettes",   de: "garnelen",    pt: "camarao" },
  { it: "orata",        en: "sea bream",    es: "dorada",      fr: "dorade",      de: "dorade",      pt: "dourada" },
  { it: "acciughe",     en: "anchovies",    es: "anchoas",     fr: "anchois",     de: "sardellen",   pt: "anchovas" },

  /* ── verdura ──────────────────────────────────────────────────── */
  { it: "pomodori",     en: "tomatoes",     es: "tomates",     fr: "tomates",     de: "tomaten",     pt: "tomates" },
  { it: "patate",       en: "potatoes",     es: "patatas",     fr: "pommes de terre", de: "kartoffeln", pt: "batatas" },
  { it: "cipolle",      en: "onions",       es: "cebollas",    fr: "oignons",     de: "zwiebeln",    pt: "cebolas" },
  { it: "aglio",        en: "garlic",       es: "ajo",         fr: "ail",         de: "knoblauch",   pt: "alho" },
  { it: "carote",       en: "carrots",      es: "zanahorias",  fr: "carottes",    de: "karotten",    pt: "cenouras" },
  { it: "zucchine",     en: "courgettes",   es: "calabacines", fr: "courgettes",  de: "zucchini",    pt: "curgetes" },
  { it: "melanzane",    en: "aubergines",   es: "berenjenas",  fr: "aubergines",  de: "auberginen",  pt: "beringelas" },
  { it: "peperoni",     en: "peppers",      es: "pimientos",   fr: "poivrons",    de: "paprika",     pt: "pimentos" },
  { it: "insalata",     en: "lettuce",      es: "lechuga",     fr: "salade",      de: "salat",       pt: "alface" },
  { it: "spinaci",      en: "spinach",      es: "espinacas",   fr: "epinards",    de: "spinat",      pt: "espinafres" },
  { it: "broccoli",     en: "broccoli",     es: "brocoli",     fr: "brocoli",     de: "brokkoli",    pt: "brocolos" },
  { it: "funghi",       en: "mushrooms",    es: "champinones", fr: "champignons", de: "pilze",       pt: "cogumelos" },
  { it: "sedano",       en: "celery",       es: "apio",        fr: "celeri",      de: "sellerie",    pt: "aipo" },
  { it: "cavolfiore",   en: "cauliflower",  es: "coliflor",    fr: "chou-fleur",  de: "blumenkohl",  pt: "couve-flor" },
  { it: "piselli",      en: "peas",         es: "guisantes",   fr: "petits pois", de: "erbsen",      pt: "ervilhas" },
  { it: "fagiolini",    en: "green beans",  es: "judias verdes", fr: "haricots verts", de: "bohnen",  pt: "feijao verde" },
  { it: "cetriolo",     en: "cucumber",     es: "pepino",      fr: "concombre",   de: "gurke",       pt: "pepino" },
  { it: "zucca",        en: "pumpkin",      es: "calabaza",    fr: "potiron",     de: "kurbis",      pt: "abobora" },

  /* ── frutta ───────────────────────────────────────────────────── */
  { it: "mele",         en: "apples",       es: "manzanas",    fr: "pommes",      de: "apfel",       pt: "macas" },
  { it: "banane",       en: "bananas",      es: "platanos",    fr: "bananes",     de: "bananen",     pt: "bananas" },
  { it: "arance",       en: "oranges",      es: "naranjas",    fr: "oranges",     de: "orangen",     pt: "laranjas" },
  { it: "limoni",       en: "lemons",       es: "limones",     fr: "citrons",     de: "zitronen",    pt: "limoes" },
  { it: "pere",         en: "pears",        es: "peras",       fr: "poires",      de: "birnen",      pt: "peras" },
  { it: "fragole",      en: "strawberries", es: "fresas",      fr: "fraises",     de: "erdbeeren",   pt: "morangos" },
  { it: "uva",          en: "grapes",       es: "uvas",        fr: "raisins",     de: "trauben",     pt: "uvas" },
  { it: "pesche",       en: "peaches",      es: "melocotones", fr: "peches",      de: "pfirsiche",   pt: "pessegos" },

  /* ── dispensa: cereali e farine ───────────────────────────────── */
  { it: "pasta",        en: "pasta",        es: "pasta",       fr: "pates",       de: "nudeln",      pt: "massa" },
  { it: "riso",         en: "rice",         es: "arroz",       fr: "riz",         de: "reis",        pt: "arroz" },
  { it: "pane",         en: "bread",        es: "pan",         fr: "pain",        de: "brot",        pt: "pao" },
  { it: "farina",       en: "flour",        es: "harina",      fr: "farine",      de: "mehl",        pt: "farinha" },
  { it: "zucchero",     en: "sugar",        es: "azucar",      fr: "sucre",       de: "zucker",      pt: "acucar" },
  { it: "sale",         en: "salt",         es: "sal",         fr: "sel",         de: "salz",        pt: "sal" },
  { it: "cereali",      en: "cereal",       es: "cereales",    fr: "cereales",    de: "mullis",      pt: "cereais" },
  { it: "avena",        en: "oats",         es: "avena",       fr: "avoine",      de: "hafer",       pt: "aveia" },
  { it: "couscous",     en: "couscous",     es: "cuscus",      fr: "couscous",    de: "couscous",    pt: "cuscuz" },
  { it: "quinoa",       en: "quinoa",       es: "quinoa",      fr: "quinoa",      de: "quinoa",      pt: "quinoa" },
  { it: "lenticchie",   en: "lentils",      es: "lentejas",    fr: "lentilles",   de: "linsen",      pt: "lentilhas" },
  { it: "ceci",         en: "chickpeas",    es: "garbanzos",   fr: "pois chiches", de: "kichererbsen", pt: "gruao" },
  { it: "fagioli",      en: "beans",        es: "alubias",     fr: "haricots",    de: "bohnen",      pt: "feijao" },

  /* ── condimenti e conserve ────────────────────────────────────── */
  { it: "olio",         en: "oil",          es: "aceite",      fr: "huile",       de: "ol",          pt: "oleo" },
  { it: "aceto",        en: "vinegar",      es: "vinagre",     fr: "vinaigre",    de: "essig",       pt: "vinagre" },
  { it: "passata",      en: "passata",      es: "tomate frito", fr: "coulis",     de: "passata",     pt: "polpa" },
  { it: "pelati",       en: "chopped tomatoes", es: "tomate triturado", fr: "tomates pelees", de: "geschalte tomaten", pt: "tomate pelado" },
  { it: "pesto",        en: "pesto",        es: "pesto",       fr: "pesto",       de: "pesto",       pt: "pesto" },
  { it: "maionese",     en: "mayonnaise",   es: "mayonesa",    fr: "mayonnaise",  de: "mayonnaise",  pt: "maionese" },
  { it: "senape",       en: "mustard",      es: "mostaza",     fr: "moutarde",    de: "senf",        pt: "mostarda" },
  { it: "miele",        en: "honey",        es: "miel",        fr: "miel",        de: "honig",       pt: "mel" },
  { it: "marmellata",   en: "jam",          es: "mermelada",   fr: "confiture",   de: "marmelade",   pt: "compota" },
  { it: "brodo",        en: "stock",        es: "caldo",       fr: "bouillon",    de: "bruhe",       pt: "caldo" },

  /* ── bevande ──────────────────────────────────────────────────── */
  { it: "acqua",        en: "water",        es: "agua",        fr: "eau",         de: "wasser",      pt: "agua" },
  { it: "caffe",        en: "coffee",       es: "cafe",        fr: "cafe",        de: "kaffee",      pt: "cafe" },
  { it: "te",           en: "tea",          es: "te",          fr: "the",         de: "tee",         pt: "cha" },
  { it: "succo",        en: "juice",        es: "zumo",        fr: "jus",         de: "saft",        pt: "sumo" },
  { it: "vino",         en: "wine",         es: "vino",        fr: "vin",         de: "wein",        pt: "vinho" },
  { it: "birra",        en: "beer",         es: "cerveza",     fr: "biere",       de: "bier",        pt: "cerveja" },

  /* ── qualificatori che cambiano il prodotto ───────────────────── */
  { it: "integrale",    en: "wholemeal",    es: "integral",    fr: "complet",     de: "vollkorn",    pt: "integral" },
  { it: "fresco",       en: "fresh",        es: "fresco",      fr: "frais",       de: "frisch",      pt: "fresco" },
  { it: "surgelato",    en: "frozen",       es: "congelado",   fr: "surgele",     de: "tiefgekuhlt", pt: "congelado" },
  { it: "biologico",    en: "organic",      es: "ecologico",   fr: "bio",         de: "bio",         pt: "biologico" },
  { it: "scremato",     en: "skimmed",      es: "desnatada",   fr: "ecreme",      de: "fettarm",     pt: "magro" },
  { it: "extravergine", en: "extra virgin", es: "virgen extra", fr: "vierge extra", de: "nativ extra", pt: "virgem extra" },
  { it: "affumicato",   en: "smoked",       es: "ahumado",     fr: "fume",        de: "gerauchert",  pt: "fumado" },
  { it: "cotto",        en: "cooked",       es: "cocido",      fr: "cuit",        de: "gekocht",     pt: "cozido" },
  { it: "crudo",        en: "raw",          es: "crudo",       fr: "cru",         de: "roh",         pt: "cru" },
  { it: "grattugiato",  en: "grated",       es: "rallado",     fr: "rape",        de: "gerieben",    pt: "ralado" },
  { it: "affettato",    en: "sliced",       es: "en lonchas",  fr: "tranche",     de: "geschnitten", pt: "fatiado" },
  { it: "macinato",     en: "ground",       es: "molido",      fr: "moulu",       de: "gemahlen",    pt: "moido" },
  { it: "scatola",      en: "tinned",       es: "lata",        fr: "conserve",    de: "dose",        pt: "lata" },
  { it: "naturale",     en: "natural",      es: "natural",     fr: "nature",      de: "natur",       pt: "natural" },
  { it: "frizzante",    en: "sparkling",    es: "con gas",     fr: "petillante",  de: "sprudel",     pt: "com gas" },
  { it: "oliva",        en: "olive",        es: "oliva",       fr: "olive",       de: "oliven",      pt: "azeite" },
  { it: "girasole",     en: "sunflower",    es: "girasol",     fr: "tournesol",   de: "sonnenblumen", pt: "girassol" },
  { it: "vegetale",     en: "plant based",  es: "vegetal",     fr: "vegetal",     de: "pflanzlich",  pt: "vegetal" },
  { it: "senza glutine", en: "gluten free", es: "sin gluten",  fr: "sans gluten", de: "glutenfrei",  pt: "sem gluten" },
  { it: "senza lattosio", en: "lactose free", es: "sin lactosa", fr: "sans lactose", de: "laktosefrei", pt: "sem lactose" },
];

/**
 * Le forme in cui una parola si presenta davvero in una lista della spesa.
 *
 * «Pomodori» e «pomodoro» sono la stessa cosa, e chi scrive la lista usa l'una
 * o l'altra senza pensarci. Invece di raddoppiare le righe del vocabolario, si
 * riconoscono qui le desinenze piu' comuni: una parola che non si trova si
 * riprova al singolare, e viceversa.
 *
 * Non e' un analizzatore morfologico e non vuole esserlo: copre i casi che
 * capitano, e quando non basta interviene il modello.
 */
function varianti(parola: string): string[] {
  const p = parola.toLowerCase();
  const fuori = new Set([p]);

  /* L'ACCA CHE SI INFILA IN MEZZO.
     In italiano «fresco» al femminile plurale fa «fresche», non «fresce»: la
     lingua ci mette un'acca per tenere il suono duro. Senza questa riga
     «fresche» non arrivava a «fresco», il dizionario la dava per ignota e si
     spendeva una chiamata per farsi dire «fresh» — che era gia' scritto due
     righe piu' su. Vale per bianco/bianche, fresco/freschi, lungo/lunghe. */
  const senzaAcca = p.replace(/(c|g)h([ei])$/, "$1$2");

  // italiano e spagnolo: la vocale finale che cambia con genere e numero
  for (const base of new Set([p, senzaAcca])) {
    const tronco = base.slice(0, -1);
    if (/[aeio]$/.test(base)) {
      fuori.add(tronco + "o").add(tronco + "a").add(tronco + "i").add(tronco + "e");
    }
  }
  // inglese, francese, portoghese, spagnolo: il plurale in -s/-es
  if (p.endsWith("es")) fuori.add(p.slice(0, -2));
  if (p.endsWith("s")) fuori.add(p.slice(0, -1));
  else fuori.add(p + "s");
  return [...fuori];
}

/**
 * Le parole di servizio: articoli, preposizioni, congiunzioni.
 *
 * «Petto DI pollo» in inglese non e' «breast di chicken»: e' «chicken breast»,
 * e quel «di» non va tradotto, va tolto. La ricerca nel catalogo ragiona per
 * parole sparse, quindi toglierle non perde niente e smette di sporcare.
 */
const PAROLE_DI_SERVIZIO = new Set([
  // italiano
  "di", "da", "in", "con", "al", "alla", "allo", "ai", "agli", "alle", "e",
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "del", "dello",
  "della", "dei", "degli", "delle", "dal", "per", "su", "sul",
  // inglese
  "of", "the", "a", "an", "with", "and", "in", "for",
  // spagnolo
  "de", "del", "en", "con", "el", "los", "las", "y", "un", "una",
  // francese
  "du", "des", "aux", "avec", "et", "les", "une", "au",
  // tedesco
  "mit", "und", "der", "die", "das", "ein", "eine", "im", "von",
  // portoghese
  "do", "da", "dos", "das", "em", "com", "um", "uma", "no", "na",
]);

/**
 * Le parole che si scrivono uguali dappertutto.
 *
 * Varieta', denominazioni e marchi: «basmati» e' basmati in ogni supermercato
 * del mondo, «mozzarella» pure. Passano intatte, e — la cosa che conta — NON
 * vengono segnalate come ignote: chiedere al modello come si dice «basmati» in
 * inglese e' una chiamata buttata via.
 */
const INTERNAZIONALI = new Set([
  "basmati", "arborio", "carnaroli", "jasmine", "venere", "integrali",
  "champignon", "portobello", "shiitake", "cherry", "datterini", "pachino",
  "cheddar", "feta", "halloumi", "gouda", "brie", "camembert", "gorgonzola",
  "grana", "padano", "reggiano", "pecorino", "mascarpone", "burrata",
  "spaghetti", "penne", "fusilli", "rigatoni", "tagliatelle", "lasagne",
  "gnocchi", "tortellini", "ravioli", "farfalle", "linguine", "orzo",
  "espresso", "cappuccino", "prosecco", "chianti", "tonic", "cola",
  "tofu", "seitan", "hummus", "wasabi", "curry", "tahini", "miso",
  "avocado", "kiwi", "mango", "ananas", "papaya", "broccoli", "rucola",
  "extra", "light", "premium", "classic", "bio", "kg", "ml", "cl",
]);

/** Toglie accenti e punteggiatura: i cataloghi scrivono «kase» e «käse». */
function pulisci(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/(\d)[.,](\d)/g, "$1.$2")
    .replace(/[^a-z0-9\s'.-]/g, " ")
    .replace(/(^|\s)\.|\.(\s|$)/g, " ")
    .trim();
}

/** parola in una lingua qualsiasi → indice del concetto. */
const INDICE = new Map<string, number>();
for (const [i, concetto] of CONCETTI.entries()) {
  for (const parola of Object.values(concetto)) {
    for (const v of varianti(pulisci(parola))) {
      // La prima vince: i concetti stanno in ordine di reparto, e il primo che
      // rivendica una parola e' quello piu' comune — «pasta» il cibo, non la
      // pasta sfoglia.
      if (!INDICE.has(v)) INDICE.set(v, i);
    }
  }
}

/**
 * Una voce della spesa, riscritta nella lingua del negozio.
 *
 * Restituisce anche le parole che NON conosce: chi chiama decide se
 * accontentarsi o chiedere al modello solo per quelle.
 */
export function traduciVoce(
  voce: string,
  lingua: Lingua,
): { tradotta: string; sconosciute: string[] } {
  const parole = pulisci(voce).split(/\s+/).filter(Boolean);
  const fuori: string[] = [];
  const sconosciute: string[] = [];

  /* UNA VOCE NOMINA UN PRODOTTO SOLO. IL RESTO E' IL NOME DELLA VARIETA'.
     «Mele Cox's Orange Pippin» usciva tradotta «apples cox's ORANGES pippin»,
     e da li' la ricerca inglese portava arance — Sainsbury's oranges, e anche
     la Fanta. «Orange» li' dentro non e' un'arancia: e' un pezzo del nome
     della varieta' di mela.

     La spia e' la parola che viene PRIMA. In «Mele Cox's Orange Pippin» la
     parola prima di «Orange» e' «Cox's», che il dizionario non conosce: un
     cibo che spunta in mezzo a parole sconosciute, quando il prodotto e' gia'
     stato nominato, sta dentro un nome proprio, non e' un secondo ingrediente.

     Sono due condizioni insieme, e servono tutte e due. In «salsa di
     pomodoro» e «latte di mandorla» il secondo cibo viene dopo «di», che e'
     una parola di servizio e non una sconosciuta: quelle restano intatte. */
  /* «DA», «PER», «FOR»: DICONO A COSA SERVE, NON CHE COS'E'.
     «Pomodori da insalata» restituiva insalate di tonno con dentro i
     pomodori: la ricerca dava a «insalata» lo stesso peso di «pomodori», e
     vinceva chi aveva tutte e due le parole. Ma li' l'insalata non e' un
     ingrediente — e' l'uso a cui i pomodori sono destinati.

     Le lingue lo segnano, e l'italiano lo segna bene: «di» introduce un
     ingrediente — «latte DI mandorla» e' fatto di mandorle — mentre «da»
     introduce lo scopo: «pomodori DA insalata», «patate DA forno», «mele DA
     forno». Sono due preposizioni diverse apposta, e finora venivano buttate
     tutte e due nello stesso mucchio delle parole di servizio. */
  const SCOPO = new Set(["da", "per", "for", "zum", "para", "pour"]);

  let gia = false;          // il prodotto e' gia' stato nominato?
  let primaSconosciuta = false; // la parola appena passata era sconosciuta?
  let primaScopo = false;   // la parola appena passata era «da», «per», «for»…

  for (const p of parole) {
    // Articoli e preposizioni: si tolgono e basta.
    if (PAROLE_DI_SERVIZIO.has(p)) {
      primaScopo = SCOPO.has(p);
      continue;
    }

    /* Numeri, unita' e formati si lasciano stare: «500 g» e' uguale in ogni
       lingua, e la ricerca nel catalogo li scarta comunque. Non sono parole
       sconosciute — sono parole che non c'e' niente da tradurre. */
    if (/^\d|^(g|gr|kg|ml|cl|l|lt|pz|pezzi|x|conf|confezione|bottiglia|barattolo|vasetto|busta|sacchetto)$/i.test(p)) {
      fuori.push(p);
      continue;
    }

    // Varieta' e denominazioni: uguali dappertutto, e non vale la pena chiedere.
    if (INTERNAZIONALI.has(p)) {
      fuori.push(p);
      continue;
    }
    const i = INDICE.get(p) ?? varianti(p).map((v) => INDICE.get(v)).find((x) => x !== undefined);
    if (i !== undefined) {
      if (gia && (primaSconosciuta || primaScopo)) {
        /* Sta dentro un nome proprio: non si traduce e non si cerca. Tenerla
           com'e' non basterebbe — «orange» nel catalogo inglese trova le
           arance uguale, ed e' proprio quello che si vuole evitare. */
        primaSconosciuta = false;
        primaScopo = false;
        continue;
      }
      fuori.push(CONCETTI[i][lingua]);
      gia = true;
      primaSconosciuta = false;
      primaScopo = false;
      continue;
    }

    /* Non e' nell'elenco scritto a mano: puo' essere una parola gia' imparata
       dal modello in una richiesta precedente. */
    const appresa = cercaImparata(p, lingua);
    if (appresa) {
      fuori.push(appresa);
      gia = true;
      primaSconosciuta = false;
      primaScopo = false;
      continue;
    }

    fuori.push(p);
    // Le parole corte sono articoli e preposizioni: «di», «da», «the», «of».
    // Non vale la pena spendere una chiamata per tradurle.
    primaScopo = false;
    if (p.length > 3) {
      sconosciute.push(p);
      primaSconosciuta = true;
    } else {
      primaSconosciuta = false;
    }
  }

  /* «Pomodori pelati» traduce «pomodori»→tomatoes e «pelati»→chopped tomatoes,
     e l'inglese usciva «tomatoes chopped tomatoes». La ricerca ragiona per
     parole sparse e una parola ripetuta non aggiunge niente: si tiene la prima
     volta che compare. */
  const viste = new Set<string>();
  const senzaDoppioni = fuori
    .flatMap((x) => x.split(/\s+/))
    .filter((x) => x && !viste.has(x) && viste.add(x));

  return { tradotta: senzaDoppioni.join(" "), sconosciute };
}

/** Quante parole conosce, per lo stato dell'API. */
export function statoVocabolario(): { concetti: number; parole: number; lingue: number } {
  return { concetti: CONCETTI.length, parole: INDICE.size, lingue: 6 };
}

/* ═══════════════════════════════════════════════════════════════════════════
   IL DIZIONARIO SI RIEMPIE DA SOLO

   Le duecento righe qui sopra coprono la spesa di tutti i giorni, non tutto.
   Quando arriva una parola che non c'e' — «scamorza», «halloumi», «passata di
   pomodoro datterino» — si chiede al modello, UNA VOLTA, e la risposta si
   tiene: in memoria per il resto della giornata, e su file perche' sopravviva
   al riavvio.

   Il file NON e' il dizionario. E' una cassetta dei suggerimenti: si guarda
   ogni tanto, le parole buone si promuovono in `CONCETTI` qui sopra, e cosi'
   la parte scritta a mano — quella verificata, quella che non sbaglia — cresce
   nel tempo. Le parole imparate restano valide nel frattempo.

   Sta in `diario/`, che e' fuori da git: e' roba misurata sulla macchina che
   gira, non codice sorgente.
   ═══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDbConfigured, vocabolario } from "../base/db.js";

const FILE_IMPARATE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "diario",
  "vocabolario-imparato.json",
);

/** `parola|lingua` → traduzione. Piatta, perche' si salva e si rilegge cosi'. */
const imparate = new Map<string, string>();

try {
  const dati = JSON.parse(readFileSync(FILE_IMPARATE, "utf8")) as Record<string, string>;
  for (const [k, v] of Object.entries(dati)) imparate.set(k, v);
  if (imparate.size) console.info(`[vocabolario] ${imparate.size} parole imparate rilette da disco`);
} catch {
  // Il file non c'e' ancora: e' il caso normale la prima volta.
}

/* IL DISCO NON BASTA, E SU RENDER NON SERVE PROPRIO A NIENTE.
   Le parole imparate stavano solo in `diario/vocabolario-imparato.json`. In
   locale funziona: il file resta e il dizionario cresce. In produzione no —
   il disco di Render e' effimero, a ogni riavvio il file sparisce e il
   dizionario riparte da zero. Cioe' proprio dove il risparmio contava, non
   c'era: si ripagava il modello per tradurre le stesse parole, ogni volta.

   Non dava errore. Il dizionario funzionava, traduceva, imparava — e
   dimenticava. L'unico segno era la spesa del modello che non scendeva mai.

   Adesso, quando c'e' un database, le parole vanno li'. Il file resta per chi
   lavora senza Mongo: non e' un doppione, e' l'alternativa. */
function salvaSuDisco(): void {
  try {
    mkdirSync(dirname(FILE_IMPARATE), { recursive: true });
    writeFileSync(FILE_IMPARATE, JSON.stringify(Object.fromEntries(imparate), null, 2), "utf8");
  } catch (err) {
    // Se il disco non si scrive si continua lo stesso: la memoria basta per
    // oggi, e una lista della spesa non deve fallire per un file.
    console.warn("[vocabolario] parole imparate non salvate:", err);
  }
}

function salvaImparate(nuove: Array<[string, string]>): void {
  if (!isDbConfigured()) {
    salvaSuDisco();
    return;
  }
  /* Non si attende: chi sta aspettando una lista della spesa non deve pagare
     una scrittura che serve alla PROSSIMA richiesta, non alla sua. Se fallisce
     la parola resta in memoria per questa macchina, e si reimparera'. */
  void (async () => {
    try {
      const col = await vocabolario();
      await col.bulkWrite(
        nuove.map(([chiave, tradotta]) => ({
          updateOne: {
            filter: { _id: chiave },
            update: { $set: { tradotta, imparata: new Date() } },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    } catch (err) {
      console.warn("[vocabolario] parole imparate non salvate sul database:", err);
    }
  })();
}

/**
 * Rilegge dal database quello che hanno imparato le macchine di prima.
 *
 * Si chiama all'avvio, una volta. Non blocca: se il database e' lento o non
 * risponde, il dizionario scritto a mano c'e' comunque e l'API parte lo
 * stesso — con qualche traduzione in meno, non con un errore.
 */
export async function rileggiImparate(): Promise<void> {
  if (!isDbConfigured()) return;
  try {
    const col = await vocabolario();
    let n = 0;
    for await (const d of col.find({})) {
      if (!imparate.has(d._id)) {
        imparate.set(d._id, d.tradotta);
        n++;
      }
    }
    if (n) console.info(`[vocabolario] ${n} parole imparate rilette dal database`);
  } catch (err) {
    console.warn("[vocabolario] parole imparate non rilette dal database:", err);
  }
}

/**
 * Insegna una parola al dizionario.
 *
 * Si accettano solo parole singole: «passata di pomodoro» tradotto in blocco
 * non si puo' riusare, perche' la volta dopo la frase sara' diversa. Le parole
 * invece tornano sempre.
 */
export function impara(parola: string, lingua: Lingua, tradotta: string): void {
  const p = pulisci(parola);
  const t = pulisci(tradotta);
  if (!p || !t || p === t) return;
  if (INDICE.has(p)) return; // la parte scritta a mano vince sempre
  const nuove: Array<[string, string]> = [];
  for (const v of varianti(p)) {
    const chiave = `${v}|${lingua}`;
    if (!imparate.has(chiave)) {
      imparate.set(chiave, t);
      nuove.push([chiave, t]);
    }
  }
  if (nuove.length) salvaImparate(nuove);
}

/** Cerca fra le parole imparate. Usata da `traduciVoce`. */
function cercaImparata(parola: string, lingua: Lingua): string | undefined {
  for (const v of varianti(parola)) {
    const t = imparate.get(`${v}|${lingua}`);
    if (t) return t;
  }
  return undefined;
}

/** Quante ne ha imparate, per lo stato dell'API. */
export function quanteImparate(): number {
  return imparate.size;
}
