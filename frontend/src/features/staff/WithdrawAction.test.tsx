import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import { keys } from "@/api/queries";
import type { RequestResult } from "@/api/types";
import { setLocale } from "@/i18n";
import { burgenlandResult, rejectResult, speResult } from "@/mock/data";
import {
  appealed,
  awaitingPermit,
  permitIssued,
  renderWithProviders,
  reopened,
  sampleRequest,
  withdrawn,
} from "@/test/render";

import { RequestDetail, WithdrawAction } from "./RequestDetail";

const ID = "R05";
const REASON = "Purpose is not credible.";
const issued = () => speResult(sampleRequest("R05"));
const REFUSAL_ID = "R02";
const refusal = () => rejectResult(sampleRequest(REFUSAL_ID));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("WithdrawAction", () => {
  async function openDialog() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Withdraw decision…" }));
    const dialog = await screen.findByRole("dialog", { name: "Withdraw this decision?" });
    return { user, dialog };
  }

  it("shows only the trigger until it is clicked", () => {
    renderWithProviders(<WithdrawAction result={issued()} />);

    expect(screen.getByRole("button", { name: "Withdraw decision…" })).toBeEnabled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a dialog that asks for a reason", async () => {
    renderWithProviders(<WithdrawAction result={issued()} />);

    const { dialog } = await openDialog();

    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Withdraw" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(within(dialog).queryByText("A reason is required to withdraw.")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("refuses an empty reason without calling the API", async () => {
    const withdraw = vi.spyOn(api, "withdraw");
    renderWithProviders(<WithdrawAction result={issued()} />);
    const { user, dialog } = await openDialog();

    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(within(dialog).getByText("A reason is required to withdraw.")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toBeInvalid();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("treats a reason of blanks as empty", async () => {
    const withdraw = vi.spyOn(api, "withdraw");
    renderWithProviders(<WithdrawAction result={issued()} />);
    const { user, dialog } = await openDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), "   ");
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(within(dialog).getByText("A reason is required to withdraw.")).toBeInTheDocument();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("withdraws with the trimmed reason and closes the dialog", async () => {
    const result = withdrawn(issued(), { reason: REASON, released_data_withdrawn: true });
    const withdraw = vi.spyOn(api, "withdraw").mockResolvedValue(result);
    renderWithProviders(<WithdrawAction result={issued()} />);
    const { user, dialog } = await openDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), `  ${REASON}  `);
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(withdraw).toHaveBeenCalledExactlyOnceWith(ID, REASON);
  });

  it("puts the cursor in the reason field when the dialog opens", async () => {
    renderWithProviders(<WithdrawAction result={issued()} />);

    const { dialog } = await openDialog();

    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveFocus();
  });

  it("stores the withdrawn decision as the request and in the queue, and refreshes the audit log", async () => {
    const result = withdrawn(issued(), { reason: REASON });
    vi.spyOn(api, "withdraw").mockResolvedValue(result);
    const { client } = renderWithProviders(<WithdrawAction result={issued()} />);
    const other = burgenlandResult(sampleRequest("R01"), 32, null);
    client.setQueryData<RequestResult[]>(keys.requests, [issued(), other]);
    client.setQueryData(keys.audit, { total: 0, events: [] });
    const { user, dialog } = await openDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), REASON);
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    await waitFor(() => {
      expect(client.getQueryData(keys.request(ID))).toEqual(result);
    });
    expect(client.getQueryData<RequestResult[]>(keys.requests)).toEqual([result, other]);
    expect(client.getQueryState(keys.audit)?.isInvalidated).toBe(true);
  });

  it("disables withdrawing while the request is being saved", async () => {
    let finish: (result: RequestResult) => void = () => undefined;
    vi.spyOn(api, "withdraw").mockReturnValue(
      new Promise<RequestResult>((resolve) => {
        finish = resolve;
      }),
    );
    renderWithProviders(<WithdrawAction result={issued()} />);
    const { user, dialog } = await openDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), REASON);
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(within(dialog).getByRole("button", { name: "Withdraw" })).toBeDisabled();
    finish(withdrawn(issued(), { reason: REASON }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("keeps the dialog open and shows the error when withdrawing fails", async () => {
    vi.spyOn(api, "withdraw").mockRejectedValue(new ApiError(409, "Decision already withdrawn"));
    renderWithProviders(<WithdrawAction result={issued()} />);
    const { user, dialog } = await openDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), REASON);
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Decision already withdrawn");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toHaveValue(REASON);
    expect(within(dialog).getByRole("button", { name: "Withdraw" })).toBeEnabled();
  });

  it("does not call the API when cancelled, and forgets the validation message", async () => {
    const withdraw = vi.spyOn(api, "withdraw");
    renderWithProviders(<WithdrawAction result={issued()} />);
    const { user, dialog } = await openDialog();
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    expect(within(dialog).getByText("A reason is required to withdraw.")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Withdraw decision…" }));

    const reopened = await screen.findByRole("dialog");
    expect(within(reopened).queryByText("A reason is required to withdraw.")).not.toBeInTheDocument();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("forgets a failed attempt when cancelled", async () => {
    vi.spyOn(api, "withdraw").mockRejectedValue(new ApiError(500, "Could not pull the release"));
    renderWithProviders(<WithdrawAction result={issued()} />);
    const { user, dialog } = await openDialog();
    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), REASON);
    await user.click(within(dialog).getByRole("button", { name: "Withdraw" }));
    await within(dialog).findByRole("alert");

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: "Withdraw decision…" }));

    expect(within(await screen.findByRole("dialog")).queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("WithdrawAction: reopening a refusal", () => {
  const REOPEN_REASON = "The purpose is covered by Art. 53.";

  async function openReopenDialog() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reopen for manual review…" }));
    const dialog = await screen.findByRole("dialog", { name: "Reopen this refusal?" });
    return { user, dialog };
  }

  it("offers reopening instead of withdrawing a refusal", () => {
    renderWithProviders(<WithdrawAction result={refusal()} />);

    expect(screen.getByRole("button", { name: "Reopen for manual review…" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Withdraw decision…" })).not.toBeInTheDocument();
  });

  it("offers no reopening for a grant", () => {
    renderWithProviders(<WithdrawAction result={issued()} />);

    expect(screen.queryByRole("button", { name: "Reopen for manual review…" })).not.toBeInTheDocument();
  });

  it("refuses an empty reason without calling the API", async () => {
    const reopen = vi.spyOn(api, "reopen");
    const withdraw = vi.spyOn(api, "withdraw");
    renderWithProviders(<WithdrawAction result={refusal()} />);
    const { user, dialog } = await openReopenDialog();

    await user.click(within(dialog).getByRole("button", { name: "Reopen" }));

    expect(within(dialog).getByText("A reason is required to reopen.")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Reason" })).toBeInvalid();
    expect(reopen).not.toHaveBeenCalled();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("reopens with the trimmed reason through api.reopen, never api.withdraw", async () => {
    const result = reopened(refusal(), { reason: REOPEN_REASON });
    const reopen = vi.spyOn(api, "reopen").mockResolvedValue(result);
    const withdraw = vi.spyOn(api, "withdraw");
    renderWithProviders(<WithdrawAction result={refusal()} />);
    const { user, dialog } = await openReopenDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), `  ${REOPEN_REASON}  `);
    await user.click(within(dialog).getByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(reopen).toHaveBeenCalledExactlyOnceWith(REFUSAL_ID, REOPEN_REASON);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("stores the reopened refusal as the request and in the queue, and refreshes the audit log", async () => {
    const result = reopened(refusal(), { reason: REOPEN_REASON });
    vi.spyOn(api, "reopen").mockResolvedValue(result);
    const { client } = renderWithProviders(<WithdrawAction result={refusal()} />);
    const other = burgenlandResult(sampleRequest("R01"), 32, null);
    client.setQueryData<RequestResult[]>(keys.requests, [refusal(), other]);
    client.setQueryData(keys.audit, { total: 0, events: [] });
    const { user, dialog } = await openReopenDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), REOPEN_REASON);
    await user.click(within(dialog).getByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(client.getQueryData(keys.request(REFUSAL_ID))).toEqual(result);
    });
    expect(client.getQueryData<RequestResult[]>(keys.requests)).toEqual([result, other]);
    expect(client.getQueryState(keys.audit)?.isInvalidated).toBe(true);
  });

  it("keeps the dialog open and shows the error when reopening fails", async () => {
    vi.spyOn(api, "reopen").mockRejectedValue(new ApiError(409, "This decision was already actioned."));
    renderWithProviders(<WithdrawAction result={refusal()} />);
    const { user, dialog } = await openReopenDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Reason" }), REOPEN_REASON);
    await user.click(within(dialog).getByRole("button", { name: "Reopen" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("This decision was already actioned.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("RequestDetail: needs attention", () => {
  it("lists the review flags in a warning at the top when the decision needs attention", () => {
    const result: RequestResult = {
      ...speResult(sampleRequest("R05")),
      review_flags: [
        { reason: "Commercial spin-off." },
        { reason: "Only two of three plan readings agreed." },
      ],
    };
    expect(result.needs_attention).toBe(true);
    renderWithProviders(<RequestDetail result={result} />);

    const title = screen.getByText("Why this needs attention");
    const alert = title.parentElement as HTMLElement;
    expect(
      within(alert)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Commercial spin-off.", "Only two of three plan readings agreed."]);
    const article = screen.getByRole("article");
    expect(article.firstElementChild).toBe(alert);
  });

  it("shows the flag of a refusal the AI was unsure about", () => {
    const result = refusal();
    renderWithProviders(<RequestDetail result={result} />);

    expect(screen.getByText("Why this needs attention")).toBeInTheDocument();
    expect(screen.getByText(result.review_flags?.[0]?.reason ?? "")).toBeInTheDocument();
  });

  it("shows no alert for a decision the AI was sure about", () => {
    const result = burgenlandResult(sampleRequest("R01"), 32, null);
    expect(result.needs_attention).toBe(false);
    renderWithProviders(<RequestDetail result={result} />);

    expect(screen.queryByText("Why this needs attention")).not.toBeInTheDocument();
    expect(screen.queryByText("Withdrawn by staff")).not.toBeInTheDocument();
  });

  it("offers to withdraw an issued grant", () => {
    renderWithProviders(<RequestDetail result={issued()} />);

    expect(screen.getByRole("button", { name: "Withdraw decision…" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Reopen for manual review…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });
});

/** The code blocks have their own status live regions, so pick the stamp by its text. */
function stamp(text = "Withdrawn by staff"): HTMLElement {
  const [found] = screen.getAllByRole("status").filter((el) => el.textContent.includes(text));
  if (!found) throw new Error(`No stamp reading "${text}"`);
  return found;
}

describe("RequestDetail: withdrawn", () => {
  it("stamps the withdrawal with the time and the reason", () => {
    const result = withdrawn(issued(), { reason: REASON, released_data_withdrawn: false });
    renderWithProviders(<RequestDetail result={result} />);

    const withdrawal = stamp();
    expect(withdrawal).toHaveTextContent(/Withdrawn by staff\s*· \d{2}:\d{2}/);
    expect(within(withdrawal).getByText(REASON)).toBeInTheDocument();
    expect(within(withdrawal).queryByText(/Released data was pulled/)).not.toBeInTheDocument();
    expect(screen.getByRole("article").firstElementChild).toBe(withdrawal);
  });

  it("says that released data was pulled and the case is handled manually", () => {
    const result = withdrawn(speResult(sampleRequest("R05")), { released_data_withdrawn: true });
    renderWithProviders(<RequestDetail result={result} />);

    expect(stamp()).toHaveTextContent("Released data was pulled; the case is handled manually.");
  });

  it("offers no withdraw button and no attention alert, even if the result still carries flags", () => {
    const result = withdrawn(issued(), { reason: REASON });
    expect(result.review_flags?.length).toBeGreaterThan(0);
    renderWithProviders(<RequestDetail result={result} />);

    expect(screen.queryByRole("button", { name: "Withdraw decision…" })).not.toBeInTheDocument();
    expect(screen.queryByText("Why this needs attention")).not.toBeInTheDocument();
  });
});

describe("RequestDetail: refusals", () => {
  it("offers to reopen a refusal and never to withdraw it", () => {
    renderWithProviders(<RequestDetail result={refusal()} />);

    expect(screen.getByRole("button", { name: "Reopen for manual review…" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Withdraw decision…" })).not.toBeInTheDocument();
  });
});

describe("RequestDetail: reopened", () => {
  it("stamps the reopening with the time and the reason", () => {
    const result = reopened(refusal(), { reason: "Second look." });
    renderWithProviders(<RequestDetail result={result} />);

    const reopening = stamp("Reopened by staff");
    expect(reopening).toHaveTextContent(/Reopened by staff\s*· \d{2}:\d{2}/);
    expect(within(reopening).getByText("Second look.")).toBeInTheDocument();
    expect(within(reopening).queryByText(/Released data was pulled/)).not.toBeInTheDocument();
    expect(screen.queryByText("Withdrawn by staff")).not.toBeInTheDocument();
    expect(screen.getByRole("article").firstElementChild).toBe(reopening);
  });

  it("offers no further action and no attention alert, even if the result still carries flags", () => {
    const result = reopened(refusal());
    expect(result.review_flags?.length).toBeGreaterThan(0);
    renderWithProviders(<RequestDetail result={result} />);

    expect(screen.queryByRole("button", { name: "Reopen for manual review…" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Withdraw decision…" })).not.toBeInTheDocument();
    expect(screen.queryByText("Why this needs attention")).not.toBeInTheDocument();
  });
});

describe("RequestDetail in German", () => {
  afterEach(() => {
    setLocale("en");
  });

  it("speaks German for the attention alert, the withdraw action and the assessment", () => {
    setLocale("de");
    renderWithProviders(<RequestDetail result={issued()} />);

    expect(screen.getByText("Warum das Aufmerksamkeit braucht")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entscheidung zurückziehen…" })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "KI-Bewertung" })).toBeInTheDocument();
    expect(screen.queryByText("Why this needs attention")).not.toBeInTheDocument();
  });

  it("offers reopening a refusal in German", () => {
    setLocale("de");
    renderWithProviders(<RequestDetail result={refusal()} />);

    expect(screen.getByRole("button", { name: "Zur manuellen Prüfung wieder öffnen…" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Entscheidung zurückziehen…" })).not.toBeInTheDocument();
  });

  it("offers issuing the permit in German", () => {
    setLocale("de");
    renderWithProviders(<RequestDetail result={awaitingPermit(issued())} />);

    expect(screen.getByRole("button", { name: "Genehmigung erteilen…" })).toBeEnabled();
    expect(screen.getByText("Datengenehmigung wartet auf Sie")).toBeInTheDocument();
  });
});

describe("RequestDetail: awaiting permit", () => {
  const CONDITIONS = "Valid for 12 months.";

  async function openIssueDialog() {
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Issue permit…" }));
    const dialog = await screen.findByRole("dialog", { name: "Issue the data permit?" });
    return { user, dialog };
  }

  it("says the permit is waiting and offers issuing it or withdrawing the decision", () => {
    renderWithProviders(<RequestDetail result={awaitingPermit(issued())} />);

    expect(screen.getByText("Data permit waiting for you")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Issue permit…" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Withdraw decision…" })).toBeEnabled();
  });

  it("asks for the conditions of the permit", async () => {
    renderWithProviders(<RequestDetail result={awaitingPermit(issued())} />);

    const { dialog } = await openIssueDialog();

    expect(within(dialog).getByRole("textbox", { name: "Conditions" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Issue permit" })).toBeEnabled();
  });

  it("refuses empty conditions without calling the API", async () => {
    const issuePermit = vi.spyOn(api, "issuePermit");
    renderWithProviders(<RequestDetail result={awaitingPermit(issued())} />);
    const { user, dialog } = await openIssueDialog();

    await user.click(within(dialog).getByRole("button", { name: "Issue permit" }));

    expect(within(dialog).getByText("Note the conditions of the permit.")).toBeInTheDocument();
    expect(within(dialog).getByRole("textbox", { name: "Conditions" })).toBeInvalid();
    expect(issuePermit).not.toHaveBeenCalled();
  });

  it("issues the permit with the trimmed conditions and closes the dialog", async () => {
    const issuePermit = vi.spyOn(api, "issuePermit").mockResolvedValue(permitIssued(issued(), CONDITIONS));
    const withdraw = vi.spyOn(api, "withdraw");
    renderWithProviders(<RequestDetail result={awaitingPermit(issued())} />);
    const { user, dialog } = await openIssueDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Conditions" }), `  ${CONDITIONS}  `);
    await user.click(within(dialog).getByRole("button", { name: "Issue permit" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    expect(issuePermit).toHaveBeenCalledExactlyOnceWith(ID, CONDITIONS);
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("keeps the dialog open and shows the error when issuing fails", async () => {
    vi.spyOn(api, "issuePermit").mockRejectedValue(new ApiError(409, "The permit was already issued."));
    renderWithProviders(<RequestDetail result={awaitingPermit(issued())} />);
    const { user, dialog } = await openIssueDialog();

    await user.type(within(dialog).getByRole("textbox", { name: "Conditions" }), CONDITIONS);
    await user.click(within(dialog).getByRole("button", { name: "Issue permit" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("The permit was already issued.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

describe("RequestDetail: permit issued", () => {
  it("stamps the permit with its conditions", () => {
    renderWithProviders(<RequestDetail result={permitIssued(issued(), "Valid for 12 months.")} />);

    const permit = stamp("Permit issued by staff");
    expect(permit).toHaveTextContent(/Permit issued by staff\s*· \d{2}:\d{2}/);
    expect(permit).toHaveTextContent("Conditions: Valid for 12 months.");
  });

  it("offers withdrawing but no issuing", () => {
    renderWithProviders(<RequestDetail result={permitIssued(issued())} />);

    expect(screen.getByRole("button", { name: "Withdraw decision…" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Issue permit…" })).not.toBeInTheDocument();
    expect(screen.queryByText("Data permit waiting for you")).not.toBeInTheDocument();
  });
});

describe("RequestDetail: review requested", () => {
  const APPEAL = "Our purpose is public health research.";
  const NEXT = "Reopen the refusal to review it manually.";

  it("shows the applicant's request as an alert with the next step and the reopen button", () => {
    renderWithProviders(<RequestDetail result={appealed(refusal(), APPEAL)} />);

    const title = screen.getByText(/^The applicant asked for a review on /);
    const alert = title.parentElement as HTMLElement;
    expect(within(alert).getByText(`“${APPEAL}”`)).toBeInTheDocument();
    expect(within(alert).getByText(NEXT)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reopen for manual review…" })).toBeEnabled();
  });

  it("keeps the request on record after reopening, without the next step or the button", () => {
    renderWithProviders(<RequestDetail result={reopened(appealed(refusal(), APPEAL))} />);

    expect(screen.getByText(/^The applicant asked for a review on /)).toBeInTheDocument();
    expect(screen.getByText(`“${APPEAL}”`)).toBeInTheDocument();
    expect(screen.queryByText(NEXT)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen for manual review…" })).not.toBeInTheDocument();
  });
});
