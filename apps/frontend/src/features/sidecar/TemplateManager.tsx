/**
 * Template manager for VFX Sidecar (PRD-40).
 *
 * Lists all sidecar templates with format badges, target tool labels,
 * builtin indicators, and create/delete actions. Delete is blocked
 * for builtin templates.
 */

import { useState } from "react";

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
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
      className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border-default)] last:border-b-0"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-[var(--color-text-primary)]">
            {template.name}
          </span>
          <Badge variant="default" size="sm">
            {FORMAT_LABELS[template.format]}
          </Badge>
          {template.target_tool && (
            <span className="text-[var(--color-text-muted)]">
              {TARGET_TOOL_LABELS[template.target_tool] ?? template.target_tool}
            </span>
          )}
          {template.is_builtin && (
            <span data-testid={`builtin-badge-${template.id}`}>
              <Badge variant="info" size="sm">
                Built-in
              </Badge>
            </span>
          )}
        </div>
        {template.description && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
            {template.description}
          </p>
        )}
      </div>

      {!template.is_builtin && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(template.id)}
          data-testid={`delete-template-${template.id}`}
          icon={<Trash2 size={iconSizes.sm} />}
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
      <Card>
        <CardHeader className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Sidecar Templates
          </h3>
          {!showForm && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowForm(true)}
              data-testid="add-template-btn"
            >
              New Template
            </Button>
          )}
        </CardHeader>

        <CardBody className="p-0">
          {showForm && (
            <CreateTemplateForm onCancel={() => setShowForm(false)} />
          )}

          {isLoading ? (
            <p className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center">
              Loading templates...
            </p>
          ) : list.length === 0 ? (
            <p
              data-testid="templates-empty"
              className="px-3 py-4 text-sm text-[var(--color-text-muted)] text-center"
            >
              No sidecar templates configured.
            </p>
          ) : (
            list.map((t) => (
              <TemplateRow
                key={t.id}
                template={t}
                onDelete={handleDelete}
              />
            ))
          )}
        </CardBody>
      </Card>
    </div>
  );
}
