/**
 * Screen-capture protection. A web page cannot stop the operating system from taking a screenshot
 * or a camera from photographing the screen. What it can do, and ScreenGuard does:
 * - hide its content the moment a screenshot shortcut starts, or whenever the window loses focus
 *   (snipping tools take focus first), and keep it hidden until the user clicks or types in the page
 *   again: Snipping Tool hands focus back to the browser just before it freezes the screen;
 * - overwrite the clipboard after Print Screen;
 * - block printing, saving, viewing the source, the developer tools shortcuts, copying and dragging.
 */

/** Why the shield went up; it explains each one (messages: shell.screenGuard.reasons). */
export type GuardReason = "capture" | "print" | "save" | "source" | "devtools" | "copy";

/** Off only when the build sets NEXT_PUBLIC_SCREEN_GUARD=off (e.g. while developing the UI). */
export const SCREEN_GUARD_ENABLED = process.env.NEXT_PUBLIC_SCREEN_GUARD !== "off";

type KeyLike = Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

function letter(event: KeyLike): string {
  return event.code.startsWith("Key") ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
}

/** Windows, where the Windows key alone starts Win+Shift+S; on macOS Command is used for everything. */
export function isWindowsPlatform(): boolean {
  return typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);
}

/**
 * Keys that start a screenshot: Print Screen, Win+Shift+S (Windows Snipping Tool) and
 * Cmd+Shift+3/4/5 (macOS). The page hides on the first key of the chord, before the last one
 * reaches the operating system: on Windows the Windows key itself, elsewhere Command with Shift.
 */
export function isCaptureShortcut(event: KeyLike, windows = false): boolean {
  if (event.key === "PrintScreen" || event.code === "PrintScreen") return true;
  if (windows && (event.key === "Meta" || event.key === "OS" || event.metaKey)) return true;
  return event.metaKey && event.shiftKey;
}

/** Keys that never count as "the user is back": modifiers and the capture keys themselves. */
export function isModifierKey(event: Pick<KeyboardEvent, "key">): boolean {
  return ["Meta", "OS", "Shift", "Control", "Alt", "AltGraph", "PrintScreen", "CapsLock"].includes(event.key);
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
