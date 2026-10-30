import type { Locale } from "@/i18n";

/**
 * Countries an applicant can be based in: the EU member states, where the EHDS applies, and the EEA
 * states that can join it. Stored as ISO 3166-1 alpha-2 codes, as in the track's request format.
 */
export const EHDS_COUNTRIES = [
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
] as const;

export type CountryOption = { code: string; name: string };

/**
 * Options for the country select, named and sorted in the interface language. A code that is not in
 * the list (for example from imported JSON) is kept as an extra option so it is never lost.
 */
export function countryOptions(locale: Locale, current = ""): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  const codes: string[] = [...EHDS_COUNTRIES];
  const extra = current.trim().toUpperCase();
  if (extra && !codes.includes(extra)) codes.push(extra);
  return codes
    .map((code) => ({ code, name: displayName(names, code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

function displayName(names: Intl.DisplayNames, code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    // Not a valid region code (free text from imported JSON): show it as it was given.
    return code;
  }
}
