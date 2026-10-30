"use client";

import { useRef, useState } from "react";

import { AUTO_REFRESH_MS, useAudit, useLedger } from "@/api/queries";
import { PageHeader } from "@/components/PageHeader";
import { ErrorState } from "@/components/States";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatValue } from "@/lib/format";
import { scrollBehavior } from "@/lib/motion";

import { ActivityPanel, COUNTS_QUERY } from "./ActivityPanel";
import { filterOptions } from "./auditLabels";
import { BlockedReleasesPanel } from "./BlockedReleasesPanel";
import { RedTeamResults } from "./RedTeamResults";
import { useRedTeam } from "./useRedTeam";

type Tab = "blocked" | "activity";

function Count({ value }: { value: number | undefined }) {
  if (value === undefined) return null;
  return (
    <span className="text-data font-normal text-muted-foreground tabular-nums">{formatValue(value)}</span>
  );
}

export function PrivacyAudit() {
  const redTeam = useRedTeam();
  const [tab, setTab] = useState<Tab>("blocked");
  const tabsRef = useRef<HTMLDivElement>(null);
  const blockedCount = useLedger(false).data?.length;
  const counts = useAudit(COUNTS_QUERY, false).data?.counts;
  const activityCount = counts ? filterOptions(counts)[0]?.count : undefined;

  return (
    <div className="grid gap-10">
      <PageHeader
        title="Privacy & audit"
        description="Oversight for the access body: what was withheld to protect patients, and a complete record of what the system did."
      />

      {redTeam.resetError ? (
        <ErrorState title="Could not reset the ledger" error={redTeam.resetError} />
      ) : null}

      <RedTeamResults
        redTeam={redTeam}
        onShowBlocked={() => {
          setTab("blocked");
          tabsRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
        }}
      />

      <Tabs
        ref={tabsRef}
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
        }}
        className="gap-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList aria-label="Blocked releases and activity log">
            <TabsTrigger value="blocked">
              Blocked releases <Count value={blockedCount} />
            </TabsTrigger>
            <TabsTrigger value="activity">
              Activity log <Count value={activityCount} />
            </TabsTrigger>
          </TabsList>
          {tab === "activity" ? (
            <span className="inline-flex items-center gap-2 text-data text-muted-foreground">
              <span aria-hidden className="size-1.5 rounded-full bg-success" />
              Live · updates every {AUTO_REFRESH_MS / 1000} s
            </span>
          ) : null}
        </div>
        <TabsContent value="blocked">
          <BlockedReleasesPanel />
        </TabsContent>
        <TabsContent value="activity">
          <ActivityPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
