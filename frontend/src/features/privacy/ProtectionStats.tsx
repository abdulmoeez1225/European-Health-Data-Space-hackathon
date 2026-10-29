"use client";

import { Bot, UserMinus, Users } from "lucide-react";
import type { ReactNode } from "react";

import { useHealth } from "@/api/queries";
import { ArticleChip } from "@/components/ArticleChip";
import { Skeleton } from "@/components/ui/States";
import { formatValue } from "@/lib/format";

function Stat({
  icon,
  label,
  value,
  extra,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  extra?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-line bg-surface px-5 py-4 shadow-card">
      <span
        aria-hidden
        className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent [&>svg]:size-5"
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm text-muted">
          {label} {extra}
        </p>
        <p className="truncate text-xl font-bold tabular-nums">{value}</p>
      </div>
    </div>
  );
}

/** Platform facts from /api/health: how many patients opted out and are excluded everywhere. */
export function ProtectionStats() {
  const health = useHealth();
  if (health.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-[14px]" />
        ))}
      </div>
    );
  }
  if (health.isError) return null;
  const { patients, llm_backend: backend } = health.data;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat icon={<Users />} label="Synthetic patients" value={formatValue(patients.total)} />
      <Stat
        icon={<UserMinus />}
        label="Opted out, excluded everywhere"
        value={formatValue(patients.opted_out)}
        extra={<ArticleChip article="71" />}
      />
      <Stat icon={<Bot />} label="Language model backend" value={backend} />
    </div>
  );
}
