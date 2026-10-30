"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, type ReactNode } from "react";

import type { RequestResult } from "@/api/types";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";

const SPLIT_QUERY = "(min-width: 1280px)";

type ListArgs = { selectedId: string | null; onSelect: (requestId: string) => void; selectOnArrow: boolean };

type ListDetailProps = {
  results: RequestResult[];
  /** Where a selected id is looked up: a case stays open after it leaves a filtered list. */
  lookup?: RequestResult[];
  /** Route of the page; ?id=<request id> selects a request. */
  basePath: string;
  list: (args: ListArgs) => ReactNode;
  detail: (result: RequestResult) => ReactNode;
};

/** List beside the selected item on wide screens; the item opens in a sheet below 1280 px. */
export function ListDetail({ results, lookup = results, basePath, list, detail }: ListDetailProps) {
  const router = useRouter();
  const selectedParam = useSearchParams().get("id");
  const split = useMediaQuery(SPLIT_QUERY);
  const closedId = useRef<string | null>(null);
  const selected =
    lookup.find((result) => result.request_id === selectedParam) ?? (split ? (results[0] ?? null) : null);

  const select = (requestId: string | null) => {
    router.replace(requestId ? `${basePath}?id=${encodeURIComponent(requestId)}` : basePath, {
      scroll: false,
    });
  };

  return (
    <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(420px,520px)_minmax(0,1fr)]">
      <div className="relative min-h-0 md:overflow-y-auto xl:border-r">
        {list({ selectedId: selected?.request_id ?? null, onSelect: select, selectOnArrow: split })}
      </div>
      {split ? (
        <div className="relative min-h-0 overflow-y-auto">
          {selected ? <div key={selected.request_id}>{detail(selected)}</div> : null}
        </div>
      ) : (
        <Sheet
          open={selected !== null}
          onOpenChange={(open) => {
            if (open) return;
            closedId.current = selected?.request_id ?? null;
            select(null);
          }}
        >
          <SheetContent
            side="right"
            className="overflow-y-auto pt-8 sm:max-w-2xl"
            onCloseAutoFocus={(event) => {
              // The sheet has no trigger element; return focus to the row that opened it.
              event.preventDefault();
              const id = closedId.current;
              if (id) document.querySelector<HTMLElement>(`[data-request="${CSS.escape(id)}"]`)?.focus();
            }}
          >
            <SheetTitle className="sr-only">Request {selected?.request_id}</SheetTitle>
            <SheetDescription className="sr-only">Decision details</SheetDescription>
            {selected ? detail(selected) : null}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
