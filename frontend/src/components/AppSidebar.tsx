"use client";

import { FilePlus2, Inbox, ListChecks, LockKeyhole, ShieldCheck, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { isMockMode } from "@/api/client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { rememberWorkspace, storedWorkspace } from "@/lib/preferences";
import { normalisePath, routeFor, WORKSPACES } from "@/lib/routes";

import { ThemeMenu } from "./ThemeMenu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

const ICONS: Record<string, LucideIcon> = {
  "/": FilePlus2,
  "/requests": ListChecks,
  "/spe": LockKeyhole,
  "/staff": Inbox,
  "/staff/privacy": ShieldCheck,
};

const noSubscription = () => () => undefined;

export function AppSidebar() {
  const pathname = normalisePath(usePathname());
  const route = routeFor(pathname);
  // Pages outside both workspaces (404) keep the workspace used last.
  const fallback = useSyncExternalStore(noSubscription, storedWorkspace, () => "applicant" as const);
  const workspace = route?.workspace ?? fallback;
  const mock = useSyncExternalStore(noSubscription, isMockMode, () => false);
  const { setOpenMobile } = useSidebar();

  useEffect(() => {
    if (route?.workspace) rememberWorkspace(route.workspace);
  }, [route?.workspace]);

  return (
    <Sidebar label={`Gatekeeper · ${WORKSPACES[workspace].name}`}>
      <SidebarHeader className="pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <WorkspaceSwitcher workspace={workspace} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {WORKSPACES[workspace].items.map((item) => {
              const Icon = ICONS[item.path] ?? FilePlus2;
              const active = pathname === item.path;
              return (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => {
                        setOpenMobile(false);
                      }}
                    >
                      <Icon aria-hidden />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeMenu />
          </SidebarMenuItem>
        </SidebarMenu>
        <p className="flex items-center gap-1.5 px-2 pt-1 pb-1 text-[11px] leading-4 text-muted-foreground collapsed:hidden">
          <span className="truncate">Synthetic data · EHDS 2025/327</span>
          {mock ? (
            <span className="rounded-sm border px-1 text-[10px] font-medium text-foreground">Mock</span>
          ) : null}
        </p>
      </SidebarFooter>
    </Sidebar>
  );
}
