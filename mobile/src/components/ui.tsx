/**
 * Primitive dell'interfaccia.
 *
 * Il prototipo usa shadcn/ui su Radix, Tailwind e icone lucide: HTML e CSS,
 * che su mobile non esistono. Qui c'è l'equivalente scritto con le primitive
 * React Native, con la stessa ricchezza visiva: icone, sfumature, immagini,
 * ombre.
 *
 * Le icone vengono da `@expo/vector-icons`, incluso in Expo Go: nessuna
 * dipendenza aggiuntiva e nessun file SVG da gestire. I nomi scelti sono gli
 * equivalenti Ionicons delle icone lucide del prototipo.
 *
 * Componenti pensati per il tocco: aree cliccabili sopra i 44pt indicati da
 * Apple, ed etichette di accessibilità su ogni elemento interattivo.
 */

import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

/** Il marchio completo: maialino piu' scritta. */
const MARCHIO = require("../../assets/mealmint-logo.png");
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LanguagePicker } from "./language-picker";
import { colors, font, radius, shadow, spacing, spazioPerLaBarra } from "../theme";
import { BarraBasso } from "./barra-basso";

/** Il serif di sistema per i titoli: il prototipo usa un display serif, e
    caricarne uno costerebbe mezzo megabyte nel pacchetto. */
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia" });

export type IconName = keyof typeof Ionicons.glyphMap;

/* ────────────────────────────── Schermata ────────────────────────────── */

