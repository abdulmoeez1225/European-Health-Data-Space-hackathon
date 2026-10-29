"use client";

import { FileText, FlaskConical, Inbox, ShieldCheck, ShieldHalf } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { isMockMode } from "@/api/client";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Applicant portal", icon: FileText },
  { href: "/staff/", label: "Staff console", icon: Inbox },
  { href: "/spe/", label: "Secure environment", icon: ShieldHalf },
  { href: "/privacy/", label: "Privacy & audit", icon: ShieldCheck },
] as const;

const noop = () => () => undefined;

function useMockMode(): boolean {
  return useSyncExternalStore(noop, isMockMode, () => false);
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href.replace(/\/$/, ""));
}

export function AppHeader() {
  const pathname = usePathname();
  const mock = useMockMode();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pt-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-3 rounded-lg">
          <span
            aria-hidden
            className="grid size-10 place-items-center rounded-[10px] bg-accent text-accent-fg"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3l7 2.6v5.2c0 4.6-3 8.2-7 9.7-4-1.5-7-5.1-7-9.7V5.6z" strokeLinejoin="round" />
              <path d="M9 12l2.2 2.2L15.5 10" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span>
            <span className="block text-base leading-tight font-bold tracking-tight sm:text-lg">
              Gatekeeper — Health Data Access Body
            </span>
            <span className="block text-[0.8125rem] text-muted">EHDS · Regulation (EU) 2025/327</span>
          </span>
        </Link>
        {mock ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn ring-1 ring-warn/40 ring-inset">
            <FlaskConical aria-hidden className="size-3.5" />
            Mock data — backend not used
          </span>
        ) : null}
      </div>
      <nav aria-label="Main" className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <ul className="-mb-px flex gap-1 overflow-x-auto pt-3">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 border-b-[3px] px-3 py-2.5 focus-visible:outline-offset-[-3px] text-sm font-semibold whitespace-nowrap transition-colors",
                    active ? "border-accent text-accent" : "border-transparent text-muted hover:text-fg",
                  )}
                >
                  <Icon aria-hidden className="size-4" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
