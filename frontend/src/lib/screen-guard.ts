/**
 * Screen-capture protection. A web page cannot stop the operating system from taking a screenshot
 * or a camera from photographing the screen. What it can do, and ScreenGuard does:
 * - hide its content the moment a screenshot shortcut starts, or whenever the window loses focus
 *   (snipping tools take focus first), and overwrite the clipboard after Print Screen;
 * - block printing, saving, viewing the source, the developer tools shortcuts, copying and dragging.
 */

export type GuardReason = "capture" | "print" | "save" | "source" | "devtools" | "copy";

export const GUARD_MESSAGES: Record<GuardReason, string> = {
  capture: "Screenshots are not allowed. The page is hidden while a screen capture may be running.",
  print: "Printing is disabled. Pages contain protected health data.",
  save: "Saving this page is disabled. Pages contain protected health data.",
  source: "Viewing the page source is disabled.",
  devtools: "Developer tools are disabled on this site.",
  copy: "Copying from this page is disabled. Text fields still work.",
};

/** Off only when the build sets NEXT_PUBLIC_SCREEN_GUARD=off (e.g. while developing the UI). */
export const SCREEN_GUARD_ENABLED = process.env.NEXT_PUBLIC_SCREEN_GUARD !== "off";

type KeyLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

function letter(event: KeyLike): string {
  return event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
}

/**
 * Keys that start a screenshot: Print Screen, Win+Shift+S (Windows Snipping Tool) and
 * Cmd+Shift+3/4/5 (macOS). The Windows/Command key and Shift held together already count,
 * so the page is hidden before the last key reaches the operating system.
 */
export function isCaptureShortcut(event: KeyLike): boolean {
  if (event.key === "PrintScreen" || event.code === "PrintScreen") return true;
  return event.metaKey && event.shiftKey;
}

/** Shortcuts that would copy the page another way: print, save, view source, developer tools. */
export function blockedShortcut(event: KeyLike): GuardReason | null {
  const command = event.ctrlKey || event.metaKey;
  const key = letter(event);
  if (event.key === "F12") return "devtools";
  if (event.ctrlKey && event.shiftKey && ["i", "j", "c"].includes(key)) return "devtools";
  if (event.metaKey && event.altKey && ["i", "j", "c"].includes(key)) return "devtools";
  if (!command || event.shiftKey || event.altKey) return null;
  if (key === "p") return "print";
  if (key === "s") return "save";
  if (key === "u") return "source";
  return null;
}

/** Text fields keep normal copy, paste and context-menu behaviour. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}
