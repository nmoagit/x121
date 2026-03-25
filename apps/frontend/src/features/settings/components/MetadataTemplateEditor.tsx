/**
 * Metadata template administration editor.
 *
 * Lists all templates, allows expanding to view/edit fields,
 * and supports adding/removing fields and templates.
 */

import { useCallback, useState } from "react";

import { ConfirmModal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input, Select, Toggle ,  ContextLoader } from "@/components/primitives";
import { ChevronDown, Plus, Trash2 } from "@/tokens/icons";
import { cn } from "@/lib/cn";
import { TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_BODY, TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER, GHOST_DANGER_BTN } from "@/lib/ui-classes";

import {
  useMetadataTemplates,
  useMetadataTemplate,
  useCreateTemplate,
  useDeleteTemplate,
  useCreateTemplateField,
  useDeleteTemplateField,
} from "../hooks/use-metadata-templates";
import type { MetadataTemplate } from "../hooks/use-metadata-templates";

/* --------------------------------------------------------------------------
   Field type options for the select dropdown
   -------------------------------------------------------------------------- */

const FIELD_TYPE_OPTIONS = [
  { value: "string", label: "String" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "array", label: "Array" },
  { value: "object", label: "Object" },
];

/* --------------------------------------------------------------------------
   Template Row (expandable)
   -------------------------------------------------------------------------- */

