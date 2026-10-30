"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n";

export function SkipLink() {
  const t = useT();
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
    >
      {t.shell.skipToContent}
    </a>
  );
}

export function NotFoundContent() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-24 text-center">
      <p className="font-mono text-data text-muted-foreground">404</p>
      <h1 className="text-title font-semibold">{t.shell.notFoundPage.title}</h1>
      <p className="text-body text-muted-foreground">{t.shell.notFoundPage.text}</p>
      <Button asChild className="mt-4">
        <Link href="/">{t.shell.notFoundPage.action}</Link>
      </Button>
    </div>
  );
}
