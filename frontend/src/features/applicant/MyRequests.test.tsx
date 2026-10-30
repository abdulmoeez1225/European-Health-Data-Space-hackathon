import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import { readRequest } from "@/api/request";
import type { RequestResult } from "@/api/types";
import { useViewState } from "@/app/providers";
import { formatTime } from "@/lib/format";
import { r01Result, rejectResult, speResult } from "@/mock/data";
import {
  appealed,
  awaitingPermit,
  permitIssued,
  renderWithProviders,
  sampleRequest,
  withdrawn,
} from "@/test/render";

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

  it("shows a withdrawn grant as withdrawn, with the access body's reason quoted apart", async () => {
    renderDecisionPage(withdrawn(result, { reason: "Purpose needs an ethics vote." }));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Your secure access was withdrawn" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Withdrawn by the access body")).toBeInTheDocument();
    expect(
      screen.getByText("The secure workspace is no longer available. The access body will contact you."),
    ).toBeInTheDocument();
    expect(screen.getByText("Reason given by the access body")).toBeInTheDocument();
    expect(screen.getByText("“Purpose needs an ethics vote.”").tagName).toBe("BLOCKQUOTE");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/Secure access granted|Statistics granted/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open secure workspace/ })).not.toBeInTheDocument();
  });

  it("names withdrawn statistics instead of announcing them", async () => {
    renderDecisionPage(withdrawn(r01Result(sampleRequest("R01"))));

    expect(
      await screen.findByRole("heading", { level: 2, name: "Your statistics were withdrawn" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Statistics granted")).not.toBeInTheDocument();
  });

  it("shows the AI's explanation under 'Why this decision'", async () => {
    renderDecisionPage(result);

    expect(await screen.findByRole("heading", { level: 3, name: "Why this decision" })).toBeInTheDocument();
    expect(screen.getByText(result.assessment.explanation_for_applicant)).toBeInTheDocument();
  });

  it("keeps the workspace closed while the access body has not issued the permit", async () => {
    renderDecisionPage(awaitingPermit(result));

    expect(
      await screen.findByRole("heading", { level: 2, name: "A case officer is reviewing your data permit" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Records access recommended")).toBeInTheDocument();
    expect(screen.getByText("The workspace opens once the permit is issued.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open secure workspace/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Conditions set by the access body")).not.toBeInTheDocument();
  });

  it("opens the workspace and shows the permit's conditions once the permit is issued", async () => {
    renderDecisionPage(permitIssued(result, "Valid for 12 months."));

    expect(await screen.findByRole("link", { name: /Open secure workspace/ })).toBeInTheDocument();
    expect(screen.getByText("Conditions set by the access body")).toBeInTheDocument();
    expect(screen.getByText("“Valid for 12 months.”").tagName).toBe("BLOCKQUOTE");
    expect(screen.queryByText("The workspace opens once the permit is issued.")).not.toBeInTheDocument();
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

  it("opens the form with a fresh-id draft filled from the refused request for edit and resubmit", async () => {
    const user = userEvent.setup();
    const refusal = rejectResult(sampleRequest("R02"));
    renderDecisionPage(refusal);

    await user.click(await screen.findByRole("button", { name: "Edit and resubmit" }));

    const request = readRequest(refusal.request);
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/");
    // The server answers 409 for an id staff already acted on, so the resubmission gets a new one.
    expect(draftInView()).toMatchObject({ id: "", kind: "statistics", purpose: request.purpose });
    expect(draftInView().purpose).toMatch(/health insurance premiums/);
  });

  it.each([
    ["a secure-workspace grant", speResult(sampleRequest("R05"))],
    ["a statistics grant", r01Result(sampleRequest("R01"))],
  ])("offers only a new request for %s, not edit and resubmit", async (_name, grant) => {
    renderDecisionPage(grant);

    expect(await screen.findByRole("button", { name: "New request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit and resubmit" })).not.toBeInTheDocument();
  });
});

describe("MyRequests: review of a refusal", () => {
  const refusal = rejectResult(sampleRequest("R02"));

  it("offers a review under an issued refusal, with the case reference", async () => {
    renderDecisionPage(refusal);

    const region = await screen.findByRole("region", { name: "Ask for a review" });
    expect(within(region).getByText("Case reference")).toBeInTheDocument();
    expect(within(region).getByText("R02")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Ask for a review…" })).toBeInTheDocument();
  });

  it("does not offer a review under a grant", async () => {
    renderDecisionPage(speResult(sampleRequest("R05")));

    await screen.findByRole("heading", { level: 2, name: /secure workspace/ });
    expect(screen.queryByRole("region", { name: /review/i })).not.toBeInTheDocument();
  });

  it("asks for a reason and does not send an empty one", async () => {
    const user = userEvent.setup();
    const appeal = vi.spyOn(api, "appeal");
    renderDecisionPage(refusal);

    await user.click(await screen.findByRole("button", { name: "Ask for a review…" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask for a review of this refusal?" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Why the refusal should be reviewed" }),
      "   ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Ask for a review" }));

    expect(within(dialog).getByText("Explain why the refusal should be reviewed.")).toBeInTheDocument();
    expect(appeal).not.toHaveBeenCalled();
  });

  it("sends the trimmed reason and then shows the review as requested", async () => {
    const user = userEvent.setup();
    const reason = "Our purpose is public health research.";
    const appeal = vi.spyOn(api, "appeal").mockResolvedValue(appealed(refusal, reason));
    renderDecisionPage(refusal);

    await user.click(await screen.findByRole("button", { name: "Ask for a review…" }));
    const dialog = await screen.findByRole("dialog", { name: "Ask for a review of this refusal?" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Why the refusal should be reviewed" }),
      `  ${reason}  `,
    );
    await user.click(within(dialog).getByRole("button", { name: "Ask for a review" }));

    expect(appeal).toHaveBeenCalledExactlyOnceWith("R02", reason);
    const heading = await screen.findByRole("heading", {
      level: 2,
      name: `Review requested on ${formatTime(appealed(refusal).appeal?.at)}`,
    });
    const region = screen.getByRole("region", { name: heading.textContent });
    expect(within(region).getByText("Your reason")).toBeInTheDocument();
    expect(within(region).getByText(`“${reason}”`)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask for a review…" })).not.toBeInTheDocument();
  });

  it("shows a review already asked for, with the applicant's reason and no way to ask again", async () => {
    renderDecisionPage(appealed(refusal, "Please look again."));

    const heading = await screen.findByRole("heading", { level: 2, name: /^Review requested on / });
    const region = screen.getByRole("region", { name: heading.textContent });
    expect(within(region).getByText("“Please look again.”")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask for a review…" })).not.toBeInTheDocument();
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

  it("marks decisions the access body is still working on or has set aside, and leaves issued ones unmarked", async () => {
    const decisions: Record<string, RequestResult> = {
      R05: speResult(sampleRequest("R05")),
      R06: awaitingPermit(speResult(sampleRequest("R06"))),
      R02: withdrawn(rejectResult(sampleRequest("R02"))),
      R03: appealed(rejectResult(sampleRequest("R03"))),
    };
    window.localStorage.setItem("gatekeeper.myRequests", JSON.stringify(Object.keys(decisions)));
    vi.spyOn(api, "request").mockImplementation((id) => {
      const decision = decisions[id];
      return decision ? Promise.resolve(decision) : Promise.reject(new ApiError(404, "No such request"));
    });
    renderWithProviders(<MyRequests />, { viewState: true });

    const list = await screen.findByRole("list", { name: "My requests" });
    await waitFor(() => {
      expect(within(list).getAllByRole("button")).toHaveLength(4);
    });
    const row = (id: string) => within(list).getByRole("button", { name: new RegExp(id) });
    expect(within(row("R06")).getByText("Awaiting permit")).toBeInTheDocument();
    expect(within(row("R02")).getByText("Withdrawn")).toBeInTheDocument();
    expect(within(row("R03")).getByText("Review requested")).toBeInTheDocument();
    for (const chip of ["Awaiting permit", "Withdrawn", "Review requested"]) {
      expect(within(row("R05")).queryByText(chip)).not.toBeInTheDocument();
    }
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
