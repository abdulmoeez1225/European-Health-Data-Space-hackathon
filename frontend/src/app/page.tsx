import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { NewRequest } from "@/features/applicant/NewRequest";

export const metadata: Metadata = { title: "Request data" };

export default function NewRequestPage() {
  return (
    <PageBody>
      <Suspense fallback={<Skeleton className="mx-auto h-[560px] max-w-3xl rounded-lg" />}>
        <NewRequest />
      </Suspense>
    </PageBody>
  );
}
