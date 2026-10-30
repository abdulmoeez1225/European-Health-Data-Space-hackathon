import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import { readRequest } from "@/api/request";
import type { RequestResult } from "@/api/types";
import { useViewState } from "@/app/providers";
import { rejectResult, speResult } from "@/mock/data";
import { renderWithProviders, sampleRequest, withdrawn } from "@/test/render";

import { EMPTY_DRAFT, type RequestDraft } from "./draft";
import { MyRequests } from "./MyRequests";
import { DRAFT_KEY } from "./routes";

const navigation = vi.hoisted(() => ({
  search: "",
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(navigation.search),
  usePathname: () => "/requests/",
}));

/** Shows the request draft kept in the shared view state, and lets a test leave one behind. */
function DraftProbe() {
  const [draft, setDraft] = useViewState<RequestDraft>(DRAFT_KEY, EMPTY_DRAFT);
  return (
    <>
      <pre data-testid="draft">{JSON.stringify(draft)}</pre>
      <button
        type="button"
        onClick={() => {
          setDraft({ ...EMPTY_DRAFT, purpose: "An unsent draft" });
        }}
      >
        Leave a draft
      </button>
    </>
  );
}

const draftInView = () => JSON.parse(screen.getByTestId("draft").textContent) as RequestDraft;

function renderDecisionPage(result: RequestResult) {
  navigation.search = `id=${result.request_id}`;
  vi.spyOn(api, "request").mockResolvedValue(result);
  return renderWithProviders(
    <>
      <MyRequests />
      <DraftProbe />
    </>,
    { viewState: true },
  );
}

beforeEach(() => {
  window.localStorage.clear();
  navigation.search = "";
});

afterEach(() => {
  vi.restoreAllMocks();
  navigation.push.mockClear();
  navigation.replace.mockClear();
});

