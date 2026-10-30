"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Tabs({ className, ...props }: ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />;
}

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-9 w-fit items-center rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-md px-3 text-ui font-medium whitespace-nowrap transition-colors duration-100 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-[0_0_0_1px_var(--border)] dark:data-[state=active]:bg-accent [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
      {...props}
    />
  );
}
