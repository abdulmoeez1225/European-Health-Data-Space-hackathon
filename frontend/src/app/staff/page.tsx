import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Requests } from "@/features/staff/Requests";

export const metadata: Metadata = { title: "Decision queue" };

export default function RequestsPage() {
  return (
    <Suspense fallback={<Skeleton className="m-6 h-64" />}>
      <Requests />
    </Suspense>
  );
}
