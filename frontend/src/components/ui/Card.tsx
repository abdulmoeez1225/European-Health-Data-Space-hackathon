import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-[14px] border border-line bg-surface shadow-card", className)} {...props} />
  );
}

type SectionProps = {
  title: ReactNode;
  icon?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div";
  headingLevel?: 2 | 3;
};

/** A titled card: heading row with optional icon, description and actions. */
export function Section({
  title,
  icon,
  description,
  actions,
  children,
  className,
  as: Tag = "section",
  headingLevel = 3,
}: SectionProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Tag className={cn("rounded-[14px] border border-line bg-surface p-5 shadow-card sm:p-6", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Heading className="flex items-center gap-2 text-base font-semibold text-fg">
            {icon ? (
              <span aria-hidden className="text-muted [&>svg]:size-[18px]">
                {icon}
              </span>
            ) : null}
            {title}
          </Heading>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Tag>
  );
}

/** Small uppercase label above a group of content. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold tracking-[0.08em] text-muted uppercase", className)}>
      {children}
    </p>
  );
}
