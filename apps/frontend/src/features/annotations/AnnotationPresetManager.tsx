/**
 * Modal for managing annotation text presets (PRD-149).
 *
 * Allows creating, editing, and deleting annotation presets
 * scoped to a pipeline.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input } from "@/components/primitives";
import { Edit3, Plus, Trash2, X } from "@/tokens/icons";

import {
  useAnnotationPresets,
  useCreateAnnotationPreset,
  useUpdateAnnotationPreset,
  useDeleteAnnotationPreset,
  type AnnotationPreset,
} from "./hooks/use-annotation-presets";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface AnnotationPresetManagerProps {
  open: boolean;
  onClose: () => void;
  pipelineId?: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AnnotationPresetManager({
  open,
  onClose,
  pipelineId,
}: AnnotationPresetManagerProps) {
  const { data: presets = [] } = useAnnotationPresets(pipelineId);
  const createMutation = useCreateAnnotationPreset(pipelineId);
  const updateMutation = useUpdateAnnotationPreset(pipelineId);
  const deleteMutation = useDeleteAnnotationPreset(pipelineId);

  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState("");

  const handleCreate = useCallback(() => {
    const label = newLabel.trim();
    if (!label) return;
    createMutation.mutate(
      { pipeline_id: pipelineId, label },
      { onSuccess: () => setNewLabel("") },
    );
  }, [newLabel, pipelineId, createMutation]);

  const startEdit = useCallback((preset: AnnotationPreset) => {
    setEditingId(preset.id);
    setEditLabel(preset.label);
    setEditColor(preset.color ?? "");
  }, []);

  const saveEdit = useCallback(() => {
    if (editingId === null) return;
    updateMutation.mutate(
      { id: editingId, label: editLabel || undefined, color: editColor || null },
      { onSuccess: () => setEditingId(null) },
    );
  }, [editingId, editLabel, editColor, updateMutation]);

  const handleDelete = useCallback(
    (id: number) => {
      deleteMutation.mutate(id);
      if (editingId === id) setEditingId(null);
    },
    [deleteMutation, editingId],
  );

  return (
    <Modal open={open} onClose={onClose} title="Manage Annotation Presets" size="lg">
      <Stack gap={3}>
        <p className="text-xs font-mono text-[var(--color-text-muted)]">
          Create quick-fill text presets for annotation notes.
        </p>

        {/* Create new preset */}
        <div className="flex items-center gap-2">
          <Input
            size="sm"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="New preset label..."
            className="flex-1"
            onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          />
          <Button
            size="xs"
            variant="primary"
            icon={<Plus size={12} />}
            onClick={handleCreate}
            disabled={!newLabel.trim() || createMutation.isPending}
          >
            Add
          </Button>
        </div>

        {/* Preset list */}
        {presets.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">
            No presets created yet.
          </p>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 bg-[#0d1117] border border-[var(--color-border-default)]"
              >
                {editingId === preset.id ? (
                  <>
                    <input
                      type="color"
                      value={editColor || "#6b7280"}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border-none bg-transparent"
                      title="Preset color"
                    />
                    <Input
                      size="sm"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit();
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <Button size="xs" variant="primary" onClick={saveEdit}>
                      Save
                    </Button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  <>
                    {preset.color && (
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: preset.color }}
                      />
                    )}
                    <span className="flex-1 font-mono text-xs text-[var(--color-text-primary)]">
                      {preset.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(preset)}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors"
                      title="Edit"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(preset.id)}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-red-400 hover:bg-[#161b22] transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Stack>
    </Modal>
  );
}
