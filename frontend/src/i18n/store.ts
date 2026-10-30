/**
 * The interface language. Stored per browser; `?lang=de|en` overrides it for one page load
 * (screenshots, demos); otherwise the browser language decides (de* → German).
 */
export type Locale = "en" | "de";

export const LOCALE_KEY = "gatekeeper.locale";
export const LOCALES: Locale[] = ["en", "de"];

/** Intl tags. German numbers use "." grouping and "," decimals (1.152; 8,3); dates follow Austria. */
export const INTL: Record<Locale, { number: string; date: string }> = {
  en: { number: "en-GB", date: "en-GB" },
  de: { number: "de-DE", date: "de-AT" },
};

const listeners = new Set<() => void>();
let current: Locale | null = null;

function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "de";
}

function initial(): Locale {
  if (typeof window === "undefined") return "en";
  const param = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(param)) return param;
  try {
    const stored = window.localStorage.getItem(LOCALE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  return window.navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

export function getLocale(): Locale {
  current ??= initial();
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
  try {
    window.localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // The choice then lasts for this page only.
  }
  document.documentElement.lang = locale;
  listeners.forEach((listener) => {
    listener();
  });
}

export function subscribeLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
