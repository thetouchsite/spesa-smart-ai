/**
 * Lightweight i18n for MealMint.
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
/*
 * `LanguageSelector` non è stato portato: era costruito su Radix, Tailwind e
 * icone lucide, tutti componenti web. La scelta della lingua su mobile vive
 * nella schermata del profilo e usa `useI18n().setLanguage`.
 */
