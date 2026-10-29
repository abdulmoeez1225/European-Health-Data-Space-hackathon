import { ShieldAlert } from "lucide-react";

import { ArticleChip } from "@/components/ArticleChip";
import { CopyButton } from "@/components/ui/CopyButton";
import { formatTime } from "@/lib/format";

type Props = { message: string; auditId: string | null; at: string };

/** The moment a researcher tries to take data out: firm, specific, logged. */
export function DownloadBlocked({ message, auditId, at }: Props) {
  return (
    <div
      role="alert"
      className="animate-pop overflow-hidden rounded-[14px] border-2 border-reject/60 bg-surface shadow-raised"
    >
      <div className="flex flex-wrap items-start gap-4 bg-reject-soft px-5 py-5 sm:px-6">
        <span
          aria-hidden
          className="grid size-12 shrink-0 place-items-center rounded-full bg-reject text-on-status"
        >
          <ShieldAlert className="size-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xl font-bold text-reject">
            Download blocked <ArticleChip article="73" />
          </p>
          <p className="mt-1 text-fg">Data cannot leave the secure processing environment.</p>
          <p className="mt-1 text-sm text-muted">{message}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
        <p className="text-muted">
          Logged in the audit trail{auditId ? " as " : ""}
          {auditId ? <span className="font-mono font-semibold text-fg">{auditId}</span> : null} ·{" "}
          {formatTime(at)}
        </p>
        {auditId ? <CopyButton text={auditId} label="Copy audit ID" /> : null}
      </div>
    </div>
  );
}