function TemplateRow({ template }: { template: MetadataTemplate }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: detail, isLoading } = useMetadataTemplate(
    isOpen ? template.id : 0,
  );
  const deleteTemplate = useDeleteTemplate();
  const createField = useCreateTemplateField(template.id);
  const deleteField = useDeleteTemplateField(template.id);

  const [confirmDelete, setConfirmDelete] = useState(false);

  // New field form state
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("string");
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [newFieldDesc, setNewFieldDesc] = useState("");

  const handleAddField = useCallback(() => {
    if (!newFieldName.trim()) return;
    const maxSort = detail?.fields?.reduce(
      (max, f) => Math.max(max, f.sort_order),
      -1,
    ) ?? -1;
    createField.mutate(
      {
        field_name: newFieldName.trim(),
        field_type: newFieldType,
        is_required: newFieldRequired,
        description: newFieldDesc.trim() || undefined,
        sort_order: maxSort + 1,
      },
      {
        onSuccess: () => {
          setNewFieldName("");
          setNewFieldType("string");
          setNewFieldRequired(false);
          setNewFieldDesc("");
        },
      },
    );
  }, [newFieldName, newFieldType, newFieldRequired, newFieldDesc, detail?.fields, createField]);

  return (
    <div className={TERMINAL_PANEL}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(TERMINAL_HEADER, "flex w-full items-center justify-between", TERMINAL_ROW_HOVER)}
      >
        <div className="flex items-center gap-[var(--spacing-2)]">
          <span className="text-xs font-medium text-cyan-400 font-mono">
            {template.name}
          </span>
          {template.is_default && (
            <span className="text-[10px] text-green-400 font-mono uppercase">Default</span>
          )}
          {template.project_id && (
            <span className="text-[10px] text-[var(--color-text-muted)] font-mono uppercase">Project</span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn(
            "text-[var(--color-text-muted)] transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className={TERMINAL_BODY}>
          {isLoading ? (
            <div className="flex justify-center py-4">
              <ContextLoader size={32} />
            </div>
          ) : (
            <Stack gap={3}>
              {/* Fields table */}
              {detail?.fields && detail.fields.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full font-mono text-xs">
                    <thead>
                      <tr className={TERMINAL_DIVIDER}>
                        <th className={cn(TERMINAL_TH, "py-1.5 pr-3")}>Field Name</th>
                        <th className={cn(TERMINAL_TH, "py-1.5 pr-3")}>Type</th>
                        <th className={cn(TERMINAL_TH, "py-1.5 pr-3")}>Required</th>
                        <th className={cn(TERMINAL_TH, "py-1.5 pr-3")}>Description</th>
                        <th className={cn(TERMINAL_TH, "py-1.5 pr-3")}>Order</th>
                        <th className={cn(TERMINAL_TH, "py-1.5 text-right")}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.fields.map((field) => (
                        <tr
                          key={field.id}
                          className={cn(TERMINAL_DIVIDER, "last:border-0", TERMINAL_ROW_HOVER)}
                        >
                          <td className="py-1.5 pr-3 text-cyan-400">
                            {field.field_name}
                          </td>
                          <td className="py-1.5 pr-3 text-[var(--color-text-secondary)]">
                            {field.field_type}
                          </td>
                          <td className="py-1.5 pr-3">
                            {field.is_required ? (
                              <span className="text-orange-400">Yes</span>
                            ) : (
                              <span className="text-[var(--color-text-muted)]">No</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-[var(--color-text-secondary)]">
                            {field.description || "-"}
                          </td>
                          <td className="py-1.5 pr-3 text-[var(--color-text-muted)]">
                            {field.sort_order}
                          </td>
                          <td className="py-1.5 text-right">
                            <Button
                              variant="ghost"
                              size="xs"
                              className={GHOST_DANGER_BTN}
                              icon={<Trash2 size={12} />}
                              onClick={() => deleteField.mutate(field.id)}
                              aria-label={`Delete ${field.field_name}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detail?.fields?.length === 0 && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  No fields defined.
                </p>
              )}

              {/* Add field form */}
              <div className="flex items-end gap-2 border-t border-[var(--color-border-default)] pt-3">
                <div className="flex-1">
                  <Input
                    label="Field Name"
                    value={newFieldName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewFieldName(e.target.value)
                    }
                    placeholder="e.g. hobbies"
                  />
                </div>
                <div className="w-28">
                  <Select
                    label="Type"
                    options={FIELD_TYPE_OPTIONS}
                    value={newFieldType}
                    onChange={setNewFieldType}
                  />
                </div>
                <Toggle
                  label="Required"
                  size="sm"
                  checked={newFieldRequired}
                  onChange={setNewFieldRequired}
                />
                <div className="flex-1">
                  <Input
                    label="Description"
                    value={newFieldDesc}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setNewFieldDesc(e.target.value)
                    }
                    placeholder="Optional description"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={14} />}
                  onClick={handleAddField}
                  disabled={!newFieldName.trim() || createField.isPending}
                >
                  Add
                </Button>
              </div>

              {/* Delete template */}
              <div className="flex justify-end pt-2">
                <Button
                  variant="ghost"
                  size="xs"
                  className={GHOST_DANGER_BTN}
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleteTemplate.isPending}
                >
                  Delete Template
                </Button>
              </div>

              <ConfirmModal
                open={confirmDelete}
                onClose={() => setConfirmDelete(false)}
                title="Delete Template"
                confirmLabel="Delete"
                confirmVariant="danger"
                onConfirm={() => {
                  deleteTemplate.mutate(template.id);
                  setConfirmDelete(false);
                }}
              >
                <p>Delete template "{template.name}"?</p>
              </ConfirmModal>
            </Stack>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main editor
   -------------------------------------------------------------------------- */

export function MetadataTemplateEditor() {
  const { data: templates, isLoading } = useMetadataTemplates();
  const createTemplate = useCreateTemplate();
  const [newName, setNewName] = useState("");

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return;
    createTemplate.mutate(
      { name: newName.trim() },
      { onSuccess: () => setNewName("") },
    );
  }, [newName, createTemplate]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <ContextLoader size={64} />
      </div>
    );
  }

  return (
    <Stack gap={4}>
      <p className="text-sm text-[var(--color-text-muted)]">
        Manage metadata templates that define which fields avatars should have.
      </p>

      {/* Template list */}
      {templates && templates.length > 0 ? (
        <Stack gap={2}>
          {templates.map((t) => (
            <TemplateRow key={t.id} template={t} />
          ))}
        </Stack>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">
          No templates found.
        </p>
      )}

      {/* Create new template */}
      <div className="flex items-end gap-2 border-t border-[var(--color-border-default)] pt-4">
        <div className="flex-1">
          <Input
            label="New Template Name"
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setNewName(e.target.value)
            }
            placeholder="e.g. Custom Avatar Template"
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          icon={<Plus size={14} />}
          onClick={handleCreate}
          disabled={!newName.trim() || createTemplate.isPending}
        >
          New Template
        </Button>
      </div>
    </Stack>
  );
}
