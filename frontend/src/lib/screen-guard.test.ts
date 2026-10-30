import { describe, expect, it, vi } from "vitest";

import {
  blockedShortcut,
  isCaptureShortcut,
  isEditableTarget,
  isModifierKey,
  isWindowsPlatform,
} from "./screen-guard";

const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

describe("isCaptureShortcut", () => {
  it("catches Print Screen", () => {
    expect(isCaptureShortcut(key({ key: "PrintScreen", code: "PrintScreen" }))).toBe(true);
    expect(isCaptureShortcut(key({ key: "Unidentified", code: "PrintScreen" }))).toBe(true);
  });

  it("catches Win+Shift and Cmd+Shift before the last key of the chord", () => {
    expect(isCaptureShortcut(key({ key: "Shift", metaKey: true, shiftKey: true }))).toBe(true);
    expect(isCaptureShortcut(key({ key: "4", code: "Digit4", metaKey: true, shiftKey: true }))).toBe(true);
  });

  it("leaves other keys alone", () => {
    expect(isCaptureShortcut(key({ key: "Meta", metaKey: true }))).toBe(false);
    expect(isCaptureShortcut(key({ key: "S", code: "KeyS", ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isCaptureShortcut(key({ key: "a", code: "KeyA" }))).toBe(false);
  });

  it("on Windows, catches the Windows key on its own, the first key of Win+Shift+S", () => {
    const windows = true;
    expect(isCaptureShortcut(key({ key: "Meta", code: "MetaLeft", metaKey: true }), windows)).toBe(true);
    expect(isCaptureShortcut(key({ key: "s", code: "KeyS", metaKey: true }), windows)).toBe(true);
    expect(isCaptureShortcut(key({ key: "s", code: "KeyS", ctrlKey: true }), windows)).toBe(false);
  });
});

describe("isWindowsPlatform", () => {
  it("reads the operating system from the user agent", () => {
    const agent = vi.spyOn(navigator, "userAgent", "get");
    agent.mockReturnValue("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0");
    expect(isWindowsPlatform()).toBe(true);
    agent.mockReturnValue("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15");
    expect(isWindowsPlatform()).toBe(false);
    agent.mockRestore();
  });
});

describe("isModifierKey", () => {
  it("does not count modifiers or Print Screen as the user coming back", () => {
    for (const name of ["Meta", "Shift", "Control", "Alt", "AltGraph", "PrintScreen"]) {
      expect(isModifierKey(key({ key: name }))).toBe(true);
    }
    expect(isModifierKey(key({ key: "a" }))).toBe(false);
    expect(isModifierKey(key({ key: "Enter" }))).toBe(false);
  });
});

describe("blockedShortcut", () => {
  it("names print, save and view-source shortcuts", () => {
    expect(blockedShortcut(key({ key: "p", code: "KeyP", ctrlKey: true }))).toBe("print");
    expect(blockedShortcut(key({ key: "s", code: "KeyS", metaKey: true }))).toBe("save");
    expect(blockedShortcut(key({ key: "u", code: "KeyU", ctrlKey: true }))).toBe("source");
  });

  it("names the developer tools shortcuts, including macOS Option keys", () => {
    expect(blockedShortcut(key({ key: "F12", code: "F12" }))).toBe("devtools");
    expect(blockedShortcut(key({ key: "I", code: "KeyI", ctrlKey: true, shiftKey: true }))).toBe("devtools");
    expect(blockedShortcut(key({ key: "ˆ", code: "KeyI", metaKey: true, altKey: true }))).toBe("devtools");
  });

  it("allows copy, paste and other shortcuts", () => {
    expect(blockedShortcut(key({ key: "c", code: "KeyC", ctrlKey: true }))).toBeNull();
    expect(blockedShortcut(key({ key: "v", code: "KeyV", metaKey: true }))).toBeNull();
    expect(blockedShortcut(key({ key: "P", code: "KeyP", ctrlKey: true, shiftKey: true }))).toBeNull();
    expect(blockedShortcut(key({ key: "p", code: "KeyP" }))).toBeNull();
  });
});

describe("isEditableTarget", () => {
  it("accepts text fields and editable content", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.append(child);
    expect(isEditableTarget(document.createElement("input"))).toBe(true);
    expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
    expect(isEditableTarget(child)).toBe(true);
  });

  it("rejects page content and non-elements", () => {
    expect(isEditableTarget(document.createElement("p"))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(window)).toBe(false);
  });
});
