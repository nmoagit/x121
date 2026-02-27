/**
 * Full-page view for the activity console (PRD-118).
 *
 * Provides tabbed navigation between "Live" (WebSocket stream)
 * and "History" (REST API paginated queries).
 */

import { useState } from "react";

import { Tabs } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Terminal } from "@/tokens/icons";

import { ActivityConsolePanel } from "./ActivityConsolePanel";
import { HistoryTab } from "./components/HistoryTab";

/* --------------------------------------------------------------------------
   Tab definitions
   -------------------------------------------------------------------------- */

const CONSOLE_TABS = [
  { id: "live", label: "Live" },
  { id: "history", label: "History" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ActivityConsolePage() {
  const [activeTab, setActiveTab] = useState("live");

  return (
    <Stack gap={6}>
      {/* Page header */}
      <div>
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Terminal size={24} className="text-[var(--color-text-muted)]" aria-hidden />
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Activity Console
          </h1>
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Real-time activity log streaming and historical log queries.
        </p>
      </div>

      {/* Tab navigation */}
      <Tabs
        tabs={CONSOLE_TABS}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === "live" ? (
        <div className="relative h-[calc(100vh-280px)] min-h-[400px]">
          <ActivityConsolePanel />
        </div>
      ) : (
        <HistoryTab />
      )}
    </Stack>
  );
}
