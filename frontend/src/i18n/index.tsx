"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";

import { messages } from "./runtime";
import { getLocale, subscribeLocale, type Locale } from "./store";

export type { Messages } from "./en";
export { intlLocale, messages } from "./runtime";
export { getLocale, LOCALES, setLocale, type Locale } from "./store";

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => "en" as const);
}

export function useT() {
  return messages(useLocale());
}

/**
 * Re-renders the app when the language changes. The subtree is keyed by locale, so helpers that
 * read the active language outside React (formatters, label maps) re-run everywhere at once.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <div key={locale} className="contents">
      {children}
    </div>
  );
}
