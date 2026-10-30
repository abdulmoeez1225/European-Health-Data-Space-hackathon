import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import { keys } from "@/api/queries";
import type { RequestResult } from "@/api/types";
import { burgenlandResult, rejectResult, speResult } from "@/mock/data";
import { renderWithProviders, sampleRequest, withdrawn } from "@/test/render";

import { RequestDetail, WithdrawAction } from "./RequestDetail";

const ID = "R02";
const REASON = "Purpose is not credible.";
const issued = () => rejectResult(sampleRequest(ID));

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
    const result = issued();
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

  it("offers to withdraw an issued decision", () => {
    renderWithProviders(<RequestDetail result={issued()} />);

    expect(screen.getByRole("button", { name: "Withdraw decision…" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: /confirm/i })).not.toBeInTheDocument();
  });
});

/** The code blocks have their own status live regions, so pick the stamp by its text. */
function stamp(): HTMLElement {
  const [found] = screen.getAllByRole("status").filter((el) => el.textContent.includes("Withdrawn by staff"));
  if (!found) throw new Error("No withdrawn stamp");
  return found;
}

describe("RequestDetail: withdrawn", () => {
  it("stamps the withdrawal with the time and the reason", () => {
    const result = withdrawn(issued(), { reason: REASON });
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
