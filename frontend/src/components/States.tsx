import { AlertCircle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";

import { errorMessage } from "@/api/errors";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function EmptyState({
  icon,
  title,
  children,
  className,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1.5 px-6 py-12 text-center text-[13px] text-muted-foreground",
        className,
      )}
    >
      {icon ? <span className="mb-1 text-muted-foreground/70 [&>svg]:size-5">{icon}</span> : null}
      <p className="font-medium text-foreground">{title}</p>
      {children ? <div className="max-w-sm">{children}</div> : null}
    </div>
  );
}

export function ErrorState({
  title,
  error,
  onRetry,
  className,
}: {
  title: string;
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Alert variant="destructive" role="alert" className={className}>
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{errorMessage(error)}</p>
        {onRetry ? (
          <Button variant="outline" size="sm" className="mt-1" onClick={onRetry}>
            <RotateCw aria-hidden />
            Try again
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
