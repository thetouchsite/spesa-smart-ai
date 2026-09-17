/**
 * Tema dell'app.
 *
 * I colori sono quelli del prototipo web, convertiti da oklch a esadecimale
 * perché React Native non supporta oklch. La conversione è stata fatta con la
 * trasformazione completa oklch → sRGB, non a occhio: il verde del marchio
 * resta identico a quello che il cliente ha già approvato.
 *
 * Spaziature e raggi sono su una scala di 4, come nel prototipo (Tailwind).
 */

export const colors = {
  background: "#FBFAF8",
  card: "#FFFFFF",
  foreground: "#1D2A37",
  mutedForeground: "#5B646F",
  border: "#E3E5E7",
  muted: "#F0F2F4",
  secondary: "#F0F2F4",

  primary: "#00723B",
  primaryGlow: "#0E9254",
  primaryForeground: "#FBFAF8",

  accent: "#FD9400",
  accentForeground: "#14202D",

  destructive: "#DE3C37",
  destructiveForeground: "#FFFFFF",

  /** Sfondi tenui per gli stati, derivati dai colori sopra. */
  successBg: "#E4F1EA",
  /* Fondi tinti per le icone dentro i cerchi: quattro toni che convivono con
     il verde del marchio senza contendergli l'attenzione. */
  tintaVerde: "#E4F1EA",
  tintaAmbra: "#FDF0DC",
  tintaBlu: "#E3ECF5",
  tintaViola: "#EDE8F6",
  /* Il fondo della pagina nel nuovo aspetto: appena piu' saturo del bianco
     sporco di prima, perche' le schede bianche ci si stacchino sopra. Senza
     questo scarto, riquadri e pagina si confondono e le ombre non servono. */
  pagina: "#F3F5F1",
  warningBg: "#FDF0DC",
  dangerBg: "#FBE4E3",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/**
 * Le misure della barra che galleggia in basso.
 *
 * Stanno qui e non nel componente per due motivi. Il primo e' pratico: un
 * file che esporta anche cose che non sono componenti perde il ricaricamento
 * a caldo, e la barra si ritocca spesso. Il secondo conta di piu': la barra
 * galleggia sopra tutto e non spinge via niente, quindi il posto se lo deve
 * far lasciare — dal contenuto che scorre, dal footer dei pulsanti — e chi
 * glielo lascia sta in altri tre file. Con l'altezza scritta a mano in
 * ognuno, il giorno che la pillola cresce di otto punti resta nascosta
 * l'ultima riga di un elenco che nessuno ricontrolla.
 */
export const ALTEZZA_PILLOLA = 44 /* minHeight di una voce */ + spacing.sm * 2;

/** Quanto tenere libero in fondo a una schermata che mostra la barra. */
export function spazioPerLaBarra(insetBasso: number): number {
  return Math.max(insetBasso, spacing.md) + ALTEZZA_PILLOLA + spacing.md;
}

/**
 * Angoli.
 *
 * Sono cresciuti tutti di un gradino nel restyling del 17 settembre. La forma
 * che si voleva — riquadri che galleggiano su un fondo tinto — regge solo con
 * raggi generosi: a 12 pixel una scheda sembra un riquadro di modulo, a 20
 * sembra un oggetto posato sulla pagina. E' la differenza fra un'interfaccia
 * di lavoro e una che si tocca con le dita.
 */
export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 30,
  pill: 999,
} as const;

export const font = {
  /** Corpo del testo. */
  size: {
    xs: 12,
    sm: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    display: 34,
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
} as const;

/**
 * Ombre.
 *
 * iOS e Android usano meccanismi diversi: `shadow*` contro `elevation`.
 * Impostarli entrambi è l'unico modo per ottenere lo stesso risultato sui due
 * sistemi — su Android le proprietà `shadow*` vengono semplicemente ignorate.
 */
/**
 * Ombre.
 *
 * Larghe e tenui, non piccole e scure. Un'ombra stretta disegna un bordo e fa
 * sembrare l'elemento incollato; una larga e appena accennata lo fa galleggiare
 * — ed e' l'effetto su cui si regge tutta la forma nuova.
 *
 * Il colore non e' nero ma l'inchiostro dell'app, leggermente blu: un'ombra
 * nera su un fondo caldo vira al grigio sporco.
 */
export const shadow = {
  card: {
    shadowColor: "#1D2A37",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 3,
  },
  raised: {
    shadowColor: "#1D2A37",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  /** Per la barra in basso, che deve staccarsi dal contenuto che le scorre sotto. */
  flottante: {
    shadowColor: "#0B1A12",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 14,
  },
} as const;
