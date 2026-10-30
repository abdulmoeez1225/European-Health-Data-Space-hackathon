import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { setLocale } from "@/i18n";
import { renderWithProviders } from "@/test/render";

import { SqlConsole } from "./SqlConsole";

describe("SqlConsole", () => {
  afterEach(() => {
    setLocale("en");
  });

  it("labels the airlock export and presets in English", () => {
    renderWithProviders(<SqlConsole permitId="P-1" />);
    expect(screen.getByRole("button", { name: "Export via airlock" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try COPY to file" })).toBeInTheDocument();
  });

  it("labels the airlock export and presets in German", () => {
    setLocale("de");
    renderWithProviders(<SqlConsole permitId="P-1" />);
    expect(screen.getByRole("button", { name: "Über die Schleuse exportieren" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "COPY in Datei ausprobieren" })).toBeInTheDocument();
    expect(screen.getByText("Beispiele:")).toBeInTheDocument();
    expect(screen.getByLabelText("SQL-Abfrage")).toHaveValue("SELECT * FROM conditions LIMIT 20");
  });
});
