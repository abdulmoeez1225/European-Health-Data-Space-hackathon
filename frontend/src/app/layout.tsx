import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { TopBar } from "@/components/PageHeader";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { BOOT_SCRIPT } from "@/lib/preferences";

import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: { default: "Gatekeeper — Health Data Access Body", template: "%s · Gatekeeper" },
  description: "Automated EHDS Health Data Access Body under Regulation (EU) 2025/327. Synthetic data only.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f8" },
    { media: "(prefers-color-scheme: dark)", color: "#08090a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Providers>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <TopBar />
              {children}
            </SidebarInset>
          </SidebarProvider>
        </Providers>
      </body>
    </html>
  );
}
