"use client";

import { createContext, useContext, type ReactNode } from "react";

/** "<permit> · <organisation> · <opened at>": who looked at these records, and when (Art. 73). */
export const WatermarkContext = createContext("");

const TILES = 60;

/** Lays the workspace watermark over a record view; clicks and text selection pass through. */
export function Watermarked({ children }: { children: ReactNode }) {
  const text = useContext(WatermarkContext);
  if (!text) return children;
  return (
    <div className="relative isolate">
      {children}
      <div
        aria-hidden
        data-testid="watermark"
        className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-lg select-none"
      >
        <div className="absolute -inset-1/2 flex -rotate-24 flex-wrap content-center gap-x-24 gap-y-20">
          {Array.from({ length: TILES }, (_, index) => (
            <span
              key={index}
              className="font-mono text-xs whitespace-nowrap text-foreground/[0.07] dark:text-foreground/[0.06]"
            >
              {text}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
