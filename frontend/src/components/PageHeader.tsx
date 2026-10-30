"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/cn";
import { routeFor, WORKSPACES } from "@/lib/routes";

export function TopBar() {
  const route = routeFor(usePathname());
  return (
    <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-divider bg-background px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="mx-1 h-4!" />
      <Breadcrumb className="min-w-0">
        <BreadcrumbList>
          {route ? (
            <>
              <BreadcrumbItem className="max-sm:hidden">{WORKSPACES[route.workspace].name}</BreadcrumbItem>
              <BreadcrumbSeparator className="max-sm:hidden" />
              <BreadcrumbItem>
                <BreadcrumbPage>{route.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : (
            <BreadcrumbItem>
              <BreadcrumbPage>Not found</BreadcrumbPage>
            </BreadcrumbItem>
          )}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

type PageHeaderProps = { title: string; description?: ReactNode; actions?: ReactNode };

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <h1 className="text-title font-semibold tracking-[-0.015em]">{title}</h1>
        {description ? <p className="max-w-[60ch] text-body text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Reading pages (forms, letters) use the narrower measure; tables and workspaces the wide one. */
export function PageBody({ children, width = "wide" }: { children: ReactNode; width?: "reading" | "wide" }) {
  return (
    <div className="relative min-h-0 flex-1 md:overflow-y-auto">
      <div
        className={cn(
          "mx-auto w-full px-6 pt-10 pb-12 lg:px-10",
          width === "reading" ? "max-w-[1040px]" : "max-w-[1280px]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
