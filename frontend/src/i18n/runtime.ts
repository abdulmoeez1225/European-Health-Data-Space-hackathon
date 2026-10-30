import { de } from "./de";
import { en, type Messages } from "./en";
import { getLocale, INTL, type Locale } from "./store";

const MESSAGES: Record<Locale, Messages> = { en, de };

/** Messages for the active language, for code outside React (formatters, label helpers). */
export function messages(locale: Locale = getLocale()): Messages {
  return MESSAGES[locale];
}

export function intlLocale(kind: "number" | "date", locale: Locale = getLocale()): string {
  return INTL[locale][kind];
}
