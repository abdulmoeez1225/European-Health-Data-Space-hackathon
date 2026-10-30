"use client";

import { ChevronsUpDown, Landmark } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar";
import { rememberWorkspace } from "@/lib/preferences";
import { WORKSPACES, type WorkspaceId } from "@/lib/routes";

/** Linear-style switcher between the applicant and the access-body workspace. */
export function WorkspaceSwitcher({ workspace }: { workspace: WorkspaceId }) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();
  const current = WORKSPACES[workspace];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          size="lg"
          tooltip={`Gatekeeper · ${current.name}`}
          aria-label={`Workspace: ${current.name}. Switch workspace`}
          className="gap-2.5 data-[state=open]:bg-sidebar-accent"
        >
          <span
            data-icon
            aria-hidden
            className="grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground [&>svg]:size-4"
          >
            <Landmark />
          </span>
          <span className="grid min-w-0 flex-1 leading-tight">
            <span className="truncate text-ui font-semibold text-sidebar-accent-foreground">Gatekeeper</span>
            <span className="truncate text-caption text-muted-foreground">{current.name}</span>
          </span>
          <ChevronsUpDown aria-hidden className="ml-auto size-3.5! text-muted-foreground collapsed:hidden" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="bottom" className="w-64">
        <DropdownMenuLabel>Workspace</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={workspace}
          onValueChange={(value) => {
            const next = value as WorkspaceId;
            rememberWorkspace(next);
            setOpenMobile(false);
            if (next !== workspace) router.push(WORKSPACES[next].home);
          }}
        >
          {(Object.keys(WORKSPACES) as WorkspaceId[]).map((id) => (
            <DropdownMenuRadioItem key={id} value={id} className="items-start">
              <span className="grid leading-tight">
                <span className="text-ui text-foreground">{WORKSPACES[id].name}</span>
                <span className="text-caption text-muted-foreground">{WORKSPACES[id].audience}</span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-caption text-subtle-foreground">
          Demo: role switch instead of sign-in
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
