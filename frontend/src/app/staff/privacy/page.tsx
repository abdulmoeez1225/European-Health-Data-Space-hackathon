import type { Metadata } from "next";

import { PageBody } from "@/components/PageHeader";
import { PrivacyAudit } from "@/features/privacy/PrivacyAudit";

export const metadata: Metadata = { title: "Privacy & audit" };

export default function PrivacyPage() {
  return (
    <PageBody>
      <PrivacyAudit />
    </PageBody>
  );
}
