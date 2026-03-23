/**
 * Undo/redo history browser page (PRD-51).
 *
 * Allows the user to select an entity, then browse its undo tree
 * history with navigation and state preview.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, Input, Select } from "@/components/primitives";

import { HistoryBrowser, StatePreview, useEntityUndo } from "@/features/undo";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function UndoPage() {
  const [entityType, setEntityType] = useState("avatar");
  const [entityId, setEntityId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);

  const activeEntityId = entityId ?? 0;
  const {
    tree,
    undo,
    redo,
    canUndo,
    canRedo,
    version: _version,
  } = useEntityUndo(entityType, activeEntityId);

  const handleLoad = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setEntityId(parsed);
      setPreviewNodeId(null);
    }
  };

  const handleNavigate = (nodeId: string) => {
    tree.navigateTo(nodeId);
    setPreviewNodeId(nodeId);
  };

  const previewNode = previewNodeId ? tree.getNode(previewNodeId) : null;

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Undo History"
          description="Browse and navigate the undo/redo tree for any entity."
        />

        {/* Entity selector */}
        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Select
              label="Entity Type"
              value={entityType}
              onChange={setEntityType}
              options={[
                { value: "avatar", label: "Avatar" },
                { value: "scene", label: "Scene" },
                { value: "workflow", label: "Workflow" },
                { value: "project", label: "Project" },
              ]}
            />
          </div>

          <div className="w-36">
            <Input
              label="Entity ID"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter ID"
              min="1"
            />
          </div>

          <Button variant="primary" onClick={handleLoad} disabled={!inputValue.trim()}>
            Load
          </Button>
        </Stack>

        {/* Undo/redo actions */}
        {entityId !== null && (
          <Stack direction="horizontal" gap={2}>
            <Button variant="secondary" size="sm" onClick={() => undo()} disabled={!canUndo}>
              Undo
            </Button>
            <Button variant="secondary" size="sm" onClick={() => redo()} disabled={!canRedo}>
              Redo
            </Button>
          </Stack>
        )}

        {/* History browser + state preview */}
        {entityId !== null && (
          <div className="grid gap-6 lg:grid-cols-2">
            <HistoryBrowser tree={tree} onNavigate={handleNavigate} />
            <StatePreview node={previewNode ?? null} />
          </div>
        )}

        {/* Empty state */}
        {entityId === null && (
          <p className="text-sm text-[var(--color-text-muted)]">
            Select an entity type and ID above to browse its undo history.
          </p>
        )}
      </Stack>
    </div>
  );
}
