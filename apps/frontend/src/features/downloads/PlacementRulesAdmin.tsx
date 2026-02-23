/**
 * Admin panel for managing model placement rules (PRD-104).
 *
 * Displays a table of rules with model type, base model, target directory,
 * priority, and active toggle. Supports create and delete operations.
 */

import { useState } from "react";

import { Badge, Input } from "@/components/primitives";
import { Plus, Trash2 } from "@/tokens/icons";

import {
  useCreatePlacementRule,
  useDeletePlacementRule,
  usePlacementRules,
} from "./hooks/use-downloads";
import { MODEL_TYPE_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PlacementRulesAdmin() {
  const { data: rules, isLoading } = usePlacementRules();
  const createRule = useCreatePlacementRule();
  const deleteRule = useDeletePlacementRule();

  const [modelType, setModelType] = useState("checkpoint");
  const [baseModel, setBaseModel] = useState("");
  const [targetDir, setTargetDir] = useState("");

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!targetDir.trim()) return;
    createRule.mutate({
      model_type: modelType,
      base_model: baseModel.trim() || undefined,
      target_directory: targetDir.trim(),
    });
    setBaseModel("");
    setTargetDir("");
  }

  return (
    <div className="space-y-[var(--spacing-4)]">
      {/* Header */}
      <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
        Placement Rules
      </h2>

      {/* Create form */}
      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-[var(--spacing-2)]">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-[var(--spacing-1)]">
            Model Type
          </label>
          <select
            value={modelType}
            onChange={(e) => setModelType(e.target.value)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-primary)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-sm text-[var(--color-text-primary)]"
          >
            {Object.entries(MODEL_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-[var(--spacing-1)]">
            Base Model (optional)
          </label>
          <Input
            type="text"
            placeholder="e.g. SDXL"
            value={baseModel}
            onChange={(e) => setBaseModel(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-[var(--color-text-muted)] mb-[var(--spacing-1)]">
            Target Directory
          </label>
          <Input
            type="text"
            placeholder="/models/checkpoints/"
            value={targetDir}
            onChange={(e) => setTargetDir(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={!targetDir.trim() || createRule.isPending}
          className="inline-flex items-center gap-[var(--spacing-1)] rounded-[var(--radius-md)] bg-[var(--color-primary)] px-[var(--spacing-3)] py-[var(--spacing-2)] text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Plus size={14} aria-hidden />
          Add Rule
        </button>
      </form>

      {/* Rules table */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading rules...</p>
      ) : !rules || rules.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No placement rules configured.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-medium text-[var(--color-text-muted)]">
                <th className="pb-[var(--spacing-2)] pr-[var(--spacing-3)]">Model Type</th>
                <th className="pb-[var(--spacing-2)] pr-[var(--spacing-3)]">Base Model</th>
                <th className="pb-[var(--spacing-2)] pr-[var(--spacing-3)]">Target Directory</th>
                <th className="pb-[var(--spacing-2)] pr-[var(--spacing-3)]">Priority</th>
                <th className="pb-[var(--spacing-2)] pr-[var(--spacing-3)]">Status</th>
                <th className="pb-[var(--spacing-2)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr
                  key={rule.id}
                  className="border-b border-[var(--color-border)] last:border-b-0"
                >
                  <td className="py-[var(--spacing-2)] pr-[var(--spacing-3)] text-[var(--color-text-primary)]">
                    {MODEL_TYPE_LABELS[rule.model_type] ?? rule.model_type}
                  </td>
                  <td className="py-[var(--spacing-2)] pr-[var(--spacing-3)] text-[var(--color-text-muted)]">
                    {rule.base_model ?? "Any"}
                  </td>
                  <td className="py-[var(--spacing-2)] pr-[var(--spacing-3)] font-mono text-xs text-[var(--color-text-primary)]">
                    {rule.target_directory}
                  </td>
                  <td className="py-[var(--spacing-2)] pr-[var(--spacing-3)] text-[var(--color-text-muted)]">
                    {rule.priority}
                  </td>
                  <td className="py-[var(--spacing-2)] pr-[var(--spacing-3)]">
                    <Badge variant={rule.is_active ? "success" : "default"} size="sm">
                      {rule.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="py-[var(--spacing-2)]">
                    <button
                      type="button"
                      onClick={() => deleteRule.mutate(rule.id)}
                      className="rounded-[var(--radius-sm)] p-[var(--spacing-1)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
                      title="Delete rule"
                    >
                      <Trash2 size={14} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
