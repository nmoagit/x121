/**
 * Production Notes page — entity type + entity ID pickers wrapping
 * the notes panel and pinned notes banner.
 *
 * Flow: Entity Type -> Entity ID -> NotesPanel + PinnedNoteBanner
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Select, Input, LoadingPane } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { FileText } from "@/tokens/icons";

import {
  NotesPanel,
  PinnedNoteBanner,
  useProductionNotes,
  usePinnedNotes,
  useNoteCategories,
  useTogglePin,
} from "@/features/production-notes";
import type { NoteEntityType } from "@/features/production-notes";

const ENTITY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "project", label: "Project" },
  { value: "character", label: "Character" },
  { value: "scene", label: "Scene" },
  { value: "segment", label: "Segment" },
  { value: "scene_type", label: "Scene Type" },
  { value: "workflow", label: "Workflow" },
];

function EntityNotes({
  entityType,
  entityId,
}: {
  entityType: NoteEntityType;
  entityId: number;
}) {
  const { data: notes, isLoading } = useProductionNotes(entityType, entityId);
  const { data: pinnedNotes } = usePinnedNotes(entityType, entityId);
  const { data: categories } = useNoteCategories();
  const togglePin = useTogglePin();

  if (isLoading) {
    return <LoadingPane />;
  }

  return (
    <Stack gap={4}>
      {pinnedNotes && pinnedNotes.length > 0 && (
        <PinnedNoteBanner notes={pinnedNotes} categories={categories ?? []} />
      )}
      <NotesPanel
        notes={notes ?? []}
        categories={categories ?? []}
        onTogglePin={(noteId) => togglePin.mutate(noteId)}
      />
    </Stack>
  );
}

export function ProductionNotesPage() {
  const [selectedEntityType, setSelectedEntityType] = useState("");
  const [entityIdInput, setEntityIdInput] = useState("");

  const entityType = selectedEntityType as NoteEntityType;
  const entityId = Number(entityIdInput);
  const hasSelection = selectedEntityType !== "" && entityId > 0;

  return (
    <Stack gap={6}>
      <PageHeader
        title="Production Notes"
        description="View and manage production notes and discussions for any entity."
      />

      <div className="flex flex-wrap items-end gap-[var(--spacing-3)]">
        <div className="w-[200px]">
          <Select
            label="Entity Type"
            placeholder="Select type..."
            options={ENTITY_TYPE_OPTIONS}
            value={selectedEntityType}
            onChange={(v) => {
              setSelectedEntityType(v);
              setEntityIdInput("");
            }}
          />
        </div>

        <div className="w-[200px]">
          <Input
            label="Entity ID"
            type="number"
            placeholder={
              selectedEntityType ? "Enter ID..." : "Select a type first"
            }
            value={entityIdInput}
            onChange={(e) => setEntityIdInput(e.target.value)}
            disabled={!selectedEntityType}
            min="1"
          />
        </div>
      </div>

      {hasSelection ? (
        <EntityNotes entityType={entityType} entityId={entityId} />
      ) : (
        <EmptyState
          icon={<FileText size={32} />}
          title={
            selectedEntityType
              ? "Enter an entity ID"
              : "Select an entity type"
          }
          description={
            selectedEntityType
              ? "Type an entity ID above to view production notes."
              : "Choose an entity type from the dropdown to get started."
          }
        />
      )}
    </Stack>
  );
}
