"use client";

import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { messages } from "@/i18n/runtime";
import { cn } from "@/lib/cn";

export function Sheet(props: ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetContent({
  className,
  children,
  side = "right",
  showClose = true,
  ...props
}: ComponentProps<typeof SheetPrimitive.Content> & { side?: "left" | "right"; showClose?: boolean }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay
        data-slot="sheet-overlay"
        className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 z-50 flex h-full flex-col bg-background shadow-float transition ease-out data-[state=closed]:animate-out data-[state=closed]:duration-150 data-[state=open]:animate-in data-[state=open]:duration-150",
          side === "right" &&
            "right-0 w-full border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-xl",
          side === "left" &&
            "left-0 w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-xs",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <SheetPrimitive.Close className="absolute top-3 right-3 grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors duration-100 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <XIcon className="size-4" />
            <span className="sr-only">{messages().common.close}</span>
          </SheetPrimitive.Close>
        ) : null}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-card-title font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export function SheetDescription({ className, ...props }: ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-ui text-muted-foreground", className)}
      {...props}
    />
  );
}
