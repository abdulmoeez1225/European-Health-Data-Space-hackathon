import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex flex-col rounded-xl border bg-card text-card-foreground", className)}
      {...props}
    />
  );
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t border-divider px-8 py-4 text-caption text-subtle-foreground",
        className,
      )}
      {...props}
    />
  );
}
