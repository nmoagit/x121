/**
 * Scene catalogue list view (PRD-111).
 *
 * Displays all catalogue entries in a table with track badges,
 * active/inactive status, and edit/deactivate actions.
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Spinner, Toggle } from "@/components/primitives";
import { Plus } from "@/tokens/icons";

import { SceneCatalogueForm } from "./SceneCatalogueForm";
import { TrackBadge } from "./TrackBadge";
import { useDeactivateSceneCatalogueEntry, useSceneCatalogue } from "./hooks/use-scene-catalogue";
import type { SceneCatalogueEntry } from "./types";

/* --------------------------------------------------------------------------
   Entry row
   -------------------------------------------------------------------------- */

interface EntryRowProps {
  entry: SceneCatalogueEntry;
  onEdit: (entry: SceneCatalogueEntry) => void;
  onDeactivate: (entry: SceneCatalogueEntry) => void;
}

function EntryRow({ entry, onEdit, onDeactivate }: EntryRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-3 py-1.5">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-[var(--color-text-primary)]">{entry.name}</span>
          <span className="text-xs text-[var(--color-text-muted)] mt-0.5">{entry.slug}</span>
        </div>
      </td>
      <td className="px-3 py-1.5 text-xs text-[var(--color-text-secondary)]">
        {entry.description ?? "\u2014"}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex flex-wrap gap-1">
          {entry.tracks.length === 0 ? (
            <span className="text-xs text-[var(--color-text-muted)]">None</span>
          ) : (
            entry.tracks.map((track) => (
              <TrackBadge key={track.id} name={track.name} slug={track.slug} />
            ))
          )}
        </div>
      </td>
      <td className="px-3 py-1.5 text-center">
        {entry.has_clothes_off_transition ? (
          <Badge variant="warning" size="sm">
            Yes
          </Badge>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">No</span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <Badge variant={entry.is_active ? "success" : "default"} size="sm">
          {entry.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="rounded px-2 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
          >
            Edit
          </button>
          {entry.is_active && (
            <button
              type="button"
              onClick={() => onDeactivate(entry)}
              className="rounded px-2 py-0.5 text-xs text-[var(--color-action-danger)] hover:bg-[var(--color-action-danger)]/10"
            >
              Deactivate
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function SceneCatalogueList() {
  const [showInactive, setShowInactive] = useState(false);
  const { data: entries, isLoading } = useSceneCatalogue(showInactive);
  const deactivateMutation = useDeactivateSceneCatalogueEntry();

  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<SceneCatalogueEntry | undefined>();
  const [deactivateTarget, setDeactivateTarget] = useState<SceneCatalogueEntry | null>(null);

  const handleEdit = useCallback((entry: SceneCatalogueEntry) => {
    setEditEntry(entry);
    setFormOpen(true);
  }, []);

  const handleCreate = useCallback(() => {
    setEditEntry(undefined);
    setFormOpen(true);
  }, []);

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setEditEntry(undefined);
  }, []);

  const handleConfirmDeactivate = useCallback(() => {
    if (!deactivateTarget) return;
    deactivateMutation.mutate(deactivateTarget.id, {
      onSuccess: () => setDeactivateTarget(null),
    });
  }, [deactivateTarget, deactivateMutation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Stack gap={6}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Scene Catalogue
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Define scene types available across projects.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Toggle
            checked={showInactive}
            onChange={setShowInactive}
            label="Show Inactive"
            size="sm"
          />
          <Button variant="primary" size="md" icon={<Plus size={20} />} onClick={handleCreate}>
            Add Scene
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card elevation="sm" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Name
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Description
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Tracks
                </th>
                <th className="px-3 py-1.5 text-center text-xs font-medium text-[var(--color-text-muted)]">
                  Clothes Off
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Status
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {!entries || entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-6 text-center text-xs text-[var(--color-text-muted)]"
                  >
                    No scene catalogue entries. Click "Add Scene" to create one.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    entry={entry}
                    onEdit={handleEdit}
                    onDeactivate={setDeactivateTarget}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Create/Edit drawer */}
      <SceneCatalogueForm
        key={editEntry?.id ?? "new"}
        entry={editEntry}
        open={formOpen}
        onClose={handleFormClose}
      />

      {/* Deactivate confirmation */}
      <Modal
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate Scene"
        size="sm"
      >
        {deactivateTarget && (
          <Stack gap={4}>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Are you sure you want to deactivate{" "}
              <strong className="text-[var(--color-text-primary)]">{deactivateTarget.name}</strong>?
              It will no longer appear in scene settings.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeactivateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDeactivate}
                loading={deactivateMutation.isPending}
              >
                Deactivate
              </Button>
            </div>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}
