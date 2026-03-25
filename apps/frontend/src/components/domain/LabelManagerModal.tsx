/**
 * Modal for managing pipeline-scoped labels (tags).
 *
 * Allows editing display names, colors, and deleting unused labels.
 */

import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { cn } from "@/lib/cn";

import { Modal } from "@/components/composite";
import { Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { Edit3, Trash2, X } from "@/tokens/icons";

interface Label {
  id: number;
  name: string;
  display_name: string;
  color: string | null;
  usage_count: number;
  pipeline_id: number | null;
}

interface LabelManagerModalProps {
  open: boolean;
  onClose: () => void;
  pipelineId?: number;
}

export function LabelManagerModal({ open, onClose, pipelineId }: LabelManagerModalProps) {
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  // Fetch labels
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: "200" });
    if (pipelineId) params.set("pipeline_id", String(pipelineId));
    api.get<Label[]>(`/tags?${params}`)
      .then(setLabels)
      .catch(() => setLabels([]))
      .finally(() => setLoading(false));
  }, [open, pipelineId]);

  const startEdit = useCallback((label: Label) => {
    setEditingId(label.id);
    setEditName(label.display_name);
    setEditColor(label.color ?? "");
  }, []);

  const saveEdit = useCallback(async () => {
    if (editingId === null) return;
    try {
      await api.put(`/tags/${editingId}`, {
        display_name: editName || undefined,
        color: editColor || null,
      });
      setLabels((prev) =>
        prev.map((l) =>
          l.id === editingId
            ? { ...l, display_name: editName || l.display_name, color: editColor || null }
            : l,
        ),
      );
      setEditingId(null);
    } catch {
      // silently fail
    }
  }, [editingId, editName, editColor]);

  const deleteLabel = useCallback(async (id: number) => {
    try {
      await api.delete(`/tags/${id}`);
      setLabels((prev) => prev.filter((l) => l.id !== id));
    } catch {
      // silently fail
    }
  }, []);

  return (
    <Modal open={open} onClose={onClose} title="Manage Labels" size="lg">
      <Stack gap={3}>
        <p className="text-xs font-mono text-[var(--color-text-muted)]">
          Edit or delete labels for this pipeline. Labels with usage count 0 can be safely deleted.
        </p>

        {loading ? (
          <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">Loading...</p>
        ) : labels.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)] py-4 text-center">No labels created yet.</p>
        ) : (
          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {labels.map((label) => (
              <div
                key={label.id}
                className={cn(
                  "flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-2",
                  "bg-[#0d1117] border border-[var(--color-border-default)]",
                )}
              >
                {editingId === label.id ? (
                  /* Edit mode */
                  <>
                    <input
                      type="color"
                      value={editColor || "#6b7280"}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-5 h-5 rounded cursor-pointer border-none bg-transparent"
                      title="Label color"
                    />
                    <Input
                      size="sm"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingId(null); }}
                    />
                    <Button size="xs" variant="primary" onClick={saveEdit}>Save</Button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </>
                ) : (
                  /* Display mode */
                  <>
                    {label.color && (
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                    )}
                    <span className="flex-1 font-mono text-xs text-[var(--color-text-primary)]">
                      {label.display_name}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {label.usage_count} use{label.usage_count !== 1 ? "s" : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(label)}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[#161b22] transition-colors"
                      title="Edit"
                    >
                      <Edit3 size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteLabel(label.id)}
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
