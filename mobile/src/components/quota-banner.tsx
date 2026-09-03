/**
 * Avviso di consumo delle chiavi gratuite.
 *
 * Le chiavi di Gemini e SerpAPI sono su piano gratuito. Se la quota finisce a
 * metà di una dimostrazione, l'app comincia a rispondere con errori davanti
 * alla persona che si sta cercando di convincere — e non si capisce perché.
 *
 * Questo componente legge il consumo da `/health` e avvisa PRIMA che accada:
 * giallo oltre il 70%, rosso oltre il 90%. Sotto quella soglia non mostra
 * nulla, perché un avviso sempre presente smette di essere letto.
 *
 * Compare solo in sviluppo: è uno strumento per noi, non per l'utente finale.
 * In produzione le quote saranno a pagamento e il problema non si pone.
 */

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { get } from "../api/client";
import { colors, font, radius, spacing } from "../theme";

export interface Quota {
  provider: string;
  used: number;
  limit: number;
  percent: number;
  level: "ok" | "attenzione" | "critico";
  window: string;
}

const NAMES: Record<string, string> = {
  gemini: "AI · ricette e piani",
  serpapi: "Prezzi reali",
};

const TONE = {
  ok: { fg: colors.primary, bg: colors.successBg, border: "#A9D4BE", icon: "checkmark-circle-outline" },
  attenzione: { fg: "#8A5A08", bg: colors.warningBg, border: "#E8C98A", icon: "alert-circle-outline" },
  critico: { fg: colors.destructive, bg: colors.dangerBg, border: "#EFA9A3", icon: "warning" },
} as const;

/** Ricontrolla ogni due minuti: abbastanza per accorgersene, non invadente. */
const POLL_MS = 120_000;

function useQuota(active = true): Quota[] {
  const [quota, setQuota] = useState<Quota[]>([]);

  useEffect(() => {
    if (!active) return;
    let alive = true;

    async function check() {
      try {
        const health = await get<{ quota?: Quota[] }>("/health");
        if (alive) setQuota(health.quota ?? []);
      } catch {
        // Backend spento: nessun avviso da mostrare, non è un errore.
        if (alive) setQuota([]);
      }
    }

    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [active]);

  return quota;
}

/** Striscia compatta: compare solo quando c'è davvero da preoccuparsi. */
export function QuotaBanner() {
  const quota = useQuota(__DEV__);
  const alerts = quota.filter((q) => q.level !== "ok");
  if (!__DEV__ || alerts.length === 0) return null;

  const critical = alerts.some((a) => a.level === "critico");
  const tone = critical ? TONE.critico : TONE.attenzione;
  const names = alerts.map((a) => NAMES[a.provider] ?? a.provider).join(" e ");
  const worst = alerts.reduce((max, a) => (a.percent > max.percent ? a : max), alerts[0]);

  return (
    <View style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Ionicons name={tone.icon} size={17} color={tone.fg} />
      <View style={styles.bannerText}>
        <Text style={[styles.bannerTitle, { color: tone.fg }]}>
          {critical ? "Quota quasi esaurita" : "Quota in esaurimento"}
        </Text>
        <Text style={styles.bannerBody}>
          {names} · {worst.used} di {worst.limit} {worst.window} ({worst.percent}%)
        </Text>
      </View>
    </View>
  );
}

/** Elenco completo con barre, per la schermata impostazioni. */
export function QuotaDetail() {
  const quota = useQuota();
  if (quota.length === 0) return null;

  return (
    <View style={styles.detail}>
      {quota.map((q) => {
        const tone = TONE[q.level];
        return (
          <View key={q.provider} style={styles.detailRow}>
            <View style={styles.detailTop}>
              <View style={styles.detailName}>
                <Ionicons name={tone.icon} size={15} color={tone.fg} />
                <Text style={styles.detailLabel}>{NAMES[q.provider] ?? q.provider}</Text>
              </View>
              <Text style={[styles.detailValue, { color: tone.fg }]}>
                {q.used} / {q.limit}
              </Text>
            </View>
            <View style={styles.bar}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.max(2, q.percent)}%`, backgroundColor: tone.fg },
                ]}
              />
            </View>
            <Text style={styles.detailWindow}>
              {q.percent}% consumato {q.window} · le richieste già in cache non contano
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  bannerText: { flex: 1, gap: 1 },
  bannerTitle: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  bannerBody: { fontSize: font.size.xs, color: colors.mutedForeground },

  detail: { gap: spacing.lg },
  detailRow: { gap: spacing.xs },
  detailTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  detailName: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  detailLabel: { fontSize: font.size.sm, color: colors.foreground, fontWeight: font.weight.medium },
  detailValue: { fontSize: font.size.sm, fontWeight: font.weight.semibold },
  detailWindow: { fontSize: font.size.xs, color: colors.mutedForeground },

  bar: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3 },
});
