import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-md border border-input bg-field px-3 text-ui transition-colors duration-100 outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}
