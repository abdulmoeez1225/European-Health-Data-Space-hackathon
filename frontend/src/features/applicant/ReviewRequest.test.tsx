import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import { rejectResult } from "@/mock/data";
import { appealed, renderWithProviders, sampleRequest, withdrawn } from "@/test/render";

import { ReviewRequest } from "./ReviewRequest";

afterEach(() => {
  vi.restoreAllMocks();
});

const refusal = rejectResult(sampleRequest("R02"));

describe("ReviewRequest", () => {
  it("keeps the server's answer visible in the dialog when the review is refused", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "appeal").mockRejectedValue(new ApiError(409, "A review was already requested"));
    renderWithProviders(<ReviewRequest result={refusal} />);

    await user.click(screen.getByRole("button", { name: "Ask for a review…" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask for a review of this refusal?" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Why the refusal should be reviewed" }),
      "Please look again.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Ask for a review" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("A review was already requested");
    expect(screen.getByRole("dialog", { name: "Ask for a review of this refusal?" })).toBeInTheDocument();
  });

  it("closes the dialog without sending when cancelled", async () => {
    const user = userEvent.setup();
    const appeal = vi.spyOn(api, "appeal");
    renderWithProviders(<ReviewRequest result={refusal} />);

    await user.click(screen.getByRole("button", { name: "Ask for a review…" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(appeal).not.toHaveBeenCalled();
  });

  it("shows the requested review and no trigger once appealed", () => {
    renderWithProviders(<ReviewRequest result={appealed(refusal, "Please look again.")} />);

    expect(screen.getByRole("heading", { level: 2, name: /^Review requested on / })).toBeInTheDocument();
    expect(screen.getByText("A case officer will review the refusal and contact you.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask for a review…" })).not.toBeInTheDocument();
  });

  it("offers no review once staff have acted on the refusal", () => {
    renderWithProviders(<ReviewRequest result={withdrawn(refusal)} />);

    expect(screen.queryByRole("button", { name: "Ask for a review…" })).not.toBeInTheDocument();
  });
});
