"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { useState, type ReactElement, type ReactNode } from "react";

import { cn } from "@/lib/cn";

type TooltipProps = {
  content: ReactNode;
  children: ReactElement;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
};

/** Hover/focus tooltip that also opens on tap, so touch users get the explanation too. */
export function Tooltip({ content, children, side = "top", className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  return (
    <RadixTooltip.Root open={open} onOpenChange={setOpen}>
      <RadixTooltip.Trigger
        asChild
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        {children}
      </RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            "z-50 max-w-xs animate-fade rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-snug text-fg shadow-raised",
            className,
          )}
        >
          {content}
          <RadixTooltip.Arrow className="fill-surface" width={10} height={5} />
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

export const TooltipProvider = RadixTooltip.Provider;
