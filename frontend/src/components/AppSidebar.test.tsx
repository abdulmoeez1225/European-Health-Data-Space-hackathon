import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SidebarProvider } from "@/components/ui/sidebar";
import { WORKSPACES } from "@/lib/routes";
import { renderWithProviders } from "@/test/render";

import { AppSidebar } from "./AppSidebar";

const navigation = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

function renderSidebar(pathname: string) {
  navigation.pathname = pathname;
  renderWithProviders(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>,
  );
  return screen.getByRole("navigation", { name: /Gatekeeper/ });
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("workspaces", () => {
  it("never puts a staff route in the applicant workspace", () => {
    expect(WORKSPACES.applicant.items.map((item) => item.href)).toEqual(["/", "/requests/", "/spe/"]);
    expect(WORKSPACES.applicant.items.some((item) => item.href.startsWith("/staff"))).toBe(false);
    expect(WORKSPACES.staff.items.every((item) => item.href.startsWith("/staff/"))).toBe(true);
  });
});

describe("AppSidebar", () => {
  it("shows only the applicant's pages in the applicant workspace", () => {
    const nav = renderSidebar("/requests/");

    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([
      "Request data",
      "My requests",
      "Secure workspace",
    ]);
    expect(links.some((link) => link.getAttribute("href")?.startsWith("/staff"))).toBe(false);
    expect(within(nav).queryByText("Decision queue")).not.toBeInTheDocument();
    expect(within(nav).queryByText("Privacy & audit")).not.toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "My requests" })).toHaveAttribute("aria-current", "page");
  });

  it("shows only the staff pages in the access-body workspace", () => {
    const nav = renderSidebar("/staff/privacy/");

    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Decision queue", "Privacy & audit"]);
    expect(within(nav).getByRole("link", { name: "Privacy & audit" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(nav).getByRole("button", { name: /Workspace: Access body/ })).toBeInTheDocument();
  });
});
