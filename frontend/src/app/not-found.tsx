import Link from "next/link";

import { PageBody } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageBody>
      <div className="mx-auto flex max-w-md flex-col items-center gap-2 py-24 text-center">
        <p className="font-mono text-xs text-muted-foreground">404</p>
        <h1 className="text-[17px] font-medium">Page not found</h1>
        <p className="text-[13px] text-muted-foreground">This page does not exist in Gatekeeper.</p>
        <Button asChild className="mt-4">
          <Link href="/">Go to Request data</Link>
        </Button>
      </div>
    </PageBody>
  );
}
