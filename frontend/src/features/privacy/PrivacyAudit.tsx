"use client";

import { LoaderCircle, Play, RotateCcw } from "lucide-react";
import { useState } from "react";

import { AUTO_REFRESH_MS, useAudit, useLedger } from "@/api/queries";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/States";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AuditPanel } from "./AuditPanel";
import { LedgerPanel } from "./LedgerPanel";
import { RedTeamResults } from "./RedTeamResults";
import { useRedTeam } from "./useRedTeam";

type Tab = "ledger" | "audit";

function Count({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  return <span className="text-xs font-normal text-muted-foreground tabular-nums">{value}</span>;
}

export function PrivacyAudit() {
  const redTeam = useRedTeam();
  const [tab, setTab] = useState<Tab>("ledger");
  const ledgerCount = useLedger(false).data?.length;
  const auditCount = useAudit(false).data?.length;

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Privacy & audit"
        description="Release ledger, red-team check and the audit log."
        actions={
          <>
            <Button
              variant="ghost"
              disabled={redTeam.running || redTeam.resetting}
              onClick={redTeam.resetLedger}
            >
              {redTeam.resetting ? (
                <LoaderCircle aria-hidden className="animate-spin" />
              ) : (
                <RotateCcw aria-hidden />
              )}
              Reset ledger
            </Button>
            <Button disabled={redTeam.running || redTeam.resetting} onClick={() => void redTeam.run()}>
              {redTeam.running ? <LoaderCircle aria-hidden className="animate-spin" /> : <Play aria-hidden />}
              {redTeam.running ? "Running attack…" : "Run attack"}
            </Button>
          </>
        }
      />

      {redTeam.resetError ? (
        <ErrorState title="Could not reset the ledger" error={redTeam.resetError} />
      ) : null}

      <RedTeamResults redTeam={redTeam} />

      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList aria-label="Release ledger and audit log">
            <TabsTrigger value="ledger">
              Ledger <Count value={ledgerCount} />
            </TabsTrigger>
            <TabsTrigger value="audit">
              Audit log <Count value={auditCount} />
            </TabsTrigger>
          </TabsList>
          {tab === "audit" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              Live · updates every {AUTO_REFRESH_MS / 1000} s
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Values withheld to stop differencing</span>
          )}
        </div>
        <TabsContent value="ledger">
          <LedgerPanel />
        </TabsContent>
        <TabsContent value="audit">
          <AuditPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
