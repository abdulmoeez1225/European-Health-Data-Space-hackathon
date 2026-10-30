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
    <div className="sticky top-0 z-20 flex h-11 shrink-0 items-center gap-2 border-b bg-background px-3">
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

type PageHeaderProps = { title: string; description?: ReactNode; actions?: ReactNode; className?: string };

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn("flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6", className)}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-[17px] leading-6 font-medium tracking-[-0.01em]">{title}</h1>
        {description ? <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function PageBody({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className="relative min-h-0 flex-1 md:overflow-y-auto">
      <div className={cn("mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8", className)}>
        {children}
      </div>
    </div>
  );
}
