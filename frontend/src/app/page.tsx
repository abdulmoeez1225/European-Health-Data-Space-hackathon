import { Suspense } from "react";

import { PageIntro } from "@/components/PageIntro";
import { SkeletonRows } from "@/components/ui/States";
import { ApplicantPortal } from "@/features/applicant/ApplicantPortal";

export default function ApplicantPage() {
  return (
    <>
      <PageIntro title="Submit a data request">
        Choose a sample request or paste your own. The decision is made automatically and explained in plain
        language, with the articles of the regulation it relies on.
      </PageIntro>
      <Suspense fallback={<SkeletonRows rows={2} />}>
        <ApplicantPortal />
      </Suspense>
    </>
  );
}
