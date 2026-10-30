import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScreenGuard } from "./ScreenGuard";

const hidden = () => document.documentElement.dataset.screenGuard === "hidden";
const shield = () => screen.getByRole("status");

beforeEach(() => {
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScreenGuard", () => {
  it("hides the page as soon as a screenshot chord starts and keeps it hidden until the user is back", () => {
    render(<ScreenGuard />);
    expect(hidden()).toBe(false);

    fireEvent.keyDown(window, { key: "Shift", code: "ShiftLeft", metaKey: true, shiftKey: true });
    expect(hidden()).toBe(true);
    expect(shield()).toHaveTextContent(/Screenshots are not allowed/);

    fireEvent.keyDown(window, { key: "Shift", code: "ShiftLeft", shiftKey: true });
    expect(hidden()).toBe(true);

    fireEvent.pointerDown(shield());
    expect(hidden()).toBe(false);
  });

  it("hides the page on the Windows key alone on Windows, before Win+Shift+S reaches Snipping Tool", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
    render(<ScreenGuard />);
    fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
    expect(hidden()).toBe(true);
  });

  it("leaves the Command key alone elsewhere, so Cmd+C and Cmd+V keep working", () => {
    render(<ScreenGuard />);
    fireEvent.keyDown(window, { key: "Meta", code: "MetaLeft", metaKey: true });
    expect(hidden()).toBe(false);
  });

  it("hides the page after Print Screen", () => {
    render(<ScreenGuard />);
    fireEvent.keyUp(window, { key: "PrintScreen", code: "PrintScreen" });
    expect(hidden()).toBe(true);
  });

  it("blocks print, save and developer tools shortcuts but not copy", () => {
    render(<ScreenGuard />);
    expect(fireEvent.keyDown(window, { key: "c", code: "KeyC", ctrlKey: true })).toBe(true);
    expect(hidden()).toBe(false);

    expect(fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true })).toBe(false);
    expect(shield()).toHaveTextContent(/Printing is disabled/);
    expect(fireEvent.keyDown(window, { key: "s", code: "KeyS", metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(window, { key: "F12", code: "F12" })).toBe(false);
  });

  it("blocks copying and the context menu on page text, not in text fields", () => {
    render(
      <>
        <p>Burgenland 33</p>
        <textarea aria-label="Request JSON" defaultValue="{}" />
        <ScreenGuard />
      </>,
    );
    const text = screen.getByText("Burgenland 33");
    const field = screen.getByLabelText("Request JSON");
    expect(fireEvent.copy(text)).toBe(false);
    expect(fireEvent.copy(field)).toBe(true);
    expect(fireEvent.contextMenu(text)).toBe(false);
    expect(fireEvent.contextMenu(field)).toBe(true);
  });

  it("keeps the page hidden after the window loses focus until the user clicks or types in it", () => {
    render(<ScreenGuard />);
    fireEvent.blur(window);
    expect(hidden()).toBe(true);
    expect(shield()).toHaveTextContent(/Click anywhere or press any key/);

    // Snipping Tool's "New" gives focus back to the browser just before it takes the picture.
    fireEvent.focus(window);
    expect(hidden()).toBe(true);

    expect(fireEvent.keyDown(window, { key: "a", code: "KeyA" })).toBe(false);
    expect(hidden()).toBe(false);

    fireEvent.blur(window);
    fireEvent.pointerDown(shield());
    expect(hidden()).toBe(false);
  });

  it("keeps the press that shows the page again away from the page underneath", () => {
    const outside = vi.fn();
    document.addEventListener("pointerdown", outside);
    render(<ScreenGuard />);

    fireEvent.blur(window);
    fireEvent.pointerDown(shield());
    expect(outside).not.toHaveBeenCalled();

    fireEvent.pointerDown(shield());
    expect(outside).toHaveBeenCalledTimes(1);
    document.removeEventListener("pointerdown", outside);
  });

  it("stays hidden when the tab is shown again", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<ScreenGuard />);
    fireEvent(document, new Event("visibilitychange"));
    expect(hidden()).toBe(true);

    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    expect(hidden()).toBe(true);
  });

  it("does not hide the page when focus moves between its own elements", () => {
    render(
      <>
        <button type="button">First</button>
        <button type="button">Second</button>
        <ScreenGuard />
      </>,
    );
    screen.getByRole("button", { name: "First" }).focus();
    screen.getByRole("button", { name: "Second" }).focus();
    screen.getByRole("button", { name: "Second" }).blur();
    expect(hidden()).toBe(false);
  });

  it("removes the shield when it unmounts", () => {
    const { unmount } = render(<ScreenGuard />);
    fireEvent.blur(window);
    unmount();
    expect(hidden()).toBe(false);
  });
});
