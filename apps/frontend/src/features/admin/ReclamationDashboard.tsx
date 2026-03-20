import { useState } from "react";

import { Stack } from "@/components/layout";
import { Button ,  WireframeLoader } from "@/components/primitives";
import { TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_BODY, TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import { CleanupHistory } from "@/features/admin/CleanupHistory";
import { TrashBrowser } from "@/features/admin/TrashBrowser";
import {
  useReclamationPreview,
  useRunCleanup,
  useProtectionRules,
  useReclamationPolicies,
} from "@/features/admin/hooks/use-reclamation";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { formatBytes } from "@/lib/format";

/* --------------------------------------------------------------------------
   Tab types
   -------------------------------------------------------------------------- */

type TabId = "overview" | "trash" | "history" | "rules" | "policies";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "trash", label: "Trash Queue" },
  { id: "history", label: "History" },
  { id: "rules", label: "Protection Rules" },
  { id: "policies", label: "Policies" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReclamationDashboard() {
  useSetPageTitle("Storage Reclamation", "Manage deferred file deletion, protection rules, and reclamation policies.");

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showConfirm, setShowConfirm] = useState(false);

  const { data: preview, isLoading: previewLoading } = useReclamationPreview();
  const { data: rules } = useProtectionRules();
  const { data: policies } = useReclamationPolicies();
  const cleanupMutation = useRunCleanup();

  function handleRunCleanup() {
    setShowConfirm(false);
    cleanupMutation.mutate(undefined);
  }

  if (previewLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <WireframeLoader size={64} />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Tabs */}
        <div className="flex gap-1 border-b border-[var(--color-border-primary)]" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-[var(--color-action-primary)] text-[var(--color-action-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "overview" && (
          <Stack gap={4}>
            {/* Summary card */}
            <div className={TERMINAL_PANEL}>
              <div className={TERMINAL_HEADER}>
                <span className={TERMINAL_HEADER_TITLE}>Storage Overview</span>
              </div>
              <div className={cn(TERMINAL_BODY, "flex items-center justify-between")}>
                <div>
                  <p className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide font-mono">Total Reclaimable Space</p>
                  <p className="mt-1 text-2xl font-bold text-cyan-400 font-mono">
                    {formatBytes(preview?.total_bytes ?? 0)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-text-muted)] font-mono">
                    {preview?.total_files ?? 0} files pending deletion
                  </p>
                </div>
                <div>
                  {showConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[var(--color-text-muted)] font-mono">Are you sure?</span>
                      <Button
                        variant="danger"
                        size="xs"
                        onClick={handleRunCleanup}
                        disabled={cleanupMutation.isPending}
                      >
                        {cleanupMutation.isPending ? "Running..." : "Confirm"}
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => setShowConfirm(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => setShowConfirm(true)}
                      disabled={(preview?.total_files ?? 0) === 0}
                    >
                      Run Cleanup
                    </Button>
                  )}
                </div>
              </div>

              {/* Cleanup result */}
              {cleanupMutation.data && (
                <div className="mx-[var(--spacing-3)] mb-[var(--spacing-3)] rounded-[var(--radius-md)] bg-green-400/5 border border-green-400/30 p-3 text-xs text-green-400 font-mono">
                  Cleanup complete: {cleanupMutation.data.files_deleted} files deleted,{" "}
                  {formatBytes(cleanupMutation.data.bytes_reclaimed)} reclaimed.
                  {cleanupMutation.data.errors.length > 0 && (
                    <span className="text-orange-400">
                      {" "}
                      ({cleanupMutation.data.errors.length} errors)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Per-project breakdown */}
            {preview && preview.per_project.length > 0 && (
              <div className={TERMINAL_PANEL}>
                <div className={TERMINAL_HEADER}>
                  <span className={TERMINAL_HEADER_TITLE}>Per-Project Breakdown</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-xs">
                    <thead>
                      <tr className={TERMINAL_DIVIDER}>
                        <th className={cn(TERMINAL_TH, "px-4 py-2")}>
                          Project
                        </th>
                        <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>
                          Files
                        </th>
                        <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>
                          Size
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.per_project.map((p, i) => (
                        <tr
                          key={p.project_id ?? `unscoped-${i}`}
                          className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}
                        >
                          <td className="px-4 py-2 text-cyan-400">
                            {p.project_name ?? (p.project_id ? `Project #${p.project_id}` : "Unscoped")}
                          </td>
                          <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                            {p.file_count}
                          </td>
                          <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                            {formatBytes(p.total_bytes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Stack>
        )}

        {activeTab === "trash" && <TrashBrowser />}

        {activeTab === "history" && <CleanupHistory />}

        {activeTab === "rules" && (
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_HEADER}>
              <span className={TERMINAL_HEADER_TITLE}>Asset Protection Rules</span>
            </div>
            {!rules || rules.length === 0 ? (
              <div className={TERMINAL_BODY}>
                <p className="text-xs text-[var(--color-text-muted)] font-mono">No protection rules defined.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className={TERMINAL_DIVIDER}>
                      <th className={cn(TERMINAL_TH, "px-4 py-2")}>Name</th>
                      <th className={cn(TERMINAL_TH, "px-4 py-2")}>Entity Type</th>
                      <th className={cn(TERMINAL_TH, "px-4 py-2")}>Condition</th>
                      <th className={cn(TERMINAL_TH, "px-4 py-2")}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr
                        key={rule.id}
                        className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}
                      >
                        <td className="px-4 py-2 text-cyan-400">
                          {rule.name}
                          {rule.description && (
                            <p className="text-[var(--color-text-muted)]">
                              {rule.description}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                          {rule.entity_type}
                        </td>
                        <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                          {rule.condition_field} {rule.condition_operator} {rule.condition_value}
                        </td>
                        <td className="px-4 py-2">
                          <span className={rule.is_active ? "text-green-400" : "text-[var(--color-text-muted)]"}>
                            {rule.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === "policies" && (
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_HEADER}>
              <span className={TERMINAL_HEADER_TITLE}>Reclamation Policies</span>
            </div>
            {!policies || policies.length === 0 ? (
              <div className={TERMINAL_BODY}>
                <p className="text-xs text-[var(--color-text-muted)] font-mono">No policies defined.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className={TERMINAL_DIVIDER}>
                      <th className={cn(TERMINAL_TH, "px-4 py-2")}>Name</th>
                      <th className={cn(TERMINAL_TH, "px-4 py-2")}>Entity Type</th>
                      <th className={cn(TERMINAL_TH, "px-4 py-2")}>Condition</th>
                      <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>Age Threshold</th>
                      <th className={cn(TERMINAL_TH, "px-4 py-2 text-right")}>Grace Period</th>
                      <th className={cn(TERMINAL_TH, "px-4 py-2")}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map((policy) => (
                      <tr
                        key={policy.id}
                        className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}
                      >
                        <td className="px-4 py-2 text-cyan-400">
                          {policy.name}
                          {policy.description && (
                            <p className="text-[var(--color-text-muted)]">
                              {policy.description}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                          {policy.entity_type}
                        </td>
                        <td className="px-4 py-2 text-[var(--color-text-secondary)]">
                          {policy.condition_field} {policy.condition_operator}{" "}
                          {policy.condition_value}
                        </td>
                        <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                          {policy.age_threshold_days}d
                        </td>
                        <td className="px-4 py-2 text-right text-[var(--color-text-secondary)]">
                          {policy.grace_period_days}d
                        </td>
                        <td className="px-4 py-2">
                          <span className={policy.is_active ? "text-green-400" : "text-[var(--color-text-muted)]"}>
                            {policy.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Stack>
    </div>
  );
}
