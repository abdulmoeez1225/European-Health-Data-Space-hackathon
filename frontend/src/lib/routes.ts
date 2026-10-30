/**
 * Two separate workspaces: applicants (researchers and organisations) and the Health Data Access
 * Body's staff. An applicant workspace never lists or links a staff route.
 */
export type WorkspaceId = "applicant" | "staff";

type NavItem = { path: string; href: string; title: string };

type Workspace = { name: string; audience: string; home: string; items: NavItem[] };

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  applicant: {
    name: "Applicant",
    audience: "Researchers & organisations",
    home: "/",
    items: [
      { path: "/", href: "/", title: "Request data" },
      { path: "/requests", href: "/requests/", title: "My requests" },
      { path: "/spe", href: "/spe/", title: "Secure workspace" },
    ],
  },
  staff: {
    name: "Access body",
    audience: "HDAB staff",
    home: "/staff/",
    items: [
      { path: "/staff", href: "/staff/", title: "Decision queue" },
      { path: "/staff/privacy", href: "/staff/privacy/", title: "Privacy & audit" },
    ],
  },
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
