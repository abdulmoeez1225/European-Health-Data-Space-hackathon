import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setLocale } from "@/i18n";
import { burgenlandResult, r01Result, rejectResult, speResult } from "@/mock/data";
import { awaitingPermit, renderWithProviders, reopened, sampleRequest, withdrawn } from "@/test/render";

import { DecisionLetter } from "./DecisionLetter";

beforeEach(() => {
  setLocale("de");
});
afterEach(() => {
  setLocale("en");
});

describe("DecisionLetter in German: statistics", () => {
  const result = r01Result(sampleRequest("R01"));

  it("opens with the German headline, badge and sentence", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByRole("heading", { level: 2, name: "Ihre Statistik liegt vor" })).toBeInTheDocument();
    expect(screen.getByText("Statistik bewilligt")).toHaveAttribute("data-tone", "stats");
    expect(screen.getByText(/Die Zahlen sind anonymisiert/)).toBeInTheDocument();
    expect(screen.queryByText("Statistics granted")).not.toBeInTheDocument();
  });

  it("labels the legal basis and the sections in German", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByRole("heading", { name: "Rechtsgrundlage" })).toBeInTheDocument();
    expect(screen.getByText("Zulässiger Zweck: wissenschaftliche Forschung")).toBeInTheDocument();
    expect(screen.getByText("Als anonymisierte Statistik beantwortet")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Ihre Statistik" })).toBeInTheDocument();
  });

  it("shows German numbers and the German small-cell marker in the table", () => {
    const withheld = burgenlandResult(sampleRequest("R01"), 32, null);
    renderWithProviders(<DecisionLetter result={withheld} />);

    expect(screen.getAllByText(/^\d{1,3}(\.\d{3})*$/).length).toBeGreaterThan(0);
    expect(screen.queryByText("suppressed")).not.toBeInTheDocument();
  });

  it("words the footer in German with the German date", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByText(/Automatisch erteilt in 4,\d s am /)).toBeInTheDocument();
    expect(screen.getByText(/Automatisch erteilt/)).toHaveTextContent(/\d{2}\.\d{2}\.\d{4}/);
    expect(screen.getByText(/Verordnung \(EU\) 2025\/327/)).toBeInTheDocument();
    expect(screen.queryByText(/Issued automatically/)).not.toBeInTheDocument();
  });

  it("labels the reasoning disclosure as English and shows the API's English reason", async () => {
    renderWithProviders(<DecisionLetter result={result} />);
    const user = userEvent.setup();

    expect(screen.queryByText(result.reason)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Begründung (Englisch)" }));

    expect(screen.getByText(result.reason)).toBeInTheDocument();
  });
});

describe("DecisionLetter in German: secure environment", () => {
  const result = speResult(sampleRequest("R05"));

  it("announces the secure access in German", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Sie können mit den Datensätzen in einem sicheren Arbeitsbereich arbeiten",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sicherer Zugang bewilligt")).toHaveAttribute("data-tone", "spe");
    expect(screen.getByText(/Pseudonymisierte Datensätze von 1\.152 Personen/)).toBeInTheDocument();
  });

  it("shows the permit numbers with German grouping", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const permit = screen.getByRole("region", { name: "Ihre Datengenehmigung" });
    expect(within(permit).getByText("Personen (exakt)").closest("div")).toHaveTextContent("1.152");
    expect(within(permit).getByText("Kopierte Datensätze").closest("div")).toHaveTextContent("8.349");
    expect(within(permit).getByText(/2\.477/)).toBeInTheDocument();
    expect(within(permit).getByText("permit-R05")).toBeInTheDocument();
    expect(within(permit).getByRole("link", { name: "Sicheren Arbeitsbereich öffnen" })).toBeInTheDocument();
  });

  it("lists the four articles with German labels", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByText("Zulässiger Zweck: Algorithmenentwicklung")).toBeInTheDocument();
    expect(screen.getByText("Datensätze begründet")).toBeInTheDocument();
    expect(screen.getByText("Datengenehmigung erforderlich")).toBeInTheDocument();
    expect(screen.getByText("Nur sicherer Arbeitsbereich, kein Download")).toBeInTheDocument();
  });
});

describe("DecisionLetter in German: refusal", () => {
  const result = rejectResult(sampleRequest("R02"));

  it("announces the refusal and the alternative in German", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Ihre Anfrage kann nicht bewilligt werden" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Abgelehnt")).toHaveAttribute("data-tone", "reject");
    expect(screen.getByText("Verbotene Nutzung: Versicherung, Beschäftigung, Kredit")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Was Sie stattdessen tun können" })).toBeInTheDocument();
    expect(screen.getByText(/Reichen Sie die Anfrage mit einem Zweck wie/)).toBeInTheDocument();
  });
});

describe("DecisionLetter in German: staff actions", () => {
  it("leads a withdrawn grant with the withdrawal and quotes the reason, in German", () => {
    renderWithProviders(
      <DecisionLetter result={withdrawn(speResult(sampleRequest("R05")), { reason: "Ethikvotum fehlt." })} />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "Ihr sicherer Zugang wurde zurückgezogen" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Der sichere Arbeitsbereich ist nicht mehr verfügbar. Die Zugangsstelle wird sich bei Ihnen melden.",
      ),
    ).toBeInTheDocument();
    const note = screen.getByText("Begründung der Zugangsstelle").closest("figure") as HTMLElement;
    expect(note).toHaveTextContent("„Ethikvotum fehlt.“");
    expect(screen.queryByText("Sicherer Zugang bewilligt")).not.toBeInTheDocument();
  });

  it("tells the applicant a refusal is being reconsidered, in German", () => {
    renderWithProviders(
      <DecisionLetter result={reopened(rejectResult(sampleRequest("R02")), { reason: "Neue Prüfung." })} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Wird von der Zugangsstelle erneut geprüft" + "Sie werden kontaktiert.",
    );
    expect(screen.getByText("„Neue Prüfung.“")).toBeInTheDocument();
    expect(screen.getByText("Abgelehnt")).toBeInTheDocument();
  });

  it("says in German that the permit is being reviewed", () => {
    renderWithProviders(<DecisionLetter result={awaitingPermit(speResult(sampleRequest("R05")))} />);

    expect(screen.getByText("Zugang zu Datensätzen empfohlen")).toBeInTheDocument();
    expect(
      screen.getByText("Der Arbeitsbereich öffnet sich, sobald die Genehmigung erteilt ist."),
    ).toBeInTheDocument();
  });
});
