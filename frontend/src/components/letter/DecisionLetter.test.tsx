import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RequestResult } from "@/api/types";
import { burgenlandResult, r08Result, rejectResult, speResult } from "@/mock/data";
import { renderWithProviders, sampleRequest } from "@/test/render";

import { DecisionLetter } from "./DecisionLetter";

const LEDGER_REASON = "differencing: combined with RT-1 (released 19:18) this would reveal 1 patient";

describe("DecisionLetter: statistics with a ledger-withheld cell", () => {
  const result = burgenlandResult(sampleRequest("R01"), 32, LEDGER_REASON);

  it("announces the approval and gives the reason", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByRole("heading", { level: 2, name: "Approved – statistics" })).toBeInTheDocument();
    expect(screen.getByText(result.reason)).toBeInTheDocument();
    expect(screen.getByText(result.request_id)).toBeInTheDocument();
  });

  it("shows the withheld value with a footnote that explains the ledger", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const table = screen.getByRole("table", { name: `Statistics released for ${result.request_id}` });
    expect(within(table).getByText("<10")).toBeInTheDocument();
    expect(within(table).getByLabelText("Withheld by the release ledger")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Footnote 1" })).toBeInTheDocument();

    expect(screen.getByText("Withheld by the Release Ledger")).toBeInTheDocument();
    expect(
      screen.getByText("Differencing: combined with RT-1 (released 19:18) this would reveal 1 patient"),
    ).toBeInTheDocument();
  });

  it("does not explain the small-cell rule for a ledger-withheld value", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.queryByText("Small-cell rule.")).not.toBeInTheDocument();
  });

  it("cites Art. 53 and Art. 69 as article chips", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByRole("button", { name: /^Art\. 53/ })).toHaveTextContent("Art. 53");
    expect(screen.getByRole("button", { name: /^Art\. 69/ })).toHaveTextContent("Art. 69");
    expect(screen.getByText("Scientific research is an allowed purpose.")).toBeInTheDocument();
    expect(screen.queryByText("Also cited:")).not.toBeInTheDocument();
  });

  it("titles the chips from the law the app loaded", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByRole("button", { name: "Art. 53: Purposes of secondary use" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Art. 69: Health data requests" })).toBeInTheDocument();
  });

  it("releases the number when the ledger does not withhold it", () => {
    renderWithProviders(<DecisionLetter result={burgenlandResult(sampleRequest("R01"), 32, null)} />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("32")).toBeInTheDocument();
    expect(screen.queryByText("Withheld by the Release Ledger")).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: statistics with small cells", () => {
  const result = r08Result(sampleRequest("R08"));

  it("shows protected markers as pills and numbers with one decimal", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("button", { name: "<10" })).toHaveLength(5);
    expect(within(table).getAllByRole("button", { name: "suppressed" })).toHaveLength(5);
    expect(within(table).getAllByText("<10")).toHaveLength(5);
    expect(within(table).getAllByText("suppressed")).toHaveLength(5);
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

  it("explains the small-cell rule", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByText("Small-cell rule.")).toBeInTheDocument();
    expect(screen.getByText(/a group of fewer than 10 patients, including 0\./)).toBeInTheDocument();
    expect(screen.getByText(/a percentage or mean based on fewer than 10 patients\./)).toBeInTheDocument();
    expect(screen.queryByText("Withheld by the Release Ledger")).not.toBeInTheDocument();
  });

  it("names the applicant and quotes the question", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByText("Comprehensive Cancer Centre, epidemiology group")).toBeInTheDocument();
    expect(
      screen.getByText(/What is the mean BMI of women with breast cancer, by region\?/),
    ).toBeInTheDocument();
  });
});

