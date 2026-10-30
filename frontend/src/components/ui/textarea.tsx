import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full rounded-md border border-input bg-field px-3 py-2 text-ui leading-relaxed transition-colors duration-100 outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus-visible:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}
