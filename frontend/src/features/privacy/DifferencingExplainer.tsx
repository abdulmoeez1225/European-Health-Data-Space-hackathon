import { Lock } from "lucide-react";

import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

const FIRST = 33;
const SECOND = 32;

function Tile({
  label,
  value,
  note,
  leak = false,
}: {
  label: string;
  value: string;
  note: string;
  leak?: boolean;
}) {
  return (
    <div className={cn("flex-1 basis-40 rounded-xl px-4 py-3.5", leak ? "bg-reject-soft" : "bg-surface-2")}>
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className={cn("mt-0.5 text-3xl font-bold tabular-nums", leak ? "text-reject" : "text-fg")}>
        {value}
      </p>
      <p className="text-sm text-muted">{note}</p>
    </div>
  );
}

function Operator({ children }: { children: string }) {
  return (
    <span aria-hidden className="self-center text-2xl font-light text-muted">
      {children}
    </span>
  );
}

/** 33 − 32 = 1: two safe answers that together single out one patient. */
export function DifferencingExplainer() {
  return (
    <Card className="overflow-hidden">
      <div className="border-l-[5px] border-accent p-5 sm:p-7">
        <h2 className="text-lg font-semibold">Release Ledger: blocking differencing attacks</h2>
        <p className="mt-1.5 max-w-3xl text-muted">
          Every answer can pass the small-cell rule on its own while two answers together do not. Subtracting
          one release from another reveals the group in between — even if that group is smaller than 10.
        </p>

        <div className="mt-5 flex flex-wrap items-stretch gap-3">
          <Tile label="Request 1" value={String(FIRST)} note="Adults with type 2 diabetes in Burgenland" />
          <Operator>−</Operator>
          <Tile label="Request 2" value={String(SECOND)} note="The same, aged 40 or older" />
          <Operator>=</Operator>
          <Tile label="Leak" value="1 patient" note="Exactly one adult aged 18–39 is identified" leak />
        </div>

        <figure className="mt-5">
          <div
            role="img"
            aria-label={`${FIRST} patients in the first answer; ${SECOND} of them are also in the second; one is left over`}
            className="flex flex-wrap gap-1"
          >
            {Array.from({ length: FIRST }, (_, i) => (
              <span
                key={i}
                className={cn(
                  "size-3 rounded-full",
                  i < SECOND
                    ? "bg-accent/35"
                    : "bg-reject ring-2 ring-reject/30 ring-offset-1 ring-offset-surface",
                )}
              />
            ))}
          </div>
          <figcaption className="mt-2 text-xs text-muted">
            Each dot is a patient in request 1. Blue dots are also in request 2; the red one is exposed by
            subtraction.
          </figcaption>
        </figure>

        <p className="mt-5 flex max-w-3xl items-start gap-2 text-[0.9375rem]">
          <Lock aria-hidden className="mt-1 size-4 shrink-0 text-accent" />
          <span>
            The ledger remembers which patients each applicant has already received numbers about. When a new
            answer would reveal fewer than 10 patients by subtraction, that value is withheld and the
            applicant is told why. Every suppression is listed below.
          </span>
        </p>
      </div>
    </Card>
  );
}
