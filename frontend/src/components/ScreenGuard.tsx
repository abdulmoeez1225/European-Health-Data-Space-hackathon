"use client";

import { EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

import {
  GUARD_MESSAGES,
  SCREEN_GUARD_ENABLED,
  blockedShortcut,
  isCaptureShortcut,
  isEditableTarget,
  type GuardReason,
} from "@/lib/screen-guard";

/** How long the page stays hidden after a screenshot or blocked shortcut, while focus stays here. */
const SHIELD_MS = 3000;

function overwriteClipboard(): void {
  // Print Screen puts the image on the clipboard; replacing it leaves nothing to paste.
  navigator.clipboard?.writeText("Screenshots are disabled on Gatekeeper.").catch(() => undefined);
}

/**
 * Screen-capture protection for every page (see lib/screen-guard). The shield is toggled through
 * a data attribute on <html> inside the event handler itself, so it is painted on the next frame
 * instead of waiting for React to re-render.
 */
export function ScreenGuard() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!SCREEN_GUARD_ENABLED) return;
    const root = document.documentElement;
    let timer: number | undefined;
    let flashing = false;

    const hide = () => {
      root.dataset.screenGuard = "hidden";
    };
    const reveal = () => {
      if (flashing || document.visibilityState === "hidden") return;
      delete root.dataset.screenGuard;
    };
    const flash = (reason: GuardReason) => {
      hide();
      flashing = true;
      setMessage(GUARD_MESSAGES[reason]);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        flashing = false;
        setMessage(null);
        if (document.hasFocus()) reveal();
      }, SHIELD_MS);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isCaptureShortcut(event)) {
        event.preventDefault();
        flash("capture");
        return;
      }
      const reason = blockedShortcut(event);
      if (reason) {
        event.preventDefault();
        event.stopPropagation();
        flash(reason);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "PrintScreen" || event.code === "PrintScreen") {
        overwriteClipboard();
        flash("capture");
      }
    };
    const onCopy = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      flash("copy");
    };
    const onContextMenu = (event: MouseEvent) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    const onDragStart = (event: DragEvent) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") hide();
      else reveal();
    };
    const onBeforePrint = () => {
      flash("print");
    };

    const listeners: [EventTarget, string, EventListener][] = [
      [window, "keydown", onKeyDown as EventListener],
      [window, "keyup", onKeyUp as EventListener],
      [document, "copy", onCopy as EventListener],
      [document, "cut", onCopy as EventListener],
      [document, "contextmenu", onContextMenu as EventListener],
      [document, "dragstart", onDragStart as EventListener],
      [window, "blur", hide],
      [window, "focus", reveal],
      [document, "visibilitychange", onVisibility],
      [window, "beforeprint", onBeforePrint],
    ];
    for (const [target, type, listener] of listeners) target.addEventListener(type, listener, true);
    if (!document.hasFocus()) hide();

    return () => {
      for (const [target, type, listener] of listeners) target.removeEventListener(type, listener, true);
      window.clearTimeout(timer);
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
      <p className="text-sm font-medium text-foreground">Content hidden to protect health data</p>
      <p className="max-w-md text-xs text-muted-foreground">
        {message ??
          "Return to this window to continue. Screenshots and screen sharing of Gatekeeper are not allowed."}
      </p>
    </div>
  );
}
