import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { rejectResult, speResult } from "@/mock/data";
import { awaitingPermit, permitIssued, renderWithProviders, sampleRequest } from "@/test/render";

import { Requests } from "./Requests";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/staff/",
}));

const CONDITIONS = "Valid for 12 months.";
const waiting = () => awaitingPermit(speResult(sampleRequest("R05")));

beforeEach(() => {
  // A wide screen: the list sits beside the open decision.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Requests: after a staff action", () => {
  it("keeps the issued permit open under the attention filter and confirms it", async () => {
    vi.spyOn(api, "requests").mockResolvedValue([waiting(), rejectResult(sampleRequest("R02"))]);
    vi.spyOn(api, "issuePermit").mockResolvedValue(permitIssued(speResult(sampleRequest("R05")), CONDITIONS));
    renderWithProviders(<Requests />, { viewState: true });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Issue permit…" }));
    const dialog = await screen.findByRole("dialog", { name: "Issue the data permit?" });
    await user.type(within(dialog).getByRole("textbox", { name: "Conditions" }), CONDITIONS);
    await user.click(within(dialog).getByRole("button", { name: "Issue permit" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
    const stamp = (await screen.findByText("Permit issued by staff")).closest("[role=status]");
    expect(stamp).toHaveTextContent(CONDITIONS);
    expect(document.querySelector('[data-request="R05"]')).toHaveAttribute("aria-current", "true");
    expect(screen.queryByText("Nothing needs attention")).not.toBeInTheDocument();
  });
});
