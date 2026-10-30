/**
 * Two separate workspaces: applicants (researchers and organisations) and the Health Data Access
 * Body's staff. An applicant workspace never lists or links a staff route.
 */
import { messages } from "@/i18n/runtime";

export type WorkspaceId = "applicant" | "staff";

type NavItem = { path: string; href: string; readonly title: string };

type Workspace = { readonly name: string; readonly audience: string; home: string; items: NavItem[] };

/** Titles and names are read in the active language each time they are used. */
function item(path: string, href: string): NavItem {
  return {
    path,
    href,
    get title() {
      return messages().shell.nav[path] ?? path;
    },
  };
}

function workspace(id: WorkspaceId, home: string, items: NavItem[]): Workspace {
  return {
    home,
    items,
    get name() {
      return messages().shell.workspaces[id].name;
    },
    get audience() {
      return messages().shell.workspaces[id].audience;
    },
  };
}

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  applicant: workspace("applicant", "/", [
    item("/", "/"),
    item("/requests", "/requests/"),
    item("/spe", "/spe/"),
  ]),
  staff: workspace("staff", "/staff/", [
    item("/staff", "/staff/"),
    item("/staff/privacy", "/staff/privacy/"),
  ]),
};

/** "/staff/" and "/staff" are the same page (the static export uses trailing slashes). */
export function normalisePath(pathname: string | null): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "");
}

export function routeFor(pathname: string | null): { workspace: WorkspaceId; title: string } | null {
  const path = normalisePath(pathname);
  for (const workspace of Object.keys(WORKSPACES) as WorkspaceId[]) {
    const item = WORKSPACES[workspace].items.find((candidate) => candidate.path === path);
    if (item) return { workspace, title: item.title };
  }
  return null;
}
