/**
 * Template manager for VFX Sidecar (PRD-40).
 *
 * Lists all sidecar templates with format labels, target tool labels,
 * builtin indicators, and create/delete actions. Delete is blocked
 * for builtin templates.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import {
  TERMINAL_PANEL,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_ROW_HOVER,
} from "@/lib/ui-classes";
import { Trash2, iconSizes } from "@/tokens/icons";

import { CreateTemplateForm } from "./CreateTemplateForm";
import { useDeleteTemplate, useSidecarTemplates } from "./hooks/use-sidecar";
import { FORMAT_LABELS, TARGET_TOOL_LABELS } from "./types";
import type { SidecarTemplate } from "./types";

/* --------------------------------------------------------------------------
   Row component
   -------------------------------------------------------------------------- */

function TemplateRow({
  template,
  onDelete,
}: {
  template: SidecarTemplate;
  onDelete: (id: number) => void;
}) {
  return (
    <div
      data-testid={`template-row-${template.id}`}
      className={`flex items-center justify-between gap-3 px-3 py-2 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="font-medium text-[var(--color-text-primary)]">
            {template.name}
          </span>
          <span className="text-cyan-400 uppercase tracking-wide">
            {FORMAT_LABELS[template.format]}
          </span>
          {template.target_tool && (
            <>
              <span className="opacity-30">|</span>
              <span className="text-[var(--color-text-muted)]">
                {TARGET_TOOL_LABELS[template.target_tool] ?? template.target_tool}
              </span>
            </>
          )}
          {template.is_builtin && (
            <span data-testid={`builtin-badge-${template.id}`} className="text-green-400 uppercase tracking-wide">
              Built-in
            </span>
          )}
        </div>
        {template.description && (
          <p className="font-mono text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate">
            {template.description}
          </p>
        )}
      </div>

      {!template.is_builtin && (
        <Button
          variant="ghost"
          size="xs"
          onClick={() => onDelete(template.id)}
          data-testid={`delete-template-${template.id}`}
          icon={<Trash2 size={iconSizes.sm} />}
          className="!text-red-400 hover:!text-red-300"
        >
          Delete
        </Button>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function TemplateManager() {
  const { data: templates, isLoading } = useSidecarTemplates();
  const deleteTemplate = useDeleteTemplate();
  const [showForm, setShowForm] = useState(false);

  function handleDelete(id: number) {
    deleteTemplate.mutate(id);
  }

  const list = templates ?? [];

  return (
    <div data-testid="template-manager">
      <div className={TERMINAL_PANEL}>
        <div className={`${TERMINAL_HEADER} flex items-center justify-between`}>
          <span className={TERMINAL_HEADER_TITLE}>Sidecar Templates</span>
          {!showForm && (
            <Button
              variant="primary"
              size="xs"
              onClick={() => setShowForm(true)}
              data-testid="add-template-btn"
            >
              New Template
            </Button>
          )}
        </div>

        {showForm && (
          <div className={TERMINAL_BODY}>
            <CreateTemplateForm onCancel={() => setShowForm(false)} />
          </div>
        )}

        {isLoading ? (
          <div className={TERMINAL_BODY}>
            <p className="font-mono text-xs text-[var(--color-text-muted)] text-center">
              Loading templates...
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className={TERMINAL_BODY}>
            <p
              data-testid="templates-empty"
              className="font-mono text-xs text-[var(--color-text-muted)] text-center"
            >
              No sidecar templates configured.
            </p>
          </div>
        ) : (
          list.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              onDelete={handleDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}