export function Screen({
  children,
  scroll = true,
  footer,
  edgeToEdge = false,
  barra = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  /** Toglie il margine superiore: per le schermate che iniziano con un'immagine. */
  edgeToEdge?: boolean;
  /**
   * La barra di navigazione che galleggia in basso.
   *
   * Non c'e' ovunque: nelle sei domande dell'avvio sarebbe un invito a
   * scappare a meta' strada, e nel caricatore non ci sarebbe niente da
   * raggiungere. Si accende sulle quattro schermate dove si torna spesso.
   */
  barra?: boolean;
}) {
  const insets = useSafeAreaInsets();
  /* SENZA SCORRIMENTO SERVE UN'ALTEZZA DA RIEMPIRE.
     Il corpo aveva solo margini: con `scroll` va benissimo, perche' l'altezza
     gliela da' il contenuto. Ma quando lo scorrimento non c'e' — il caricatore
     del piano — un figlio che chiede `flex: 1` per centrarsi lo chiede a un
     genitore che un'altezza non ce l'ha, e il centraggio non avviene: sul
     caricatore Android il titolo finiva fuori dallo schermo e l'anello si
     vedeva tagliato. */
  const body = (
    <View
      style={[
        styles.screenBody,
        !scroll && styles.screenBodyPieno,
        { paddingTop: edgeToEdge ? 0 : insets.top + spacing.lg },
      ]}
    >
      {children}
    </View>
  );

  return (
    <View style={styles.screen}>
      {scroll ? (
        <ScrollView
          /* Lo spazio in fondo tiene conto della barra: senza, l'ultima riga
             dell'elenco finisce sotto la pillola e non si riesce a premerla.
             Se pero' c'e' anche un footer, il posto alla pillola lo fa gia'
             lui — e' un fratello nel flusso, non galleggia — e aggiungerlo
             qui lascerebbe un buco di sessanta punti in fondo all'elenco. */
          contentContainerStyle={{
            paddingBottom: barra && !footer ? spazioPerLaBarra(insets.bottom) : spacing.xxxl,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      ) : (
        body
      )}
      {footer ? (
        <View
          style={[
            styles.footer,
            {
              /* Con la barra, il footer si alza di tutta la pillola: quella
                 galleggia sopra qualsiasi cosa, footer compreso, e senza
                 questo margine coprirebbe a meta' il pulsante. */
              paddingBottom: barra ? spazioPerLaBarra(insets.bottom) : insets.bottom + spacing.lg,
            },
          ]}
        >
          {footer}
        </View>
      ) : null}
      {barra ? <BarraBasso /> : null}
    </View>
  );
}

/**
 * Intestazione con freccia indietro e selettore di lingua.
 *
 * Il selettore compare per default in OGNI schermata: e' un'app pensata per
 * essere usata all'estero, e nascondere la lingua nelle impostazioni
 * significa che chi non capisce cosa legge non la trova. Il prototipo del
 * cliente lo aveva sempre in vista, ed era la scelta giusta.
 */
export function TopBar({
  title,
  onBack,
  right,
  showLanguage = true,
  logo = false,
}: {
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  showLanguage?: boolean;
  /** Il marchio al posto del tondo vuoto: per la schermata iniziale. */
  logo?: boolean;
}) {
  return (
    <View style={styles.topBar}>
      {logo && !onBack ? (
        /* DOVE NON C'E' UN INDIETRO, C'E' IL MARCHIO.
           In alto a sinistra la schermata iniziale teneva un tondo vuoto: lo
           spazio che il pulsante indietro lascia libero quando non serve. Un
           cerchio bianco senza niente dentro sembra un difetto, e il posto
           dove l'occhio va per primo e' proprio quello. */
        <Image
          source={MARCHIO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel="MealMint"
        />
      ) : onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Indietro"
          onPress={onBack}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        </Pressable>
      ) : (
        <View style={styles.backBtn} />
      )}
      {title ? (
        <Text style={styles.topBarTitle} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={{ flex: 1 }} />
      )}
      <View style={styles.topRight}>
        {showLanguage ? <LanguagePicker /> : null}
        {right}
      </View>
    </View>
  );
}

/* ──────────────────────────────── Testo ──────────────────────────────── */

export function Title({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Subtitle({ children }: { children: ReactNode }) {
  return <Text style={styles.subtitle}>{children}</Text>;
}

export function Label({ children, icon }: { children: ReactNode; icon?: IconName }) {
  if (!icon) return <Text style={styles.label}>{children}</Text>;
  return (
    <View style={styles.labelRow}>
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={styles.label}>{children}</Text>
    </View>
  );
}

export function Body({
  children,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  /** Tronca dopo N righe: utile sui nomi lunghi dei piatti. */
  numberOfLines?: number;
}) {
  return (
    <Text style={[styles.body, style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/* ──────────────────────────────── Scheda ─────────────────────────────── */

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (!onPress) return <View style={[styles.card, style]}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed, style]}
    >
      {children}
    </Pressable>
  );
}

/** Scheda con sfumatura: per i dati che devono saltare all'occhio. */
export function GradientCard({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <LinearGradient
      colors={[colors.primary, colors.primaryGlow]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.gradientCard, style]}
    >
      {children}
    </LinearGradient>
  );
}

/* ─────────────────────────────── Pulsante ────────────────────────────── */

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  style,
  /* Un pulsante con la sola icona non ha nome per chi usa il lettore di
     schermo: sente «pulsante» e basta. Qui si puo' dargliene uno. */
  nomeAccessibile,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  nomeAccessibile?: string;
}) {
  const inactive = disabled || loading;
  const fg = variant === "primary" ? colors.primaryForeground : colors.primary;

  const dentro = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.buttonInner}>
      {icon ? <Ionicons name={icon} size={19} color={fg} /> : null}
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </View>
  );

  /* IL PRIMARIO HA LA SFUMATURA E L'ALONE, COME NEL PROTOTIPO.
     Era verde piatto, e accanto al resto sembrava un pulsante di sistema
     invece dell'azione principale della schermata. Il prototipo del cliente
     usa `bg-gradient-primary` piu' `shadow-glow`: la sfumatura da' profondita',
     l'alone verde lo stacca dal fondo chiaro. Da spento nessuno dei due, o
     l'alone farebbe sembrare premibile un pulsante che non lo e'. */
  if (variant === "primary" && !inactive) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nomeAccessibile ?? label}
        accessibilityState={{ busy: loading }}
        onPress={onPress}
        style={({ pressed }) => [styles.buttonAlone, pressed && styles.buttonPressed, style]}
      >
        <LinearGradient
          colors={[colors.primary, colors.primaryGlow]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.buttonSfumato}
        >
          {dentro}
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={nomeAccessibile ?? label}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        pressed && !inactive && styles.buttonPressed,
        inactive && styles.buttonDisabled,
        style,
      ]}
    >
      {dentro}
    </Pressable>
  );
}

