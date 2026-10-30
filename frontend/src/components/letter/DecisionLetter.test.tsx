import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { keys } from "@/api/queries";
import type { RequestResult } from "@/api/types";
import { decisionMeta, prohibitionFor } from "@/lib/decisions";
import { burgenlandResult, r08Result, rejectResult, speResult } from "@/mock/data";
import { MOCK_LAW } from "@/mock/law";
import { renderWithProviders, sampleRequest } from "@/test/render";

import { DecisionLetter } from "./DecisionLetter";

const LEDGER_REASON = "differencing: combined with RT-1 (released 19:18) this would reveal 1 patient";

describe("DecisionLetter: statistics with a ledger-withheld cell", () => {
  const result = burgenlandResult(sampleRequest("R01"), 32, LEDGER_REASON);

  it("announces the approval and gives the reason", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", { level: 2, name: decisionMeta("APPROVE_STATISTICAL").headline }),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved – statistics")).toBeInTheDocument();
    expect(screen.getByText(result.reason)).toBeInTheDocument();
    expect(screen.getByText(result.request_id)).toBeInTheDocument();
  });

  it("names the letter after its headline", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("article", { name: decisionMeta("APPROVE_STATISTICAL").headline }),
    ).toBeInTheDocument();
  });

  it("marks the withheld value and explains it in a footnote", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const table = screen.getByRole("table", { name: `Statistics released for ${result.request_id}` });
    expect(within(table).getByText("<10")).toBeInTheDocument();
    expect(within(table).getByRole("img", { name: "Withheld by the release ledger" })).toBeInTheDocument();

    const footnoteLink = within(table).getByRole("link", { name: "Footnote 1" });
    const footnote = screen.getByText("Withheld by the release ledger.").closest("li");
    expect(footnote).toHaveAttribute("id", footnoteLink.getAttribute("href")?.slice(1));
    expect(footnote).toHaveTextContent(
      "Withheld by the release ledger. Differencing: combined with RT-1 (released 19:18) this would reveal 1 patient.",
    );
  });

  it("shows the small-cell legend only when a small-cell rule marker is present", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.queryByText(/small-cell rule/)).not.toBeInTheDocument();
  });

  it("releases the number when the ledger does not withhold it", () => {
    renderWithProviders(<DecisionLetter result={burgenlandResult(sampleRequest("R01"), 32, null)} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("32")).toBeInTheDocument();
    expect(screen.queryByText("Withheld by the release ledger.")).not.toBeInTheDocument();
    expect(within(table).queryByRole("img", { name: "Withheld by the release ledger" })).toBeNull();
  });
});

describe("DecisionLetter: statistics with small cells", () => {
  const result = r08Result(sampleRequest("R08"));

  it("shows the small-cell markers as buttons and means with one decimal", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("button", { name: "<10" })).toHaveLength(5);
    expect(within(table).getAllByRole("button", { name: "suppressed" })).toHaveLength(5);
    expect(within(table).getByText("27.2")).toBeInTheDocument();
    expect(within(table).getByText("26.6")).toBeInTheDocument();
  });

  it("lists each region as a row header", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader")).toHaveLength(9);
    expect(within(table).getByRole("rowheader", { name: "Wien" })).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: "Niederösterreich" })).toBeInTheDocument();
  });

  it("labels the columns with readable metric names", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Region" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Women with BMI" })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Mean BMI" })).toBeInTheDocument();
  });

  it("explains the small-cell rule in a legend without ledger footnotes", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByText(/small-cell rule/)).toBeInTheDocument();
    expect(screen.queryByText("Withheld by the release ledger.")).not.toBeInTheDocument();
  });

  it("explains a marker in a tooltip on hover", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DecisionLetter result={result} />);

    await user.hover(
      within(screen.getByRole("table")).getAllByRole("button", { name: "<10" })[0] as HTMLElement,
    );

    expect(await screen.findByRole("tooltip")).toHaveTextContent(/Fewer than 10 patients in this group/);
  });
});

