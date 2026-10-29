import { Check, X } from "lucide-react";

import type { PrivacyCheck } from "@/api/types";
import { cn } from "@/lib/cn";

export function CheckList({ checks }: { checks: PrivacyCheck[] }) {
  return (
    <ul className="grid gap-3">
      {checks.map((check) => (
        <li key={check.name} className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
              check.passed ? "bg-stats-soft text-stats" : "bg-reject-soft text-reject",
            )}
          >
            {check.passed ? (
              <Check role="img" aria-label="Passed" className="size-3.5" strokeWidth={3} />
            ) : (
              <X role="img" aria-label="Failed" className="size-3.5" strokeWidth={3} />
            )}
          </span>
          <div className="min-w-0">
            <p className="font-semibold">{check.name}</p>
            <p className="text-sm text-muted">{check.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
