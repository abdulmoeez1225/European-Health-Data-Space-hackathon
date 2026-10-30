import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border px-1.5 py-px text-xs font-medium whitespace-nowrap transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        outline: "border-border text-foreground",
        success: "border-success/25 text-success",
        warning: "border-warning/30 text-warning",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
