import { act, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LanguageMenu } from "@/components/LanguageMenu";
import { SidebarProvider } from "@/components/ui/sidebar";
import { renderWithProviders } from "@/test/render";

import { de } from "./de";
import { en } from "./en";
import { getLocale, intlLocale, LocaleProvider, messages, setLocale, useLocale, useT } from "./index";
import { LOCALE_KEY } from "./store";

afterEach(() => {
  act(() => {
    setLocale("en");
  });
  window.localStorage.clear();
});

describe("locale store", () => {
  it("starts in English in the test browser", () => {
    expect(getLocale()).toBe("en");
    expect(messages()).toBe(en);
  });

  it("switches the active language, the page language and the stored choice", () => {
    setLocale("de");

    expect(getLocale()).toBe("de");
    expect(document.documentElement.lang).toBe("de");
    expect(window.localStorage.getItem(LOCALE_KEY)).toBe("de");
    expect(messages()).toBe(de);
  });

  it("formats numbers with German rules and dates the Austrian way", () => {
    expect(intlLocale("number")).toBe("en-GB");
    setLocale("de");

    expect(intlLocale("number")).toBe("de-DE");
    expect(intlLocale("date")).toBe("de-AT");
    expect(intlLocale("number", "en")).toBe("en-GB");
  });

  it("still switches when storage is blocked", () => {
    const blocked = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    expect(() => {
      setLocale("de");
    }).not.toThrow();
    expect(getLocale()).toBe("de");
    expect(document.documentElement.lang).toBe("de");
    blocked.mockRestore();
  });
});

describe("useT and useLocale", () => {
  it("re-render with the new messages after setLocale", () => {
    const { result } = renderHook(() => ({ t: useT(), locale: useLocale() }));
    expect(result.current.locale).toBe("en");
    expect(result.current.t.decision.REJECT.label).toBe("Refused");

    act(() => {
      setLocale("de");
    });

    expect(result.current.locale).toBe("de");
    expect(result.current.t.decision.REJECT.label).toBe("Abgelehnt");

    act(() => {
      setLocale("en");
    });

    expect(result.current.t.decision.REJECT.label).toBe("Refused");
  });

  it("stop listening once unmounted", () => {
    let renders = 0;
    const { unmount } = renderHook(() => {
      renders += 1;
      return useT();
    });
    unmount();
    const before = renders;

    act(() => {
      setLocale("de");
    });

    expect(renders).toBe(before);
  });
});

describe("LocaleProvider", () => {
  it("sets the page language when it changes", () => {
    renderWithProviders(
      <LocaleProvider>
        <p>content</p>
      </LocaleProvider>,
    );

    act(() => {
      setLocale("de");
    });

    expect(document.documentElement.lang).toBe("de");
  });
});

describe("LanguageMenu", () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  function renderMenu() {
    return renderWithProviders(
      <SidebarProvider>
        <LocaleProvider>
          <LanguageMenu />
        </LocaleProvider>
      </SidebarProvider>,
    );
  }

  it("shows the current language on its button", () => {
    renderMenu();

    const button = screen.getByRole("button", { name: "Sprache / Language" });
    expect(within(button).getByText("Language")).toBeInTheDocument();
    expect(within(button).getByText("English")).toBeInTheDocument();
  });

  it("offers English and Deutsch, with the current one checked", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Sprache / Language" }));

    expect(await screen.findByRole("menuitemradio", { name: "English" })).toBeChecked();
    expect(screen.getByRole("menuitemradio", { name: "Deutsch" })).not.toBeChecked();
  });

  it("switches the interface to German when Deutsch is picked", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Sprache / Language" }));

    await user.click(await screen.findByRole("menuitemradio", { name: "Deutsch" }));

    expect(getLocale()).toBe("de");
    expect(document.documentElement.lang).toBe("de");
    const button = screen.getByRole("button", { name: "Sprache / Language" });
    expect(within(button).getByText("Sprache")).toBeInTheDocument();
    expect(within(button).getByText("Deutsch")).toBeInTheDocument();
  });
});
