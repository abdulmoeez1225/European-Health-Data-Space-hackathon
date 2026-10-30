import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] transition-colors duration-100 outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/25 dark:bg-white/[0.02]",
        className,
      )}
      {...props}
    />
  );
}
