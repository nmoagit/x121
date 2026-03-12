/**
 * Full-page view for the activity console (PRD-118).
 *
 * Provides tabbed navigation between "Live" (WebSocket stream)
 * and "History" (REST API paginated queries).
 */

import { useState } from "react";

import { Tabs } from "@/components/composite";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

import { ActivityConsolePanel } from "./ActivityConsolePanel";
import { GenerationLogTab } from "./components/GenerationLogTab";
import { HistoryTab } from "./components/HistoryTab";
import { InfraTab } from "./components/InfraTab";

/* --------------------------------------------------------------------------
   Tab definitions
   -------------------------------------------------------------------------- */

const CONSOLE_TABS = [
  { id: "generation", label: "Generation" },
  { id: "infra", label: "Infra" },
  { id: "live", label: "Live" },
  { id: "history", label: "History" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ActivityConsolePage() {
  useSetPageTitle("Activity Console", "Real-time activity log streaming and historical log queries.");

  const [activeTab, setActiveTab] = useState("generation");

  return (
    <Stack gap={6}>
      {/* Tab navigation */}
      <Tabs
        tabs={CONSOLE_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === "generation" ? (
        <div className="relative h-[calc(100vh-280px)] min-h-[400px]">
          <GenerationLogTab />
        </div>
      ) : activeTab === "infra" ? (
        <div className="relative h-[calc(100vh-280px)] min-h-[400px]">
          <InfraTab />
        </div>
      ) : activeTab === "live" ? (
        <div className="relative h-[calc(100vh-280px)] min-h-[400px]">
          <ActivityConsolePanel />
        </div>
      ) : (
        <div className="relative h-[calc(100vh-280px)] min-h-[400px]">
          <HistoryTab />
        </div>
      )}
    </Stack>
  );
}
