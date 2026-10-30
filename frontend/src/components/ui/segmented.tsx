"use client";

import { cn } from "@/lib/cn";

type Option<T extends string> = { value: T; label: string; count?: number };

/** Linear-style segmented filter: toggle buttons, exactly one pressed. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-fit items-center rounded-lg bg-muted p-1 text-muted-foreground",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => {
              onChange(option.value);
            }}
            className={cn(
              "inline-flex h-full cursor-pointer items-center gap-1.5 rounded-md px-3 text-ui font-medium whitespace-nowrap transition-colors duration-100 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
              active && "bg-card text-foreground shadow-[0_0_0_1px_var(--border)] dark:bg-accent",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="text-caption text-subtle-foreground tabular-nums">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
