import type { Metadata } from "next";
import { Suspense } from "react";

import { PageIntro } from "@/components/PageIntro";
import { Skeleton } from "@/components/ui/States";
import { SecureEnvironment } from "@/features/spe/SecureEnvironment";

export const metadata: Metadata = { title: "Secure environment" };

export default function SpePage() {
  return (
    <>
      <PageIntro title="Secure processing environment">
        Pseudonymised records can be analysed here but never downloaded (Art. 73). Only aggregate results can
        leave, through the airlock.
      </PageIntro>
      <Suspense fallback={<Skeleton className="h-44 rounded-[14px]" />}>
        <SecureEnvironment />
      </Suspense>
    </>
  );
}
