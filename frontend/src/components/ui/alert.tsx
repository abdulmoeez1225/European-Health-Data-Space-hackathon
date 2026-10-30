import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-ui has-[>svg]:grid-cols-[1rem_1fr] has-[>svg]:gap-x-2.5 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "border-transparent bg-muted text-foreground [&>svg]:text-muted-foreground",
        destructive: "border-transparent bg-destructive/10 text-destructive",
        warning: "border-transparent bg-warning/10 text-warning",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Alert({
  className,
  variant,
  ...props
}: ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  // Callers add role="alert" only for messages that appear in response to an action.
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="alert-title" className={cn("col-start-2 font-medium", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid justify-items-start gap-1 text-ui text-foreground/85", className)}
      {...props}
    />
  );
}
