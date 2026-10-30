import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-ui font-medium whitespace-nowrap transition-colors duration-100 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline: "border border-input bg-field text-foreground hover:bg-accent",
        ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive: "bg-destructive text-background hover:bg-destructive/90",
        "destructive-outline":
          "border border-destructive/35 bg-field text-destructive hover:bg-destructive/10",
      },
      size: {
        default: "h-9 px-3.5",
        sm: "h-8 px-3 text-data",
        lg: "h-10 px-4",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      {...(asChild ? {} : { type: "button" as const })}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
