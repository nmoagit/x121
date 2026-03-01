/**
 * Pipeline stage hooks management page (PRD-77).
 *
 * Provides a tabbed interface with a HookManager for creating and
 * toggling hooks, an execution log viewer, and a hook test console.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, Input, TabBar } from "@/components/primitives";

import { ExecutionLogViewer, HookManager, HookTestConsole } from "@/features/pipeline-hooks";

/* --------------------------------------------------------------------------
   Tab options
   -------------------------------------------------------------------------- */

type TabKey = "manage" | "logs" | "test";

const TABS: { key: TabKey; label: string }[] = [
  { key: "manage", label: "Manage Hooks" },
  { key: "logs", label: "Execution Logs" },
  { key: "test", label: "Test Console" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PipelineHooksPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("manage");
  const [testHookId, setTestHookId] = useState<number | null>(null);

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Pipeline Hooks"
          description="Configure shell, Python, and webhook hooks that run at pipeline stage boundaries."
        />

        <TabBar tabs={TABS} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />

        {/* Tab content */}
        {activeTab === "manage" && <HookManager />}

        {activeTab === "logs" && <ExecutionLogViewer />}

        {activeTab === "test" && (
          <Stack gap={4}>
            {testHookId === null ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Enter a hook ID to test. You can find hook IDs on the Manage Hooks tab.
              </p>
            ) : (
              <HookTestConsole hookId={testHookId} />
            )}
            <HookIdInput value={testHookId} onChange={setTestHookId} />
          </Stack>
        )}
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Hook ID input sub-component
   -------------------------------------------------------------------------- */

function HookIdInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [input, setInput] = useState(value?.toString() ?? "");

  const handleLoad = () => {
    const parsed = Number.parseInt(input, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      onChange(parsed);
    }
  };

  return (
    <Stack direction="horizontal" gap={3} align="end">
      <div className="w-48">
        <Input
          label="Hook ID"
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter hook ID"
          min="1"
        />
      </div>
      <Button variant="primary" size="sm" onClick={handleLoad} disabled={!input.trim()}>
        Load
      </Button>
    </Stack>
  );
}
