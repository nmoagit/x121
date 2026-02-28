/**
 * WebhookTestingPage -- main console with tabbed navigation (PRD-99).
 *
 * Provides four tabs: Test Sender, Delivery Log, Endpoint Health,
 * and Mock Endpoints.
 */

import { useState } from "react";

import { Tabs } from "@/components/composite";
import { Stack } from "@/components/layout";

import { DeliveryLogViewer } from "./DeliveryLogViewer";
import { EndpointHealthDashboard } from "./EndpointHealthDashboard";
import { MockEndpointManager } from "./MockEndpointManager";
import { TestPayloadSender } from "./TestPayloadSender";

/* --------------------------------------------------------------------------
   Tab definitions
   -------------------------------------------------------------------------- */

const TABS = [
  { id: "sender", label: "Test Sender" },
  { id: "deliveries", label: "Delivery Log" },
  { id: "health", label: "Endpoint Health" },
  { id: "mocks", label: "Mock Endpoints" },
] as const;

type TabId = (typeof TABS)[number]["id"];

/* --------------------------------------------------------------------------
   Tab content mapping
   -------------------------------------------------------------------------- */

const TAB_PANELS: Record<TabId, React.FC> = {
  sender: TestPayloadSender,
  deliveries: DeliveryLogViewer,
  health: EndpointHealthDashboard,
  mocks: MockEndpointManager,
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function WebhookTestingPage() {
  const [activeTab, setActiveTab] = useState<string>("sender");
  const ActivePanel = TAB_PANELS[activeTab as TabId] ?? TestPayloadSender;

  return (
    <div data-testid="webhook-testing-page" className="min-h-full">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Webhook Testing Console
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Send test payloads, inspect deliveries, monitor health, and manage mock endpoints.
          </p>
        </div>

        <Tabs
          tabs={[...TABS]}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <div data-testid={`tab-panel-${activeTab}`} role="tabpanel">
          <ActivePanel />
        </div>
      </Stack>
    </div>
  );
}
