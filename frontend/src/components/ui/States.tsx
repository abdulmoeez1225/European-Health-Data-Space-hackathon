import { RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { errorMessage } from "@/api/errors";
import { cn } from "@/lib/cn";

import { Banner } from "./Banner";
import { Button } from "./Button";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-lg bg-surface-2", className)} />;
}

export function SkeletonRows({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn("grid gap-3", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

type EmptyStateProps = { icon?: ReactNode; title: ReactNode; children?: ReactNode; className?: string };

export function EmptyState({ icon, title, children, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-line-strong px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className="mb-1 grid size-11 place-items-center rounded-full bg-surface-2 text-muted [&>svg]:size-5"
        >
          {icon}
        </span>
      ) : null}
      <p className="font-semibold text-fg">{title}</p>
      {children ? <div className="max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

type ErrorStateProps = { title: string; error: unknown; onRetry?: () => void; className?: string };

export function ErrorState({ title, error, onRetry, className }: ErrorStateProps) {
  return (
    <Banner
      tone="error"
      title={title}
      className={className}
      live
      action={
        onRetry ? (
          <Button size="sm" icon={<RotateCw className="size-3.5" />} onClick={onRetry}>
            Retry
          </Button>
        ) : null
      }
    >
      {errorMessage(error)}
    </Banner>
  );
}
