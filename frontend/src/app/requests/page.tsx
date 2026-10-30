import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { MyRequests } from "@/features/applicant/MyRequests";

export const metadata: Metadata = { title: "My requests" };

export default function MyRequestsPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-64" />}>
      <MyRequests />
    </Suspense>
  );
}