describe("MyRequests: decision page", () => {
  const result = speResult(sampleRequest("R05"));

  it("asks for the decision named in ?id= and shows it as a letter", async () => {
    const request = vi.spyOn(api, "request").mockResolvedValue(result);
    navigation.search = "id=R05";
    renderWithProviders(<MyRequests />, { viewState: true });

    expect(await screen.findByRole("heading", { level: 2, name: /secure workspace/ })).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith("R05");
    expect(screen.getByRole("heading", { level: 1, name: "Decision · R05" })).toBeInTheDocument();
    expect(screen.getByText(readRequest(result.request).applicant.organisation)).toBeInTheDocument();
    // next.config adds the trailing slash at build time, so outside a build Link emits "/requests".
    expect(screen.getByRole("link", { name: "My requests" }).getAttribute("href")).toMatch(/^\/requests\/?$/);
  });

  it("shows a placeholder and no actions while the decision loads", () => {
    vi.spyOn(api, "request").mockReturnValue(new Promise<RequestResult>(() => undefined));
    navigation.search = "id=R05";
    renderWithProviders(<MyRequests />, { viewState: true });

    expect(screen.getByLabelText("Loading decision")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit and resubmit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New request" })).not.toBeInTheDocument();
  });

  it("says when the decision cannot be loaded", async () => {
    vi.spyOn(api, "request").mockRejectedValue(new ApiError(404, "No such request"));
    navigation.search = "id=R99";
    renderWithProviders(<MyRequests />, { viewState: true });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load decision R99");
    expect(alert).toHaveTextContent("No such request");
    expect(screen.queryByRole("button", { name: "New request" })).not.toBeInTheDocument();
  });

  it("presents the decision as issued: no review is pending or confirmed", async () => {
    renderDecisionPage(result);

    expect(await screen.findByText(/^Issued automatically/)).toBeInTheDocument();
    expect(
      screen.queryByText(/Awaiting staff review|Confirmed by staff|may review it/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a withdrawn decision as a warning with the access body's reason", async () => {
    renderDecisionPage(withdrawn(result, { reason: "Purpose needs an ethics vote." }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Withdrawn by the access body");
    expect(alert).toHaveTextContent(
      "Purpose needs an ethics vote. The secure workspace is no longer available. The access body will contact you.",
    );
    expect(screen.queryByRole("link", { name: /Open secure workspace/ })).not.toBeInTheDocument();
  });

  it("opens the form with an empty draft for a new request", async () => {
    const user = userEvent.setup();
    renderDecisionPage(result);
    await user.click(screen.getByRole("button", { name: "Leave a draft" }));
    expect(draftInView().purpose).toBe("An unsent draft");

    await user.click(await screen.findByRole("button", { name: "New request" }));

    expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/");
    expect(draftInView()).toEqual(EMPTY_DRAFT);
  });

  it("opens the form with the draft filled from this request for edit and resubmit", async () => {
    const user = userEvent.setup();
    renderDecisionPage(result);

    await user.click(await screen.findByRole("button", { name: "Edit and resubmit" }));

    const request = readRequest(result.request);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/");
    expect(draftInView()).toEqual({
      id: "R05",
      name: request.applicant.name,
      organisation: request.applicant.organisation,
      country: "AT",
      kind: "records",
      purpose: request.purpose,
      question: request.question,
      definitions: request.definitions,
    });
  });

  it("keeps the refused request's text when editing it", async () => {
    const user = userEvent.setup();
    renderDecisionPage(rejectResult(sampleRequest("R02")));

    await user.click(await screen.findByRole("button", { name: "Edit and resubmit" }));

    expect(draftInView()).toMatchObject({ id: "R02", kind: "statistics" });
    expect(draftInView().purpose).toMatch(/health insurance premiums/);
  });
});

describe("MyRequests: overview", () => {
  it("explains that nothing was requested yet", () => {
    renderWithProviders(<MyRequests />, { viewState: true });

    expect(screen.getByText("No requests yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Request data" })).toHaveAttribute("href", "/");
  });

  it("lists the requests submitted from this browser and opens one on its decision page", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem("gatekeeper.myRequests", JSON.stringify(["R05"]));
    vi.spyOn(api, "request").mockResolvedValue(speResult(sampleRequest("R05")));
    renderWithProviders(<MyRequests />, { viewState: true });

    const list = await screen.findByRole("list", { name: "My requests" });
    await user.click(within(list).getByRole("button", { name: /R05/ }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/requests/?id=R05");
    });
  });

  it("marks a withdrawn decision in the list and leaves issued ones unmarked", async () => {
    window.localStorage.setItem("gatekeeper.myRequests", JSON.stringify(["R05", "R02"]));
    const decisions: Record<string, RequestResult> = {
      R05: speResult(sampleRequest("R05")),
      R02: withdrawn(rejectResult(sampleRequest("R02"))),
    };
    vi.spyOn(api, "request").mockImplementation((id) => {
      const decision = decisions[id];
      return decision ? Promise.resolve(decision) : Promise.reject(new ApiError(404, "No such request"));
    });
    renderWithProviders(<MyRequests />, { viewState: true });

    const list = await screen.findByRole("list", { name: "My requests" });
    await waitFor(() => {
      expect(within(list).getAllByRole("button")).toHaveLength(2);
    });
    expect(
      within(within(list).getByRole("button", { name: /R02/ })).getByText("Withdrawn"),
    ).toBeInTheDocument();
    expect(within(within(list).getByRole("button", { name: /R05/ })).queryByText("Withdrawn")).toBeNull();
  });

  it("never shows applicants the staff attention marks, even for flagged decisions", async () => {
    window.localStorage.setItem("gatekeeper.myRequests", JSON.stringify(["R02"]));
    const flagged = rejectResult(sampleRequest("R02"));
    expect(flagged.needs_attention).toBe(true);
    vi.spyOn(api, "request").mockResolvedValue(flagged);
    renderWithProviders(<MyRequests />, { viewState: true });

    const list = await screen.findByRole("list", { name: "My requests" });
    expect(within(list).getByRole("button", { name: /R02/ })).toBeInTheDocument();
    expect(within(list).queryByText(/Needs attention/)).not.toBeInTheDocument();
  });
});
