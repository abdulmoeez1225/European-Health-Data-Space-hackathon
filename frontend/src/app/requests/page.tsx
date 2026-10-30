import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { MyRequests } from "@/features/applicant/MyRequests";

export const metadata: Metadata = { title: "My requests" };

export default function MyRequestsPage() {
  return (
    <PageBody width="reading">
      <Suspense fallback={<Skeleton className="h-64 rounded-xl" />}>
        <MyRequests />
      </Suspense>
    </PageBody>
  );
}
