import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { SecureEnvironment, SPE_DESCRIPTION } from "@/features/spe/SecureEnvironment";

export const metadata: Metadata = { title: "Secure workspace" };

export default function SpePage() {
  return (
    <PageBody>
      <Suspense
        fallback={
          <div className="grid gap-6">
            <PageHeader title="Secure workspace" description={SPE_DESCRIPTION} />
            <Skeleton className="h-14" />
            <Skeleton className="h-64" />
          </div>
        }
      >
        <SecureEnvironment />
      </Suspense>
    </PageBody>
  );
}
