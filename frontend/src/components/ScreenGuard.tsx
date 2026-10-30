"use client";

import { EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

import { getLocale, messages, useT } from "@/i18n";
import {
  SCREEN_GUARD_ENABLED,
  blockedShortcut,
  isCaptureShortcut,
  isEditableTarget,
  isModifierKey,
  isWindowsPlatform,
  type GuardReason,
} from "@/lib/screen-guard";

function overwriteClipboard(): void {
  // Print Screen puts the image on the clipboard; replacing it leaves nothing to paste.
  const text = messages(getLocale()).shell.screenGuard.clipboard;
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

/**
 * Screen-capture protection for every page (see lib/screen-guard). The shield is toggled through
 * a data attribute on <html> inside the event handler itself, so it is painted on the next frame
 * instead of waiting for React to re-render.
 *
 * Once hidden, the page comes back only when the user clicks or presses a key in it. Getting focus
 * back is not enough: Snipping Tool's "New" returns focus to the browser just before it freezes the
 * screen, so showing the page on focus would put it in the screenshot.
 */
export function ScreenGuard() {
  const t = useT().shell.screenGuard;
  const [reason, setReason] = useState<GuardReason | null>(null);

  useEffect(() => {
    if (!SCREEN_GUARD_ENABLED) return;
    const root = document.documentElement;
    const windows = isWindowsPlatform();

    const isHidden = () => root.dataset.screenGuard === "hidden";
    const hide = (why?: GuardReason) => {
      root.dataset.screenGuard = "hidden";
      if (why) setReason(why);
    };
    const reveal = () => {
      delete root.dataset.screenGuard;
      setReason(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isCaptureShortcut(event, windows)) {
        event.preventDefault();
        hide("capture");
        return;
      }
      const blocked = blockedShortcut(event);
      if (blocked) {
        event.preventDefault();
        event.stopPropagation();
        hide(blocked);
      } else if (isHidden() && !isModifierKey(event)) {
        // The key that brings the page back does not reach the field or button underneath.
        event.preventDefault();
        event.stopPropagation();
        reveal();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen" || event.code === "PrintScreen") {
        overwriteClipboard();
        hide("capture");
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!isHidden()) return;
      // The press landed on the shield: menus and dialogs underneath must not take it as a click outside.
      event.stopPropagation();
      reveal();
    };
    const onCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      hide("copy");
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    const onDragStart = (event: DragEvent) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    const onBlur = (event: FocusEvent) => {
      // In the capture phase this also sees focus moving between elements; only the window's own blur counts.
      if (event.target === event.currentTarget) hide();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide();
    };
    const onBeforePrint = () => {
      hide("print");
    };

    const listeners: [EventTarget, string, EventListener][] = [
      [window, "keydown", onKeyDown as EventListener],
      [window, "keyup", onKeyUp as EventListener],
      [window, "pointerdown", onPointerDown as EventListener],
      [document, "copy", onCopy as EventListener],
      [document, "cut", onCopy as EventListener],
      [document, "contextmenu", onContextMenu as EventListener],
      [document, "dragstart", onDragStart as EventListener],
      [window, "blur", onBlur as EventListener],
      [document, "visibilitychange", onVisibility],
      [window, "beforeprint", onBeforePrint],
    ];
    for (const [target, type, listener] of listeners) target.addEventListener(type, listener, true);
    if (!document.hasFocus()) hide();

    return () => {
      for (const [target, type, listener] of listeners) target.removeEventListener(type, listener, true);
      delete root.dataset.screenGuard;
    };
  }, []);

  if (!SCREEN_GUARD_ENABLED) return null;

  return (
    <div
      data-slot="screen-shield"
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex-col items-center justify-center gap-3 bg-background px-6 text-center"
    >
      <EyeOff className="size-8 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-medium text-foreground">{t.title}</p>
      <p className="max-w-md text-xs text-muted-foreground">{reason ? t.reasons[reason] : t.policy}</p>
      <p className="max-w-md text-xs text-muted-foreground">{t.resume}</p>
    </div>
  );
}
