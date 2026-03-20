/**
 * Shared list-item components for the Budget Admin Panel tabs (PRD-93).
 *
 * Extracted to keep BudgetAdminPanel.tsx under the 200-line limit.
 */

import { Badge, Button ,  WireframeLoader } from "@/components/primitives";

import {
  useBudgets,
  useDeleteBudget,
  useDeleteExemption,
  useDeleteQuota,
  useExemptions,
  useQuotas,
} from "./hooks/use-budget-quota";
import type { BudgetExemption, ProjectBudget, UserQuota } from "./types";
import { PERIOD_TYPE_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Shared helpers
   -------------------------------------------------------------------------- */

const ROW_CLASSES =
  "flex items-center justify-between py-2 px-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)]";

/* --------------------------------------------------------------------------
   Budget list
   -------------------------------------------------------------------------- */

export function BudgetListTab({ onEdit }: { onEdit: (projectId: number) => void }) {
  const { data: budgets, isLoading } = useBudgets();
  const deleteBudget = useDeleteBudget();

  if (isLoading) {
    return <div className="flex justify-center py-6"><WireframeLoader size={48} /></div>;
  }

  if (!budgets?.length) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4">
        No project budgets configured.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {budgets.map((b: ProjectBudget) => (
        <div key={b.id} className={ROW_CLASSES}>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Project #{b.project_id}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {b.budget_gpu_hours.toFixed(1)}h
              {" "}&middot;{" "}
              {PERIOD_TYPE_LABEL[b.period_type] ?? b.period_type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => onEdit(b.project_id)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={deleteBudget.isPending}
              onClick={() => deleteBudget.mutate(b.project_id)}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Quota list
   -------------------------------------------------------------------------- */

export function QuotaListTab({ onEdit }: { onEdit: (userId: number) => void }) {
  const { data: quotas, isLoading } = useQuotas();
  const deleteQuota = useDeleteQuota();

  if (isLoading) {
    return <div className="flex justify-center py-6"><WireframeLoader size={48} /></div>;
  }

  if (!quotas?.length) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4">
        No user quotas configured.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {quotas.map((q: UserQuota) => (
        <div key={q.id} className={ROW_CLASSES}>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              User #{q.user_id}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {q.quota_gpu_hours.toFixed(1)}h
              {" "}&middot;{" "}
              {PERIOD_TYPE_LABEL[q.period_type] ?? q.period_type}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => onEdit(q.user_id)}>
              Edit
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={deleteQuota.isPending}
              onClick={() => deleteQuota.mutate(q.user_id)}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Exemption list
   -------------------------------------------------------------------------- */

export function ExemptionListTab() {
  const { data: exemptions, isLoading } = useExemptions();
  const deleteExemption = useDeleteExemption();

  if (isLoading) {
    return <div className="flex justify-center py-6"><WireframeLoader size={48} /></div>;
  }

  if (!exemptions?.length) {
    return (
      <p className="text-sm text-[var(--color-text-muted)] py-4">
        No exemption rules configured.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {exemptions.map((ex: BudgetExemption) => (
        <div key={ex.id} className={ROW_CLASSES}>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              {ex.name}
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              Job type: {ex.job_type}
              {ex.resolution_tier && ` | Tier: ${ex.resolution_tier}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={ex.is_enabled ? "success" : "default"} size="sm">
              {ex.is_enabled ? "Active" : "Disabled"}
            </Badge>
            <Button
              size="sm"
              variant="danger"
              loading={deleteExemption.isPending}
              onClick={() => deleteExemption.mutate(ex.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
