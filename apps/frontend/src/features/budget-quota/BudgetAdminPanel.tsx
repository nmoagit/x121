/**
 * BudgetAdminPanel — admin interface for managing project budgets,
 * user quotas, and budget exemption rules (PRD-93).
 *
 * Tab content is rendered by components in AdminListItems.tsx.
 */

import { useState } from "react";

import { Card, CardBody, CardHeader, Tabs } from "@/components/composite";

import { BudgetListTab, ExemptionListTab, QuotaListTab } from "./AdminListItems";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const ADMIN_TABS = [
  { id: "budgets", label: "Budgets" },
  { id: "quotas", label: "Quotas" },
  { id: "exemptions", label: "Exemptions" },
];

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface BudgetAdminPanelProps {
  onEditBudget?: (projectId: number) => void;
  onEditQuota?: (userId: number) => void;
}

export function BudgetAdminPanel({ onEditBudget, onEditQuota }: BudgetAdminPanelProps) {
  const [activeTab, setActiveTab] = useState("budgets");
  const noop = () => {};

  return (
    <div data-testid="budget-admin-panel">
      <Card>
        <CardHeader>
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            Budget & Quota Administration
          </span>
        </CardHeader>
        <CardBody>
          <Tabs tabs={ADMIN_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
          <div className="pt-4">
            {activeTab === "budgets" && (
              <BudgetListTab onEdit={onEditBudget ?? noop} />
            )}
            {activeTab === "quotas" && (
              <QuotaListTab onEdit={onEditQuota ?? noop} />
            )}
            {activeTab === "exemptions" && <ExemptionListTab />}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
