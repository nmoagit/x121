/**
 * Saved searches panel (PRD-20).
 *
 * Lists saved searches with use count, allows executing, saving current
 * search, and deleting saved searches.
 */

import { useState, useCallback } from "react";

import { Badge, Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import {
  useSavedSearches,
  useCreateSavedSearch,
  useDeleteSavedSearch,
} from "./hooks/use-search";
import type { SavedSearch, SearchParams } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SavedSearchesProps {
  /** Current active search params (used when saving a new search). */
  currentParams?: SearchParams;
  /** Called when a saved search is selected for execution. */
  onExecute: (saved: SavedSearch) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SavedSearches({ currentParams, onExecute }: SavedSearchesProps) {
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");

  const { data: savedSearches = [], isLoading } = useSavedSearches();
  const createMutation = useCreateSavedSearch();
  const deleteMutation = useDeleteSavedSearch();

  const handleSave = useCallback(() => {
    if (!saveName.trim()) return;

    createMutation.mutate(
      {
        name: saveName.trim(),
        description: saveDescription.trim() || undefined,
        query_text: currentParams?.q ?? undefined,
        entity_types: currentParams?.entity_types
          ? currentParams.entity_types.split(",")
          : undefined,
        filters: currentParams?.project_id
          ? { project_id: currentParams.project_id }
          : undefined,
      },
      {
        onSuccess: () => {
          setSaveName("");
          setSaveDescription("");
          setShowSaveForm(false);
        },
      },
    );
  }, [saveName, saveDescription, currentParams, createMutation]);

  const handleDelete = useCallback(
    (id: number, event: React.MouseEvent) => {
      event.stopPropagation();
      deleteMutation.mutate(id);
    },
    [deleteMutation],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
          Saved Searches
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSaveForm((prev) => !prev)}
        >
          {showSaveForm ? "Cancel" : "Save Current"}
        </Button>
      </div>

      {/* Save form */}
      {showSaveForm && (
        <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3 bg-[var(--color-surface-secondary)]">
          <Input
            placeholder="Search name"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
          />
          <Input
            placeholder="Description (optional)"
            value={saveDescription}
            onChange={(e) => setSaveDescription(e.target.value)}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!saveName.trim() || createMutation.isPending}
          >
            {createMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      )}

      {/* Saved searches list */}
      {isLoading ? (
        <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
      ) : savedSearches.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No saved searches yet
        </p>
      ) : (
        <Stack direction="vertical" gap={1}>
          {savedSearches.map((saved) => (
            <button
              key={saved.id}
              type="button"
              onClick={() => onExecute(saved)}
              className="flex items-center justify-between rounded-[var(--radius-sm)] px-3 py-2 text-left transition-colors hover:bg-[var(--color-surface-secondary)]"
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-[var(--color-text-primary)] truncate block">
                  {saved.name}
                </span>
                {saved.query_text && (
                  <span className="text-xs text-[var(--color-text-muted)] truncate block">
                    {saved.query_text}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 ml-2 shrink-0">
                <Badge size="sm" variant="default">
                  {saved.use_count}
                </Badge>
                {saved.is_shared && (
                  <Badge size="sm" variant="info">
                    Shared
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => handleDelete(saved.id, e)}
                  disabled={deleteMutation.isPending}
                  aria-label={`Delete saved search: ${saved.name}`}
                >
                  Delete
                </Button>
              </div>
            </button>
          ))}
        </Stack>
      )}
    </div>
  );
}