/* ──────────────────────────────── Pillola ────────────────────────────── */

export function Pill({
  children,
  tone = "neutral",
  icon,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger";
  icon?: IconName;
}) {
  const fg = {
    neutral: colors.mutedForeground,
    success: colors.primary,
    warning: "#8A5A08",
    danger: colors.destructive,
  }[tone];
  return (
    <View style={[styles.pill, styles[`pill_${tone}`]]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{children}</Text>
    </View>
  );
}

/* ────────────────────────────── Stati vuoti ──────────────────────────── */

export function Loading({ text }: { text?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      {text ? <Text style={styles.centerText}>{text}</Text> : null}
    </View>
  );
}

export function ErrorState({ text, onRetry }: { text: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Ionicons name="alert-circle-outline" size={38} color={colors.destructive} />
      <Text style={[styles.centerText, { color: colors.destructive }]}>{text}</Text>
      {onRetry ? <Button label="Riprova" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

/** Riga con icona a sinistra e freccia a destra: voce di elenco navigabile. */
export function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const content = (
    <>
      {icon ? (
        <View style={styles.rowIcon}>
          <Ionicons name={icon} size={19} color={colors.primary} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
        ) : null)}
    </>
  );

  if (!onPress) return <View style={styles.listRow}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

/**
 * Un campo di testo.
 *
 * Non c'era, perche' fino a ieri l'app non chiedeva niente di scritto:
 * l'onboarding e' fatto di scelte, non di parole. L'accesso invece vuole
 * email, password e codici — e un campo scritto bene e' meta' della
 * differenza fra un modulo che si compila e uno che si abbandona.
 *
 * L'errore sta SOTTO il campo e non in un avviso a parte: cosi' chi legge sa
 * a quale riga si riferisce senza doverlo dedurre.
 */
export function Campo({
  etichetta,
  valore,
  onChange,
  segreto = false,
  tipo = "testo",
  errore,
  aiuto,
  autoFocus = false,
  onInvio,
}: {
  etichetta: string;
  valore: string;
  onChange: (v: string) => void;
  segreto?: boolean;
  tipo?: "testo" | "email" | "cifre";
  errore?: string | null;
  aiuto?: string;
  autoFocus?: boolean;
  onInvio?: () => void;
}) {
  const [visibile, setVisibile] = useState(false);
  const nascosto = segreto && !visibile;

  return (
    <View style={styles.campoBlocco}>
      <Text style={styles.campoEtichetta}>{etichetta}</Text>
      <View style={[styles.campoBordo, errore ? styles.campoBordoErrato : null]}>
        <TextInput
          value={valore}
          onChangeText={onChange}
          secureTextEntry={nascosto}
          autoFocus={autoFocus}
          onSubmitEditing={onInvio}
          returnKeyType={onInvio ? "go" : "done"}
          /* Su email e codici la maiuscola automatica e il correttore sono solo
             un modo di far sbagliare: "Mario@" non e' l'indirizzo di nessuno. */
          autoCapitalize={tipo === "testo" ? "sentences" : "none"}
          autoCorrect={tipo === "testo"}
          keyboardType={
            tipo === "email" ? "email-address" : tipo === "cifre" ? "number-pad" : "default"
          }
          textContentType={segreto ? "password" : tipo === "email" ? "emailAddress" : "none"}
          maxLength={tipo === "cifre" ? 6 : 200}
          placeholderTextColor={colors.mutedForeground}
          style={styles.campoTesto}
        />
        {segreto ? (
          <Pressable
            onPress={() => setVisibile((v) => !v)}
            hitSlop={10}
            accessibilityLabel={visibile ? "Nascondi la password" : "Mostra la password"}
          >
            <Ionicons
              name={visibile ? "eye-off-outline" : "eye-outline"}
              size={20}
              color={colors.mutedForeground}
            />
          </Pressable>
        ) : null}
      </View>
      {errore ? (
        <Text style={styles.campoErrore}>{errore}</Text>
      ) : aiuto ? (
        <Text style={styles.campoAiuto}>{aiuto}</Text>
      ) : null}
    </View>
  );
}

/**
 * Un riquadro quadrato con l'icona in un disco tinto.
 *
 * E' l'elemento che nel riferimento riempie la griglia a due colonne. Serve a
 * un tipo di contenuto preciso: una destinazione, non un dato. Per i numeri
 * c'e' `Stat`, che ha un'altra gerarchia — li' comanda la cifra, qui il gesto.
 *
 * La tinta si sceglie fra quattro, e non a caso: righe adiacenti con lo stesso
 * disco sembrano un errore di copia-incolla, e un arcobaleno sembra una
 * tavolozza. Quattro bastano a far respirare una griglia senza farla gridare.
 */
export function Riquadro({
  icona,
  titolo,
  sotto,
  tinta = "verde",
  onPress,
}: {
  icona: IconName;
  titolo: string;
  sotto?: string;
  tinta?: "verde" | "ambra" | "blu" | "viola";
  onPress?: () => void;
}) {
  const fondi = {
    verde: colors.tintaVerde,
    ambra: colors.tintaAmbra,
    blu: colors.tintaBlu,
    viola: colors.tintaViola,
  } as const;
  const inchiostri = {
    verde: colors.primary,
    ambra: colors.accent,
    blu: "#2E5E8F",
    viola: "#6A4FA3",
  } as const;

  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={sotto ? `${titolo}. ${sotto}` : titolo}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.riquadro, pressed && onPress && styles.pressed]}
    >
      <View style={[styles.riquadroDisco, { backgroundColor: fondi[tinta] }]}>
        <Ionicons name={icona} size={21} color={inchiostri[tinta]} />
      </View>
      <Text style={styles.riquadroTitolo}>{titolo}</Text>
      {sotto ? <Text style={styles.riquadroSotto}>{sotto}</Text> : null}
    </Pressable>
  );
}

