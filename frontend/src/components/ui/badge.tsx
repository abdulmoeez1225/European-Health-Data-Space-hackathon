import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const badgeVariants = cva(
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-md px-2 text-data font-medium whitespace-nowrap [&>svg]:pointer-events-none [&>svg]:size-3.5",
  {
    variants: {
      variant: {
        neutral: "bg-accent text-foreground",
        success: "bg-success/10 text-success",
        info: "bg-info/10 text-info",
        destructive: "bg-destructive/10 text-destructive",
        warning: "bg-warning/10 text-warning",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}
