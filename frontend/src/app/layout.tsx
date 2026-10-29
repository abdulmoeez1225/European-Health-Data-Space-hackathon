import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";

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
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141c29" },
  ],
};

// Before first paint: ?theme=dark|light forces a colour scheme (demos, screenshots), and the old
// single-page links (/#staff, /#spe, /#privacy) are forwarded to their routes.
const BOOT_SCRIPT = `try{var t=new URLSearchParams(location.search).get("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t;var h=location.hash.slice(1);if(location.pathname==="/"&&(h==="staff"||h==="spe"||h==="privacy"))location.replace("/"+h+"/"+location.search)}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <AppHeader />
            <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 pt-8 pb-16 sm:px-6 lg:px-8">
              {children}
            </main>
            <footer className="border-t border-line">
              <div className="mx-auto flex max-w-[1240px] flex-wrap justify-between gap-2 px-4 py-5 text-sm text-muted sm:px-6 lg:px-8">
                <span>Synthetic data only · Decided automatically · reviewed by HDAB staff</span>
                <span>Regulation (EU) 2025/327, Chapter IV</span>
              </div>
            </footer>
          </div>
        </Providers>
      </body>
    </html>
  );
}
