/**
 * Session management admin page (PRD-98).
 *
 * Tab-based layout: Active Sessions, Login History, Analytics, Config.
 */

import { useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { Tabs } from "@/components/composite/Tabs";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

import { ActiveSessionsTable } from "./ActiveSessionsTable";
import { LoginHistoryTable } from "./LoginHistoryTable";
import { SessionAnalyticsCard } from "./SessionAnalyticsCard";
import { SessionConfigPanel } from "./SessionConfigPanel";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TABS = [
  { id: "active", label: "Active Sessions" },
  { id: "login-history", label: "Login History" },
  { id: "analytics", label: "Analytics" },
  { id: "config", label: "Configuration" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const TAB_CONTENT: Record<TabId, React.ComponentType> = {
  active: ActiveSessionsTable,
  "login-history": LoginHistoryTable,
  analytics: SessionAnalyticsCard,
  config: SessionConfigPanel,
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SessionManagementPage() {
  useSetPageTitle("Session Management", "Monitor active sessions, review login history, and manage session configuration.");
  const [activeTab, setActiveTab] = useState<string>("active");

  const ContentComponent = TAB_CONTENT[activeTab as TabId] ?? ActiveSessionsTable;

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Tabbed content */}
        <Card>
          <CardHeader className="pb-0">
            <Tabs
              tabs={[...TABS]}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          </CardHeader>
          <CardBody>
            <ContentComponent />
          </CardBody>
        </Card>
      </Stack>
    </div>
  );
}
