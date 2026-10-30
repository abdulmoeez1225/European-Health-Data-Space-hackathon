import { countryOptions, EHDS_COUNTRIES } from "./countries";

describe("countryOptions", () => {
  it("lists the EU and EEA states with names in the interface language", () => {
    const en = countryOptions("en");
    const de = countryOptions("de");

    expect(en).toHaveLength(EHDS_COUNTRIES.length);
    expect(en.find((option) => option.code === "AT")?.name).toBe("Austria");
    expect(de.find((option) => option.code === "AT")?.name).toBe("Österreich");
  });

  it("sorts by the localised name", () => {
    const names = countryOptions("de").map((option) => option.name);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "de")));
  });

  it("keeps a code from imported JSON that is not in the list", () => {
    const options = countryOptions("en", "ch");

    expect(options).toHaveLength(EHDS_COUNTRIES.length + 1);
    expect(options.find((option) => option.code === "CH")?.name).toBe("Switzerland");
  });

  it("shows an unrecognised value as it was given", () => {
    expect(countryOptions("en", "Austria").find((option) => option.code === "AUSTRIA")?.name).toBe("AUSTRIA");
  });
});
