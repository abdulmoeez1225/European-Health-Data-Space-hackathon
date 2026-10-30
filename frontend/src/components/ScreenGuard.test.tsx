import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScreenGuard } from "./ScreenGuard";

const hidden = () => document.documentElement.dataset.screenGuard === "hidden";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ScreenGuard", () => {
  it("hides the page as soon as a screenshot chord starts, then shows it again", () => {
    render(<ScreenGuard />);
    expect(hidden()).toBe(false);

    fireEvent.keyDown(window, { key: "Shift", code: "ShiftLeft", metaKey: true, shiftKey: true });
    expect(hidden()).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent(/Screenshots are not allowed/);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(hidden()).toBe(false);
  });

  it("hides the page after Print Screen", () => {
    render(<ScreenGuard />);
    fireEvent.keyUp(window, { key: "PrintScreen", code: "PrintScreen" });
    expect(hidden()).toBe(true);
  });

  it("blocks print, save and developer tools shortcuts but not copy", () => {
    render(<ScreenGuard />);
    expect(fireEvent.keyDown(window, { key: "p", code: "KeyP", ctrlKey: true })).toBe(false);
    expect(screen.getByRole("status")).toHaveTextContent(/Printing is disabled/);
    expect(fireEvent.keyDown(window, { key: "s", code: "KeyS", metaKey: true })).toBe(false);
    expect(fireEvent.keyDown(window, { key: "F12", code: "F12" })).toBe(false);
    expect(fireEvent.keyDown(window, { key: "c", code: "KeyC", ctrlKey: true })).toBe(true);
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

  it("hides the page while the window is not focused", () => {
    render(<ScreenGuard />);
    fireEvent.blur(window);
    expect(hidden()).toBe(true);
    fireEvent.focus(window);
    expect(hidden()).toBe(false);
  });

  it("removes the shield when it unmounts", () => {
    const { unmount } = render(<ScreenGuard />);
    fireEvent.blur(window);
    unmount();
    expect(hidden()).toBe(false);
  });
});
