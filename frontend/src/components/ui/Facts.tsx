import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type Fact = { label: string; value: ReactNode; mono?: boolean };

export function Facts({ items, className }: { items: Fact[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-x-6 gap-y-4", className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium tracking-wide text-muted uppercase">{item.label}</dt>
          <dd className={cn("mt-1 font-semibold break-words text-fg", item.mono && "font-mono text-sm")}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
