import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "@/api/client";
import { ApiError } from "@/api/errors";
import { setLocale } from "@/i18n";
import { burgenlandResult, speResult } from "@/mock/data";
import { renderWithProviders, sampleRequest } from "@/test/render";

import { NewRequest } from "./NewRequest";

const navigation = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigation.push, replace: navigation.replace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const STORAGE_KEY = "gatekeeper.myRequests";
const rememberedIds = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]") as string[];

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole("textbox", { name: "Organisation" }), "Danube Institute");
  await user.type(screen.getByRole("textbox", { name: "Purpose" }), "Plan a diabetes prevention programme.");
  await user.click(screen.getByRole("button", { name: "Add definition" }));
  await user.type(screen.getByRole("textbox", { name: "Definition 1" }), "Adult = aged 18 or older.");
}

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(api, "samples").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  navigation.push.mockClear();
  navigation.replace.mockClear();
});

describe("NewRequest: submitting", () => {
  it("sends the request, remembers its id and opens the decision page", async () => {
    const user = userEvent.setup();
    const submit = vi.spyOn(api, "submit").mockResolvedValue(speResult(sampleRequest("R05")));
    renderWithProviders(<NewRequest />, { viewState: true });
    await fillForm(user);

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/requests/?id=R05");
    });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      applicant: { organisation: "Danube Institute" },
      requested_format: "anonymised statistics",
      purpose: "Plan a diabetes prevention programme.",
      definitions: ["Adult = aged 18 or older."],
    });
    expect(rememberedIds()).toEqual(["R05"]);
  });

  it("lists the newest request first when a second one is submitted", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["R05"]));
    vi.spyOn(api, "submit").mockResolvedValue(burgenlandResult(sampleRequest("R01"), 32, null));
    renderWithProviders(<NewRequest />, { viewState: true });
    await fillForm(user);

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/requests/?id=R01");
    });
    expect(rememberedIds()).toEqual(["R01", "R05"]);
  });

  it("shows progress while the decision is being made", async () => {
    const user = userEvent.setup();
    let finish: (result: Awaited<ReturnType<typeof api.submit>>) => void = () => undefined;
    vi.spyOn(api, "submit").mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    renderWithProviders(<NewRequest />, { viewState: true });
    await fillForm(user);

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByRole("button", { name: "Deciding…" })).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Checking the purpose and computing the answer");
    expect(navigation.push).not.toHaveBeenCalled();
    finish(speResult(sampleRequest("R05")));
    await waitFor(() => {
      expect(navigation.push).toHaveBeenCalledWith("/requests/?id=R05");
    });
  });

  it("stays on the form and remembers nothing when the server fails", async () => {
    const user = userEvent.setup();
    vi.spyOn(api, "submit").mockRejectedValue(new ApiError(503, "The language model is unavailable"));
    renderWithProviders(<NewRequest />, { viewState: true });
    await fillForm(user);

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not process the request: The language model is unavailable",
    );
    expect(screen.getByRole("button", { name: "Submit request" })).toBeEnabled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(rememberedIds()).toEqual([]);
  });
});

describe("NewRequest: incomplete request", () => {
  it("lists what is missing and does not submit", async () => {
    const user = userEvent.setup();
    const submit = vi.spyOn(api, "submit");
    renderWithProviders(<NewRequest />, { viewState: true });
    expect(screen.getByText("Required: organisation, purpose, a definition.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Submit request" }));

    expect(await screen.findByText("Enter the applicant's organisation.")).toBeInTheDocument();
    expect(screen.getByText("Describe what the data will be used for.")).toBeInTheDocument();
    expect(screen.getByText("Add at least one definition.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Organisation" })).toHaveFocus();
    });
    expect(submit).not.toHaveBeenCalled();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(rememberedIds()).toEqual([]);
  });
});

describe("NewRequest: German", () => {
  afterEach(() => {
    setLocale("en");
  });

  it("shows the form and its validation in German, and submits canonical English values", async () => {
    setLocale("de");
    const user = userEvent.setup();
    const submit = vi.spyOn(api, "submit").mockResolvedValue(speResult(sampleRequest("R05")));
    renderWithProviders(<NewRequest />, { viewState: true });

    expect(screen.getByRole("heading", { name: "Gesundheitsdaten anfragen" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Anfrage senden" }));
    expect(
      await screen.findByText("Erforderlich: Organisation, Zweck, eine Definition."),
    ).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: /Organisation/ }), "Danube Institute");
    await user.type(screen.getByRole("textbox", { name: /Zweck/ }), "Diabetes-Prävention planen.");
    await user.click(screen.getByRole("button", { name: "Definition hinzufügen" }));
    await user.type(screen.getByRole("textbox", { name: "Definition 1" }), "Erwachsene = ab 18 Jahren.");
    await user.click(screen.getByRole("button", { name: "Anfrage senden" }));

    await waitFor(() => {
      expect(submit).toHaveBeenCalledTimes(1);
    });
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      requested_as: "health data request",
      requested_format: "anonymised statistics",
    });
  });
});
