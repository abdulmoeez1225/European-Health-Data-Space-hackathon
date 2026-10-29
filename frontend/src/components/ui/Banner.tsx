import { AlertTriangle, Info, ShieldAlert, XCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Tone = "info" | "error" | "blocked" | "warn";

const TONES: Record<Tone, { className: string; icon: ReactNode }> = {
  info: { className: "border-accent/30 bg-accent-soft text-fg", icon: <Info className="text-accent" /> },
  warn: { className: "border-warn/40 bg-warn-soft text-fg", icon: <AlertTriangle className="text-warn" /> },
  error: { className: "border-reject/40 bg-reject-soft text-fg", icon: <XCircle className="text-reject" /> },
  blocked: {
    className: "border-reject/50 bg-reject-soft text-fg",
    icon: <ShieldAlert className="text-reject" />,
  },
};

type BannerProps = {
  tone?: Tone;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  live?: boolean;
};

export function Banner({ tone = "info", title, children, action, className, live = false }: BannerProps) {
  const { className: toneClass, icon } = TONES[tone];
  return (
    <div
      role={live ? "alert" : undefined}
      className={cn("flex animate-reveal gap-3 rounded-xl border px-4 py-3.5", toneClass, className)}
    >
      <span aria-hidden className="mt-0.5 shrink-0 [&>svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 text-sm text-muted">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  );
}
