/**
 * Scene catalog list view (PRD-111).
 *
 * Displays all catalog entries in a table with track badges,
 * active/inactive status, and edit/deactivate actions.
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Spinner, Toggle } from "@/components/primitives";
import { Plus } from "@/tokens/icons";

import {
  useDeactivateSceneCatalogEntry,
  useSceneCatalog,
} from "./hooks/use-scene-catalog";
import { SceneCatalogForm } from "./SceneCatalogForm";
import { TrackBadge } from "./TrackBadge";
import type { SceneCatalogEntry } from "./types";

/* --------------------------------------------------------------------------
   Entry row
   -------------------------------------------------------------------------- */

interface EntryRowProps {
  entry: SceneCatalogEntry;
  onEdit: (entry: SceneCatalogEntry) => void;
  onDeactivate: (entry: SceneCatalogEntry) => void;
}

function EntryRow({ entry, onEdit, onDeactivate }: EntryRowProps) {
  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {entry.name}
          </span>
          <span className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {entry.slug}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {entry.description ?? "\u2014"}
      </td>
      <td className="px-4 py-3">
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
      <td className="px-4 py-3 text-center">
        {entry.has_clothes_off_transition ? (
          <Badge variant="warning" size="sm">Yes</Badge>
        ) : (
          <span className="text-xs text-[var(--color-text-muted)]">No</span>
        )}
      </td>
      <td className="px-4 py-3">
        <Badge variant={entry.is_active ? "success" : "default"} size="sm">
          {entry.is_active ? "Active" : "Inactive"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(entry)}>
            Edit
          </Button>
          {entry.is_active && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => onDeactivate(entry)}
            >
              Deactivate
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function SceneCatalogList() {
  const [showInactive, setShowInactive] = useState(false);
  const { data: entries, isLoading } = useSceneCatalog(showInactive);
  const deactivateMutation = useDeactivateSceneCatalogEntry();

  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<SceneCatalogEntry | undefined>();
  const [deactivateTarget, setDeactivateTarget] =
    useState<SceneCatalogEntry | null>(null);

  const handleEdit = useCallback((entry: SceneCatalogEntry) => {
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
            Scene Catalog
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
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={20} />}
            onClick={handleCreate}
          >
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
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Name</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Description</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Tracks</th>
                <th className="px-4 py-3 text-center font-medium text-[var(--color-text-muted)]">Clothes Off</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Status</th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {!entries || entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No scene catalog entries. Click "Add Scene" to create one.
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
      <SceneCatalogForm
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
              <strong className="text-[var(--color-text-primary)]">
                {deactivateTarget.name}
              </strong>
              ? It will no longer appear in scene settings.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeactivateTarget(null)}
              >
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