describe("DecisionLetter: secure environment", () => {
  const result = speResult(sampleRequest("R05"));

  it("shows the permit with the exact cohort and blocked download", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", { level: 2, name: "Approved – secure environment" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1,152")).toBeInTheDocument();
    expect(screen.getByText("permit-R05")).toBeInTheDocument();
    expect(screen.getByText("Blocked (Art. 73)")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists the copied record tables without repeating the cohort", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByText("Conditions 2,477 · Medications 3,065 · Observations 2,807")).toBeInTheDocument();
  });

  it("links to the secure environment for this permit", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const link = screen.getByRole("link", { name: /Open secure environment/ });
    // next.config adds the trailing slash at build time, so outside a build Link emits "/spe?permit=…".
    expect(link.getAttribute("href")).toMatch(/^\/spe\/?\?permit=permit-R05$/);
  });

  it("leaves out the permit link and request summary in compact mode", () => {
    renderWithProviders(<DecisionLetter result={result} compact />);

    expect(screen.getByText("permit-R05")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open secure environment/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Request from/)).not.toBeInTheDocument();
  });

  it("allows the download when the permit does not block it", () => {
    const open: RequestResult = {
      ...result,
      spe: result.spe ? { ...result.spe, download_blocked: false } : null,
    };
    renderWithProviders(<DecisionLetter result={open} />);

    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.queryByText("Blocked (Art. 73)")).not.toBeInTheDocument();
  });

  it("shows articles that no legal-basis line explains as extra chips", () => {
    renderWithProviders(<DecisionLetter result={{ ...result, articles: [...result.articles, "71"] }} />);

    expect(screen.getByText("Also cited:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Art. 71: Right to opt out" })).toBeInTheDocument();
  });
});

describe("DecisionLetter: rejection", () => {
  const result = rejectResult(sampleRequest("R02"));

  it("explains the prohibition and what the applicant can do instead", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByRole("heading", { level: 2, name: "Rejected" })).toBeInTheDocument();
    expect(screen.getByText(result.reason)).toBeInTheDocument();
    expect(screen.getByText("Employment, insurance or credit decisions.")).toBeInTheDocument();
    expect(screen.getByRole("blockquote")).toHaveTextContent(result.assessment.justification);
    expect(screen.getByText("What you can do instead")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Art\. 54/ })).toBeInTheDocument();
  });

  it("releases no statistics and no permit", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Your statistics")).not.toBeInTheDocument();
    expect(screen.queryByText("Your data permit")).not.toBeInTheDocument();
  });

  it("falls back to the general prohibition when the AI names no ground", () => {
    const ungrounded: RequestResult = {
      ...result,
      assessment: { ...result.assessment, prohibited_ground: "none" },
    };
    renderWithProviders(<DecisionLetter result={ungrounded} />);

    expect(screen.getByText("Unlawful or unethical use.")).toBeInTheDocument();
  });

  it("omits the quote when there is no justification", () => {
    const unquoted: RequestResult = {
      ...result,
      assessment: { ...result.assessment, justification: "" },
    };
    renderWithProviders(<DecisionLetter result={unquoted} />);

    expect(screen.queryByRole("blockquote")).not.toBeInTheDocument();
    expect(screen.getByText("What you can do instead")).toBeInTheDocument();
  });
});

describe("DecisionLetter: footer", () => {
  it("states the processing time of a fresh decision", () => {
    renderWithProviders(<DecisionLetter result={rejectResult(sampleRequest("R02"))} />);

    expect(screen.getByText(/Decided automatically in 3\.2 s/)).toBeInTheDocument();
  });

  it("says when the same request was decided before", () => {
    const cached: RequestResult = { ...rejectResult(sampleRequest("R02")), cached: true };
    renderWithProviders(<DecisionLetter result={cached} />);

    expect(screen.getByText(/same request decided before/)).toBeInTheDocument();
  });

  it("links to the regulation unless the letter is compact", () => {
    const result = rejectResult(sampleRequest("R02"));
    const { unmount } = renderWithProviders(<DecisionLetter result={result} />);
    expect(screen.getByRole("link", { name: /^Regulation \(EU\) 2025\/327/ })).toHaveAttribute(
      "href",
      "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng",
    );
    unmount();

    renderWithProviders(<DecisionLetter result={result} compact />);
    expect(screen.queryByRole("link", { name: /^Regulation \(EU\) 2025\/327/ })).not.toBeInTheDocument();
  });
});
