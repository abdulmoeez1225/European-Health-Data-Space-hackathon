import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

type TableProps = ComponentProps<"table"> & {
  containerClassName?: string;
  /** Names the scroll container, which then becomes a focusable region for keyboard scrolling. */
  label?: string;
};

export function Table({ className, containerClassName, label, ...props }: TableProps) {
  return (
    <div
      data-slot="table-container"
      {...(label ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
      className={cn(
        "relative w-full overflow-x-auto rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        containerClassName,
      )}
    >
      <table data-slot="table" className={cn("w-full caption-bottom text-data", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({ className, ...props }: ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-divider transition-colors duration-100 hover:bg-accent/50 data-[state=selected]:bg-accent",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-4 text-left align-middle text-caption font-medium whitespace-nowrap text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("px-4 py-3 align-middle", className)} {...props} />;
}
