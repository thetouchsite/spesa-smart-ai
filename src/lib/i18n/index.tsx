/**
 * Lightweight i18n for Spesa Smart.
 *
 * - React Context provider keeps the active language in memory.
 * - localStorage persists the user's explicit choice across sessions.
 * - Browser language is auto-detected on first visit (navigator.language).
 * - `useT()` returns the lookup function; missing keys fall back to English
 *   then to the raw key so a forgotten translation never blanks the UI.
 * - `LanguageSelector` is the Settings UI (a popover with the 5 supported
 *   languages). Use anywhere; gear icon is rendered by the header.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Languages, Check } from "lucide-react";
import {
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_LABEL,
  TRANSLATIONS,
  type Language,
  type TranslationKey,
} from "./translations";

const STORAGE_KEY = "spesa-smart.language";

function detectBrowserLanguage(): Language {
  if (typeof navigator === "undefined") return DEFAULT_LANGUAGE;
  const candidates = [
    ...(navigator.languages ?? []),
    navigator.language,
  ].filter(Boolean);
  for (const raw of candidates) {
    const code = raw.toLowerCase().split("-")[0] as Language;
    if ((LANGUAGES as readonly string[]).includes(code)) return code;
  }
  return DEFAULT_LANGUAGE;
}

function readStored(): Language | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v && (LANGUAGES as readonly string[]).includes(v)) return v as Language;
  } catch { /* ignore */ }
  return null;
}

interface I18nContextValue {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey | string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_m, k: string) =>
    vars[k] != null ? String(vars[k]) : `{${k}}`,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Start with default so SSR/CSR markup matches; hydrate from storage/browser
  // in an effect so the language switch only happens client-side.
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);

  useEffect(() => {
    const stored = readStored();
    const initial = stored ?? detectBrowserLanguage();
    if (initial !== language) setLanguageState(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
    }
  }, [language]);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try { window.localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  }, []);

  const t = useCallback<I18nContextValue["t"]>((key, vars) => {
    const dict = TRANSLATIONS[language];
    const fallback = TRANSLATIONS[DEFAULT_LANGUAGE];
    const raw = (dict as Record<string, string>)[key as string]
      ?? (fallback as Record<string, string>)[key as string]
      ?? (key as string);
    return interpolate(raw, vars);
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}

export function useT() {
  return useI18n().t;
}

export { LANGUAGES, LANGUAGE_LABEL, type Language } from "./translations";

/**
 * Settings popover with the language selector. Renders a gear-style button
 * that opens a small panel. Self-contained so the homepage just drops it in.
 */
export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { language, setLanguage, t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("settings.open")}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card text-foreground shadow-soft transition hover:border-primary hover:text-primary ${
          compact ? "h-9 px-2.5 text-xs" : "h-10 px-3 text-sm"
        }`}
      >
        <Languages className="size-4" />
        <span className="font-semibold uppercase">{language}</span>
      </button>
      {open && (
        <>
          {/* click-away overlay */}
          <button
            type="button"
            aria-label={t("settings.close")}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default bg-transparent"
          />
          <div
            role="dialog"
            aria-label={t("settings.title")}
            className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-border bg-card shadow-card"
          >
            <div className="border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("settings.language")}
            </div>
            <ul className="py-1">
              {LANGUAGES.map((code) => {
                const active = code === language;
                return (
                  <li key={code}>
                    <button
                      type="button"
                      onClick={() => { setLanguage(code); setOpen(false); }}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition ${
                        active ? "bg-primary/10 text-foreground" : "text-foreground hover:bg-surface/60"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex size-6 items-center justify-center rounded-md bg-surface/60 text-[10px] font-bold uppercase text-muted-foreground">
                          {code}
                        </span>
                        {LANGUAGE_LABEL[code]}
                      </span>
                      {active && <Check className="size-4 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