/**
 * Le pillole di filtro in cima a un elenco.
 *
 * Quella attiva e' PIENA, non solo bordata: su uno schermo piccolo, alla luce
 * del sole, un bordo di un pixel non si vede e l'utente non sa cosa sta
 * guardando.
 */
export function Filtri<T extends string>({
  voci,
  scelta,
  onScegli,
}: {
  voci: ReadonlyArray<{ chiave: T; etichetta: string }>;
  scelta: T;
  onScegli: (v: T) => void;
}) {
  return (
    <View style={styles.filtri}>
      {voci.map((v) => {
        const attiva = v.chiave === scelta;
        return (
          <Pressable
            key={v.chiave}
            accessibilityRole="button"
            accessibilityState={{ selected: attiva }}
            onPress={() => onScegli(v.chiave)}
            style={({ pressed }) => [
              styles.filtro,
              attiva && styles.filtroAttivo,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.filtroTesto, attiva && styles.filtroTestoAttivo]}>
              {v.etichetta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export { Ionicons };

/* ─────────────────────────────── Stili ──────────────────────────────── */

const styles = StyleSheet.create({
  /* Il fondo tinto e non il bianco sporco: e' quello che fa galleggiare le
     schede. Con pagina e scheda dello stesso colore, ombre e angoli non si
     vedono e il restyling non esiste. */
  screen: { flex: 1, backgroundColor: colors.pagina },
  screenBody: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  screenBodyPieno: { flex: 1 },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    ...shadow.raised,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  logo: { width: 108, height: 28 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.card,
    ...shadow.card,
  },
  topRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  topBarTitle: {
    flex: 1,
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
    color: colors.foreground,
    textAlign: "center",
  },

  buttonAlone: {
    borderRadius: radius.lg,
    // L'alone: verde, largo e basso. Su Android `elevation` non colora, quindi
    // li' resta un'ombra neutra — meglio di niente e non stona.
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 18,
    elevation: 6,
  },
  buttonSfumato: {
    minHeight: 54,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },

  title: {
    fontFamily: SERIF,
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    color: colors.foreground,
    letterSpacing: -0.6,
    lineHeight: font.size.xxl * 1.15,
  },
  subtitle: {
    fontSize: font.size.md,
    color: colors.mutedForeground,
    lineHeight: font.size.md * 1.45,
  },
  label: { fontSize: font.size.sm, fontWeight: font.weight.semibold, color: colors.foreground },
  labelRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  body: { fontSize: font.size.md, color: colors.foreground, lineHeight: font.size.md * 1.45 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    /* NIENTE BORDO. Prima c'era un filo grigio, e insieme all'ombra faceva due
       lavori uguali: il bordo disegna il limite, l'ombra lo solleva. Tenendoli
       entrambi la scheda sembrava ritagliata. */
    gap: spacing.sm,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },

  gradientCard: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    gap: spacing.xs,
    ...shadow.raised,
  },

  button: {
    minHeight: 54,
    /* Pillola. Un pulsante ad angoli vivi accanto a schede da 22 pixel di
       raggio stona: la forma dev'essere una sola in tutta l'app. */
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  buttonInner: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.primary },
  buttonGhost: { backgroundColor: "transparent" },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { fontSize: font.size.md, fontWeight: font.weight.semibold },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  pill_neutral: { backgroundColor: colors.muted },
  pill_success: { backgroundColor: colors.successBg },
  pill_warning: { backgroundColor: colors.warningBg },
  pill_danger: { backgroundColor: colors.dangerBg },
  pillText: { fontSize: font.size.xs, fontWeight: font.weight.semibold },

  center: { alignItems: "center", justifyContent: "center", gap: spacing.lg, padding: spacing.xl },
  centerText: { fontSize: font.size.md, color: colors.mutedForeground, textAlign: "center" },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
  },
  /* Cerchio, non quadretto arrotondato. E' il segno piu' riconoscibile della
     forma nuova: l'icona dentro un disco tinto invece che in un riquadro. */
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.tintaVerde,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 1 },
  rowTitle: { fontSize: font.size.md, color: colors.foreground, fontWeight: font.weight.medium },
  rowSubtitle: { fontSize: font.size.sm, color: colors.mutedForeground },

  pressed: { opacity: 0.75 },

  riquadro: {
    flex: 1,
    minWidth: 140,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadow.card,
  },
  riquadroDisco: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  riquadroTitolo: {
    fontSize: font.size.md,
    fontWeight: font.weight.semibold,
    color: colors.foreground,
  },
  riquadroSotto: { fontSize: font.size.sm, color: colors.mutedForeground },

  filtri: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  filtro: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadow.card,
  },
  filtroAttivo: { backgroundColor: colors.foreground },
  filtroTesto: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: colors.mutedForeground,
  },
  filtroTestoAttivo: { color: colors.primaryForeground },

  campoBlocco: { gap: spacing.xs },
  campoEtichetta: {
    fontSize: font.size.sm,
    fontWeight: font.weight.medium,
    color: colors.foreground,
  },
  campoBordo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  campoBordoErrato: { borderColor: colors.destructive },
  campoTesto: {
    flex: 1,
    paddingVertical: spacing.md,
    fontSize: font.size.md,
    color: colors.foreground,
  },
  campoErrore: { fontSize: font.size.sm, color: colors.destructive },
  campoAiuto: { fontSize: font.size.sm, color: colors.mutedForeground },
});
