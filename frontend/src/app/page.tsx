import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { NewRequest } from "@/features/applicant/NewRequest";

export const metadata: Metadata = { title: "Request data" };

export default function NewRequestPage() {
  return (
    <PageBody width="reading">
      <Suspense fallback={<Skeleton className="h-[560px] rounded-xl" />}>
        <NewRequest />
      </Suspense>
    </PageBody>
  );
}
