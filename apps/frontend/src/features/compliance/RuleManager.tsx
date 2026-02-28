/**
 * Compliance rule manager for Video Compliance Checker (PRD-102).
 *
 * Lists all compliance rules with type badges, global/project indicators,
 * and provides controls for creating and deleting rules.
 */

import { useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { Plus, Trash2, iconSizes } from "@/tokens/icons";

import { CreateRuleForm } from "./CreateRuleForm";
import { useComplianceRules, useDeleteRule } from "./hooks/use-compliance";
import { RULE_TYPE_BADGE_VARIANT, RULE_TYPE_LABELS } from "./types";
import type { ComplianceRule } from "./types";

/* --------------------------------------------------------------------------
   Rule row
   -------------------------------------------------------------------------- */

function RuleRow({
  rule,
  onDelete,
}: {
  rule: ComplianceRule;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      data-testid={`rule-row-${rule.id}`}
      className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <Badge variant={RULE_TYPE_BADGE_VARIANT[rule.rule_type]} size="sm">
          {RULE_TYPE_LABELS[rule.rule_type]}
        </Badge>
        <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">
          {rule.name}
        </span>
        <Badge variant={rule.is_global ? "info" : "default"} size="sm">
          {rule.is_global ? "Global" : "Project"}
        </Badge>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(rule.id)}
        data-testid={`delete-rule-${rule.id}`}
        icon={<Trash2 size={iconSizes.sm} />}
      >
        Delete
      </Button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface RuleManagerProps {
  projectId?: number;
}

export function RuleManager({ projectId }: RuleManagerProps) {
  const { data: rules, isLoading } = useComplianceRules(projectId);
  const deleteRule = useDeleteRule();
  const [showForm, setShowForm] = useState(false);

  function handleDelete(id: number) {
    deleteRule.mutate(id);
  }

  const list = rules ?? [];

  return (
    <div data-testid="rule-manager">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Compliance Rules
          </h3>
          {!showForm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm(true)}
              data-testid="add-rule-btn"
              icon={<Plus size={iconSizes.sm} />}
            >
              New Rule
            </Button>
          )}
        </CardHeader>

        <CardBody className="p-0">
          {showForm && (
            <CreateRuleForm
              projectId={projectId}
              onCancel={() => setShowForm(false)}
            />
          )}

          {isLoading ? (
            <p className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
              Loading rules...
            </p>
          ) : list.length === 0 ? (
            <p
              data-testid="rules-empty"
              className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center"
            >
              No compliance rules defined.
            </p>
          ) : (
            list.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onDelete={handleDelete}
              />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
