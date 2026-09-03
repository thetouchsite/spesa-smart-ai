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

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
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
export const shadow = {
  card: {
    shadowColor: "#1D2A37",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: "#1D2A37",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
  },
} as const;
