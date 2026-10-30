import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { keys } from "@/api/queries";
import type { Decision, RequestResult } from "@/api/types";
import { decisionMeta, prohibitionFor } from "@/lib/decisions";
import { formatTime } from "@/lib/format";
import { plainSentence } from "@/lib/letter";
import { burgenlandResult, r08Result, rejectResult, speResult } from "@/mock/data";
import { MOCK_LAW } from "@/mock/law";
import { renderWithProviders, sampleRequest, withdrawn } from "@/test/render";

import { DecisionLetter } from "./DecisionLetter";

const LEDGER_REASON = "differencing: combined with RT-1 (released 19:18) this would reveal 1 patient";

describe("DecisionLetter: statistics with a ledger-withheld cell", () => {
  const result = burgenlandResult(sampleRequest("R01"), 32, LEDGER_REASON);

  it("opens with the headline, the decision badge and one plain sentence", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", { level: 2, name: decisionMeta("APPROVE_STATISTICAL").headline }),
    ).toBeInTheDocument();
    expect(screen.getByText("Statistics granted")).toHaveAttribute("data-tone", "stats");
    expect(screen.getByText(plainSentence(result))).toBeInTheDocument();
    expect(screen.queryByText(/approved/i)).not.toBeInTheDocument();
  });

  it("names the letter after its headline", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("article", { name: decisionMeta("APPROVE_STATISTICAL").headline }),
    ).toBeInTheDocument();
  });

  it("marks the withheld value and explains it in a footnote", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    // An ungrouped answer (one row, no labels) is a single labelled value, not a table.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    const value = screen.getByLabelText(`Statistics released for ${result.request_id}`);
    expect(within(value).getByText("Type 2 diabetes")).toBeInTheDocument();
    expect(within(value).getByText("<10")).toBeInTheDocument();
    expect(within(value).getByRole("img", { name: "Withheld by the release ledger" })).toBeInTheDocument();

    const footnoteLink = within(value).getByRole("link", { name: "Footnote 1" });
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

    const value = screen.getByLabelText(`Statistics released for R01`);
    expect(within(value).getByText("Type 2 diabetes")).toBeInTheDocument();
    expect(within(value).getByText("32")).toBeInTheDocument();
    expect(screen.queryByText("Withheld by the release ledger.")).not.toBeInTheDocument();
    expect(within(value).queryByRole("img", { name: "Withheld by the release ledger" })).toBeNull();
  });

  it("releases no data permit", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.queryByRole("region", { name: "Your data permit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What you can do instead" })).not.toBeInTheDocument();
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

  it("announces the secure access with the patient count in the sentence", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", { level: 2, name: decisionMeta("APPROVE_SPE").headline }),
    ).toBeInTheDocument();
    expect(screen.getByText("Secure access granted")).toHaveAttribute("data-tone", "spe");
    expect(
      screen.getByText(/Pseudonymised records of 1,152 patients were copied for you/),
    ).toBeInTheDocument();
  });

  it("shows the permit with the exact cohort and the blocked download", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const permit = screen.getByRole("region", { name: "Your data permit" });
    expect(within(permit).getByText("permit-R05")).toBeInTheDocument();
    expect(within(permit).getByText("Patients (exact)").closest("div")).toHaveTextContent("1,152");
    expect(within(permit).getByText(/Nothing can be downloaded \(Art\. 73\)/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("totals the copied records over every table but the cohort", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const permit = screen.getByRole("region", { name: "Your data permit" });
    const copied = within(permit).getByText("Records copied").closest("div");
    // 2,477 conditions + 3,065 medications + 2,807 observations; the 1,152 cohort rows are not records.
    expect(copied).toHaveTextContent("8,349");
    expect(copied).not.toHaveTextContent("9,501");
    expect(
      within(permit).getByText("Conditions 2,477 · Medications 3,065 · Observations 2,807"),
    ).toBeInTheDocument();
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
    expect(screen.queryByText(/Nothing can be downloaded/)).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: refusal", () => {
  const result = rejectResult(sampleRequest("R02"));

  it("announces the refusal and says why in one sentence", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(
      screen.getByRole("heading", { level: 2, name: decisionMeta("REJECT").headline }),
    ).toBeInTheDocument();
    expect(screen.getByText("Refused")).toHaveAttribute("data-tone", "reject");
    expect(screen.getByText(prohibitionFor("employment_or_insurance_or_credit").text)).toBeInTheDocument();
    expect(screen.queryByText(/rejected|approved/i)).not.toBeInTheDocument();
  });

  it("tells the applicant what to do instead, based on the prohibited ground", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const instead = screen.getByRole("region", { name: "What you can do instead" });
    expect(within(instead).getByText("What you can do instead.")).toBeInTheDocument();
    expect(
      within(instead).getByText(prohibitionFor("employment_or_insurance_or_credit").instead),
    ).toBeInTheDocument();
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
    expect(screen.getByText(prohibitionFor("none").text)).toBeInTheDocument();
    expect(generic).not.toBe(prohibitionFor("employment_or_insurance_or_credit").instead);
  });

  it("gives no advice for a granted request", () => {
    renderWithProviders(<DecisionLetter result={r08Result(sampleRequest("R08"))} />);

    expect(screen.queryByText("What you can do instead.")).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: legal basis", () => {
  const result = burgenlandResult(sampleRequest("R01"), 32, null);

  it("lists each article as a chip titled from the law, with a short label", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    const legalBasis = screen.getByRole("region", { name: "Legal basis" });
    const items = within(legalBasis).getAllByRole("listitem");
    expect(items).toHaveLength(result.articles.length);

    const [purpose, statistics] = items as [HTMLElement, HTMLElement];
    expect(
      within(purpose).getByRole("button", { name: "Art. 53: Purposes of secondary use" }),
    ).toHaveTextContent("Art. 53");
    expect(within(purpose).getByText("Allowed purpose: scientific research")).toBeInTheDocument();
    expect(
      within(statistics).getByRole("button", { name: "Art. 69: Health data requests" }),
    ).toHaveTextContent("Art. 69");
    expect(within(statistics).getByText("Answered as anonymised statistics")).toBeInTheDocument();
  });

  it("labels a secure-access decision with its four articles", () => {
    renderWithProviders(<DecisionLetter result={speResult(sampleRequest("R05"))} />);

    const items = within(screen.getByRole("region", { name: "Legal basis" })).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Art. 53Allowed purpose: algorithm development",
      "Art. 66Records justified",
      "Art. 68Data permit required",
      "Art. 73Secure workspace only, no download",
    ]);
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

  it("shows no legal basis section when no article is cited", () => {
    renderWithProviders(<DecisionLetter result={{ ...result, articles: [] }} />);

    expect(screen.queryByRole("heading", { name: "Legal basis" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Legal basis" })).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: full reasoning", () => {
  const result = burgenlandResult(sampleRequest("R01"), 32, null);

  it("keeps the reason out of the page until the disclosure is opened", () => {
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByRole("button", { name: "Full reasoning" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(result.reason)).not.toBeInTheDocument();
    expect(screen.queryByText("Scientific research is an allowed purpose.")).not.toBeInTheDocument();
  });

  it("shows the reason and every legal-basis line once opened", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DecisionLetter result={result} />);

    await user.click(screen.getByRole("button", { name: "Full reasoning" }));

    expect(screen.getByRole("button", { name: "Full reasoning" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(result.reason)).toBeInTheDocument();
    expect(screen.getByText("Scientific research is an allowed purpose.").closest("li")).toHaveTextContent(
      "Art. 53 Scientific research is an allowed purpose.",
    );
    expect(screen.getByText("Answered as anonymised statistics.").closest("li")).toHaveTextContent(
      "Art. 69 Answered as anonymised statistics.",
    );
  });

  it("hides the reason again when closed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DecisionLetter result={result} />);

    await user.click(screen.getByRole("button", { name: "Full reasoning" }));
    await user.click(screen.getByRole("button", { name: "Full reasoning" }));

    expect(screen.queryByText(result.reason)).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: withdrawn by the access body", () => {
  const REASON = "Purpose needs an ethics vote.";

  it("shows no warning for an issued decision", () => {
    renderWithProviders(<DecisionLetter result={rejectResult(sampleRequest("R02"))} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Withdrawn by the access body")).not.toBeInTheDocument();
  });

  it.each<[Decision, RequestResult, string]>([
    [
      "APPROVE_STATISTICAL",
      burgenlandResult(sampleRequest("R01"), 32, null),
      "The statistics are no longer available.",
    ],
    ["APPROVE_SPE", speResult(sampleRequest("R05")), "The secure workspace is no longer available."],
    ["REJECT", rejectResult(sampleRequest("R02")), "The automated refusal no longer stands."],
  ])(
    "tells the applicant that a %s decision was withdrawn, with the reason",
    (_decision, issued, consequence) => {
      renderWithProviders(<DecisionLetter result={withdrawn(issued, { reason: REASON })} />);

      const alert = screen.getByRole("alert");
      expect(alert).toHaveTextContent("Withdrawn by the access body");
      expect(alert).toHaveTextContent(`${REASON} ${consequence} The access body will contact you.`);
    },
  );

  it("opens the letter with the warning, above the decision", () => {
    renderWithProviders(<DecisionLetter result={withdrawn(rejectResult(sampleRequest("R02")))} />);

    const alert = screen.getByRole("alert");
    const headline = screen.getByRole("heading", { level: 2, name: decisionMeta("REJECT").headline });
    expect(alert.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("ends the reason with exactly one full stop", () => {
    renderWithProviders(
      <DecisionLetter result={withdrawn(rejectResult(sampleRequest("R02")), { reason: "Wrong purpose" })} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Wrong purpose. The automated refusal no longer stands. The access body will contact you.",
    );
  });

  it("leaves the reason out when none was recorded", () => {
    const result: RequestResult = { ...withdrawn(rejectResult(sampleRequest("R02"))), withdrawal: null };
    renderWithProviders(<DecisionLetter result={result} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      /^Withdrawn by the access body\s*The automated refusal no longer stands\. The access body will contact you\.$/,
    );
  });

  it("shows no statistics table once the statistics are pulled", () => {
    renderWithProviders(
      <DecisionLetter result={withdrawn(r08Result(sampleRequest("R08")), { reason: REASON })} />,
    );

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Your statistics" })).not.toBeInTheDocument();
  });

  it("shows no data permit and no workspace link once the workspace is pulled", () => {
    renderWithProviders(
      <DecisionLetter result={withdrawn(speResult(sampleRequest("R05")), { reason: REASON })} />,
    );

    expect(screen.queryByRole("region", { name: "Your data permit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open secure workspace/ })).not.toBeInTheDocument();
    expect(screen.queryByText("permit-R05")).not.toBeInTheDocument();
  });
});

describe("DecisionLetter: footer", () => {
  it("states the processing time of a fresh decision and says nothing about a review", () => {
    const result = rejectResult(sampleRequest("R02"));
    renderWithProviders(<DecisionLetter result={result} />);

    const footer = screen.getByText(/Issued automatically/);
    expect(footer).toHaveTextContent(/^Issued automatically in 3\.2 s on /);
    expect(footer).toHaveTextContent(formatTime(result.processed_at));
    expect(screen.queryByText(/Confirmed by staff/)).not.toBeInTheDocument();
    expect(screen.queryByText(/may review it/)).not.toBeInTheDocument();
  });

  it("leaves out the processing time when an identical request was answered before", () => {
    const cached: RequestResult = { ...rejectResult(sampleRequest("R02")), cached: true };
    renderWithProviders(<DecisionLetter result={cached} />);

    const footer = screen.getByText(/Issued automatically/);
    expect(footer).toHaveTextContent(/^Issued automatically on /);
    expect(footer).not.toHaveTextContent(/ in \d+\.\d s/);
  });

  it("links to the regulation on EUR-Lex in a new tab", () => {
    renderWithProviders(<DecisionLetter result={rejectResult(sampleRequest("R02"))} />);

    const link = screen.getByRole("link", { name: /^Regulation \(EU\) 2025\/327/ });
    expect(link).toHaveAttribute("href", "https://eur-lex.europa.eu/eli/reg/2025/327/oj/eng");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAccessibleName(/opens in a new tab/);
  });
});
