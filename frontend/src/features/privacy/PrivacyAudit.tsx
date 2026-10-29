import { PageIntro } from "@/components/PageIntro";

import { AuditLog } from "./AuditLog";
import { DifferencingExplainer } from "./DifferencingExplainer";
import { LedgerTable } from "./LedgerTable";
import { ProtectionStats } from "./ProtectionStats";
import { RedTeamPanel } from "./RedTeamPanel";

export function PrivacyAudit() {
  return (
    <div>
      <PageIntro title="Privacy & audit">
        How the access body protects patients beyond the small-cell rule, and a complete record of what was
        decided, released and blocked.
      </PageIntro>
      <div className="grid gap-6">
        <ProtectionStats />
        <DifferencingExplainer />
        <RedTeamPanel />
        <LedgerTable />
        <AuditLog />
      </div>
    </div>
  );
}