describe("DecisionLetter: secure environment", () => {
  const result = speResult(sampleRequest("R05"));

  it("announces the approval", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", { level: 2, name: decisionMeta("APPROVE_SPE").headline }),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved – secure environment")).toBeInTheDocument();
  });

  it("shows the permit with the exact cohort and the blocked download", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const permit = screen.getByRole("region", { name: "Your data permit" });
    expect(within(permit).getByText("permit-R05")).toBeInTheDocument();
    expect(within(permit).getByText("1,152")).toBeInTheDocument();
    expect(within(permit).getByText(/Download blocked \(Art\. 73\)/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists the copied record tables without repeating the cohort", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByText("Conditions 2,477 · Medications 3,065 · Observations 2,807")).toBeInTheDocument();
  });

  it("links the applicant to their secure workspace for this permit", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const link = screen.getByRole("link", { name: /Open secure workspace/ });
    // next.config adds the trailing slash at build time, so outside a build Link emits "/spe?permit=…".
    expect(link.getAttribute("href")).toMatch(/^\/spe\/?\?permit=permit-R05$/);
  });

  it("leaves out the workspace link in a staff preview", () => {
    renderWithProviders(<DecisionLetter result={result} workspaceLink={false} />);

    expect(screen.getByText("permit-R05")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open secure workspace/ })).not.toBeInTheDocument();
  });

  it("says so when the permit allows the download", () => {
    const open: RequestResult = {
      ...result,
      spe: result.spe ? { ...result.spe, download_blocked: false } : null,
    };
    renderWithProviders(<DecisionLetter result={open} />);

    expect(screen.getByText("Download allowed.")).toBeInTheDocument();
    expect(screen.queryByText(/Download blocked/)).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: rejection", () => {
  const result = rejectResult(sampleRequest("R02"));

  it("announces the rejection and gives the reason", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", { level: 2, name: decisionMeta("REJECT").headline }),
    ).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText(result.reason)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Art\. 54/ })).toBeInTheDocument();
  });

  it("tells the applicant what to do instead, based on the prohibited ground", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByText("What you can do instead.")).toBeInTheDocument();
    expect(screen.getByText(prohibitionFor("employment_or_insurance_or_credit").instead)).toBeInTheDocument();
  });

  it("releases no statistics and no permit", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your statistics" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your data permit" })).not.toBeInTheDocument();
    expect(screen.queryByText("permit-R05")).not.toBeInTheDocument();
  });

  it("falls back to the generic advice when the AI names no ground", () => {
    const ungrounded: RequestResult = {
      ...result,
      assessment: { ...result.assessment, prohibited_ground: "none" },
    };
    renderWithProviders(<DecisionLetter result={ungrounded} />);

    const generic = prohibitionFor("none").instead;
    expect(screen.getByText(generic)).toBeInTheDocument();
    expect(generic).not.toBe(prohibitionFor("employment_or_insurance_or_credit").instead);
  });

  it("gives no advice for an approval", () => {
    renderWithProviders(<DecisionLetter result={r08Result(sampleRequest("R08"))} />);

    expect(screen.queryByText("What you can do instead.")).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: legal basis chips", () => {
  const result = burgenlandResult(sampleRequest("R01"), 32, null);

  it("cites every article as a chip titled from the law", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const legalBasis = screen.getByRole("list", { name: "Legal basis" });
    expect(within(legalBasis).getAllByRole("listitem")).toHaveLength(result.articles.length);
    expect(
      within(legalBasis).getByRole("button", { name: "Art. 53: Purposes of secondary use" }),
    ).toHaveTextContent("Art. 53");
    expect(
      within(legalBasis).getByRole("button", { name: "Art. 69: Health data requests" }),
    ).toHaveTextContent("Art. 69");
  });

  it("takes the title from the law the app loaded", async () => {
    const { client } = renderWithProviders(<DecisionLetter result={result} />);

    act(() => {
      client.setQueryData(keys.law, {
        ...MOCK_LAW,
        articles: MOCK_LAW.articles.map((article) =>
          article.number === "53" ? { ...article, title: "Reuse of health data" } : article,
        ),
      });
    });

    expect(await screen.findByRole("button", { name: "Art. 53: Reuse of health data" })).toBeInTheDocument();
  });

  it("explains why the article applies from the legal basis", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DecisionLetter result={result} />);

    await user.hover(screen.getByRole("button", { name: /^Art\. 53/ }));

    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent("Art. 53 · Purposes of secondary use");
    expect(tooltip).toHaveTextContent("Scientific research is an allowed purpose.");
  });

  it("shows no legal basis list when no article is cited", () => {
    renderWithProviders(<DecisionLetter result={{ ...result, articles: [] }} />);

    expect(screen.queryByRole("list", { name: "Legal basis" })).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: footer", () => {
  it("states the processing time of a fresh decision", () => {
    renderWithProviders(<DecisionLetter result={rejectResult(sampleRequest("R02"))} />);

    expect(screen.getByText(/Decided automatically in 3\.2 s/)).toBeInTheDocument();
    expect(screen.queryByText(/identical request answered before/)).not.toBeInTheDocument();
  });

  it("says when an identical request was answered before", () => {
    const cached: RequestResult = { ...rejectResult(sampleRequest("R02")), cached: true };
    renderWithProviders(<DecisionLetter result={cached} />);

    expect(screen.getByText("Decided automatically · identical request answered before")).toBeInTheDocument();
  });

  it("links to the regulation on EUR-Lex in a new tab", () => {
    renderWithProviders(<DecisionLetter result={rejectResult(sampleRequest("R02"))} />);

    const link = screen.getByRole("link", { name: /^Regulation \(EU\) 2025\/327/ });
    expect(link).toHaveAttribute("href", "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAccessibleName(/opens in a new tab/);
  });
});
