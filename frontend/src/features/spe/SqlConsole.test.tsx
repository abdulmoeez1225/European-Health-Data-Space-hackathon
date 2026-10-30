import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { setLocale } from "@/i18n";
import { renderWithProviders } from "@/test/render";

import { SqlConsole } from "./SqlConsole";

describe("SqlConsole", () => {
  afterEach(() => {
    setLocale("en");
    vi.restoreAllMocks();
  });

  it("runs queries only; exports go through the Summarise tab", () => {
    renderWithProviders(<SqlConsole permitId="P-1" />);
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try COPY to file" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export via airlock" })).not.toBeInTheDocument();
    expect(screen.getByText(/export them from the Summarise tab/)).toBeInTheDocument();
  });

  it("marks values the server shortened", async () => {
    vi.spyOn(api, "speQuery").mockResolvedValue({
      columns: ["s"],
      rows: [["xxx…"]],
      truncated: false,
      truncated_cells: 1,
    });
    renderWithProviders(<SqlConsole permitId="P-1" />);
    await userEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText(/1 long values shortened/)).toBeInTheDocument();
  });

  it("labels the console in German", () => {
    setLocale("de");
    renderWithProviders(<SqlConsole permitId="P-1" />);
    expect(screen.getByRole("button", { name: "Ausführen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "COPY in Datei ausprobieren" })).toBeInTheDocument();
    expect(screen.getByText("Beispiele:")).toBeInTheDocument();
    expect(screen.getByLabelText("SQL-Abfrage")).toHaveValue("SELECT * FROM conditions LIMIT 20");
  });
});
