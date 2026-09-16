/**
 * Quando il negozio parla un'altra lingua del suo stesso paese.
 *
 * IL CASO CHE L'HA RESO NECESSARIO
 * --------------------------------
 * Bonpreu Esclat e' l'unica catena spagnola che il prezzo lo dichiara davvero:
 * nove schede su dieci lo espongono, contro lo zero tondo di Alcampo, Consum,
 * Mercadona, Aldi ed El Corte Ingles. Eppure nei risultati spagnoli non
 * compariva mai, nemmeno dopo aver messo le insegne generose in cima.
 *
 * Non era l'ordinamento: era la lingua. Bonpreu e' catalano e il suo catalogo
 * pure — `llet`, `poma`, `formatge`, `pernil`. La lista della spesa per la
 * Spagna arriva in castigliano — `leche`, `manzana`, `queso`, `jamon` — e due
 * parole che indicano la stessa cosa, se scritte in due lingue, non si
 * incontrano mai nell'indice. L'unica insegna che serviva era invisibile.
 *
 * PERCHE' UN DIZIONARIO E NON UNA TRADUZIONE
 * ------------------------------------------
 * Tradurre vorrebbe dire una chiamata al modello per prodotto, e i prezzi
 * devono restare fuori dalla mano dell'AI: e' la regola su cui l'app si regge.
 * Ma qui non serve tradurre niente. Le liste della spesa pescano da un
 * vocabolario minuscolo e stabilissimo — la roba che si mangia — e un centinaio
 * di parole lo copre quasi tutto. Costa zero e non sbaglia.
 *
 * COME SI USA
 * -----------
 * Si applica quando si costruisce l'indice, non quando si cerca: il prodotto
 * catalano viene registrato ANCHE sotto la sua parola castigliana, cosi' la
 * ricerca lo trova senza sapere niente di lingue. Le parole originali restano:
 * chi cerca in catalano continua a trovarlo.
 */

/**
 * Parola locale → come la chiamerebbe chi scrive la lista.
 *
 * Solo alimentari, e solo dove le due lingue divergono davvero: `pasta` si
 * scrive uguale in mezza Europa e metterla qui sarebbe peso morto.
 */
const CATALANO_SPAGNOLO: Record<string, string> = {
  // latticini e uova
  llet: "leche",
  formatge: "queso",
  mantega: "mantequilla",
  iogurt: "yogur",
  ous: "huevos",
  nata: "nata",
  // carne e salumi
  pollastre: "pollo",
  vedella: "ternera",
  porc: "cerdo",
  xai: "cordero",
  pernil: "jamon",
  cansalada: "bacon",
  llonganissa: "salchicha",
  botifarra: "salchicha",
  carn: "carne",
  // pesce
  peix: "pescado",
  tonyina: "atun",
  lluc: "merluza",
  salmo: "salmon",
  gambes: "gambas",
  sipia: "sepia",
  bacalla: "bacalao",
  // verdura
  enciam: "lechuga",
  tomaquet: "tomate",
  ceba: "cebolla",
  pastanaga: "zanahoria",
  patates: "patatas",
  patata: "patata",
  pesols: "guisantes",
  mongetes: "judias",
  cogombre: "pepino",
  carbassa: "calabaza",
  carbasso: "calabacin",
  albergínia: "berenjena",
  alberginia: "berenjena",
  espinacs: "espinacas",
  bledes: "acelgas",
  bolets: "setas",
  xampinyons: "champinones",
  all: "ajo",
  julivert: "perejil",
  // frutta
  poma: "manzana",
  pomes: "manzanas",
  taronja: "naranja",
  taronges: "naranjas",
  platan: "platano",
  maduixes: "fresas",
  raim: "uva",
  pera: "pera",
  prèssec: "melocoton",
  pressec: "melocoton",
  meló: "melon",
  llimona: "limon",
  // dispensa
  pa: "pan",
  arros: "arroz",
  farina: "harina",
  sucre: "azucar",
  sal: "sal",
  oli: "aceite",
  vinagre: "vinagre",
  cigrons: "garbanzos",
  llenties: "lentejas",
  fideus: "fideos",
  galetes: "galletas",
  xocolata: "chocolate",
  mel: "miel",
  // bevande
  aigua: "agua",
  vi: "vino",
  cervesa: "cerveza",
  suc: "zumo",
  cafè: "cafe",
  te: "te",
  // preparazione, utile perche' finisce negli slug
  fresc: "fresco",
  fresca: "fresca",
  congelat: "congelado",
  ratllat: "rallado",
  picada: "picada",
  tallat: "cortado",
  sencera: "entera",
  desnatada: "desnatada",
};

/** Le lingue da affiancare, paese per paese. Cresce quando serve. */
const PER_PAESE: Record<string, Record<string, string>[]> = {
  ES: [CATALANO_SPAGNOLO],
};

/**
 * Le parole di un prodotto piu' i loro equivalenti nella lingua della lista.
 *
 * Se il paese non ha un dizionario — quasi tutti — restituisce le parole
 * originali senza copiarle: e' la strada calda, la percorrono centomila voci
 * a ogni caricamento.
 */
export function conSinonimi(parole: string[], paese: string): string[] {
  const dizionari = PER_PAESE[paese.toUpperCase()];
  if (!dizionari) return parole;

  let aggiunte: string[] | null = null;
  for (const p of parole) {
    for (const d of dizionari) {
      const altra = d[p];
      // Se la traduzione c'e' gia' fra le parole non serve ripeterla.
      if (!altra || parole.includes(altra)) continue;
      (aggiunte ??= []).push(altra);
    }
  }
  return aggiunte ? [...parole, ...aggiunte] : parole;
}

/** Quante parole conosce, per paese: serve alle prove e allo stato. */
export function dimensioneDizionario(paese: string): number {
  return (PER_PAESE[paese.toUpperCase()] ?? []).reduce((n, d) => n + Object.keys(d).length, 0);
}
