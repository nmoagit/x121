import { useState } from "react";

import { Stack } from "@/components/layout";
import { Badge } from "@/components/primitives";
import { Spinner } from "@/components/primitives";
import { CleanupHistory } from "@/features/admin/CleanupHistory";
import { ProtectedBadge } from "@/features/admin/ProtectedBadge";
import { TrashBrowser } from "@/features/admin/TrashBrowser";
import {
  useReclamationPreview,
  useRunCleanup,
  useProtectionRules,
  useReclamationPolicies,
} from "@/features/admin/hooks/use-reclamation";
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
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Disk Reclamation
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Manage deferred file deletion, protection rules, and reclamation policies.
          </p>
        </div>

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
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border-primary)] bg-[var(--color-surface-secondary)] p-[var(--spacing-6)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-[var(--color-text-muted)]">Total Reclaimable Space</p>
                  <p className="mt-1 text-3xl font-bold text-[var(--color-text-primary)]">
                    {formatBytes(preview?.total_bytes ?? 0)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                    {preview?.total_files ?? 0} files pending deletion
                  </p>
                </div>
                <div>
                  {showConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--color-text-muted)]">Are you sure?</span>
                      <button
                        onClick={handleRunCleanup}
                        disabled={cleanupMutation.isPending}
                        className="rounded-[var(--radius-md)] bg-[var(--color-action-danger)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {cleanupMutation.isPending ? "Running..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setShowConfirm(false)}
                        className="rounded-[var(--radius-md)] border border-[var(--color-border-primary)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowConfirm(true)}
                      disabled={(preview?.total_files ?? 0) === 0}
                      className="rounded-[var(--radius-md)] bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Run Cleanup
                    </button>
                  )}
                </div>
              </div>

              {/* Cleanup result */}
              {cleanupMutation.data && (
                <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-action-success)]/10 p-3 text-sm text-[var(--color-action-success)]">
                  Cleanup complete: {cleanupMutation.data.files_deleted} files deleted,{" "}
                  {formatBytes(cleanupMutation.data.bytes_reclaimed)} reclaimed.
                  {cleanupMutation.data.errors.length > 0 && (
                    <span className="text-[var(--color-action-warning)]">
                      {" "}
                      ({cleanupMutation.data.errors.length} errors)
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Per-project breakdown */}
            {preview && preview.per_project.length > 0 && (
              <div>
                <h2 className="mb-3 text-base font-semibold text-[var(--color-text-primary)]">
                  Per-Project Breakdown
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border-primary)]">
                        <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                          Project
                        </th>
                        <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                          Files
                        </th>
                        <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                          Size
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.per_project.map((p, i) => (
                        <tr
                          key={p.project_id ?? `unscoped-${i}`}
                          className="border-b border-[var(--color-border-primary)]"
                        >
                          <td className="px-4 py-2 text-[var(--color-text-primary)]">
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
          <div>
            <h2 className="mb-3 text-base font-semibold text-[var(--color-text-primary)]">
              Asset Protection Rules
            </h2>
            {!rules || rules.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No protection rules defined.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-primary)]">
                      <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                        Entity Type
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                        Condition
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr
                        key={rule.id}
                        className="border-b border-[var(--color-border-primary)]"
                      >
                        <td className="px-4 py-2 text-[var(--color-text-primary)]">
                          {rule.name}
                          {rule.description && (
                            <p className="text-xs text-[var(--color-text-muted)]">
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
                          <ProtectedBadge isActive={rule.is_active} />
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
          <div>
            <h2 className="mb-3 text-base font-semibold text-[var(--color-text-primary)]">
              Reclamation Policies
            </h2>
            {!policies || policies.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">No policies defined.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border-primary)]">
                      <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                        Name
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                        Entity Type
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                        Condition
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                        Age Threshold
                      </th>
                      <th className="px-4 py-2 text-right font-medium text-[var(--color-text-muted)]">
                        Grace Period
                      </th>
                      <th className="px-4 py-2 text-left font-medium text-[var(--color-text-muted)]">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map((policy) => (
                      <tr
                        key={policy.id}
                        className="border-b border-[var(--color-border-primary)]"
                      >
                        <td className="px-4 py-2 text-[var(--color-text-primary)]">
                          {policy.name}
                          {policy.description && (
                            <p className="text-xs text-[var(--color-text-muted)]">
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
                          <Badge variant={policy.is_active ? "success" : "default"} size="sm">
                            {policy.is_active ? "Active" : "Inactive"}
                          </Badge>
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
