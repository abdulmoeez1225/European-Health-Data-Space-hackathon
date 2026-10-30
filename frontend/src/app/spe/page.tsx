import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/PageHeader";
import { SecureEnvironment, SecureEnvironmentFallback } from "@/features/spe/SecureEnvironment";

export const metadata: Metadata = { title: "Secure workspace" };

export default function SpePage() {
  return (
    <PageBody>
      <Suspense fallback={<SecureEnvironmentFallback />}>
        <SecureEnvironment />
      </Suspense>
    </PageBody>
  );
}
