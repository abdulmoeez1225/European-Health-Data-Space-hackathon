import type { Metadata } from "next";

import { PrivacyAudit } from "@/features/privacy/PrivacyAudit";

export const metadata: Metadata = { title: "Privacy & audit" };

export default function PrivacyPage() {
  return <PrivacyAudit />;
}
