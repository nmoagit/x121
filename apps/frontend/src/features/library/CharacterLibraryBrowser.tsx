/**
 * Character library browser grid with search/filter (PRD-60).
 *
 * Displays all library characters the current user can see,
 * with search filtering, scene type/track filtering, and an import callback.
 */

import { useCallback, useMemo, useState } from "react";

import { Button, Input, Select, Spinner } from "@/components";
import { useSceneCatalog } from "@/features/scene-catalog/hooks/use-scene-catalog";
import { useTracks } from "@/features/scene-catalog/hooks/use-tracks";
import { cn } from "@/lib/cn";
import { toSelectOptions } from "@/lib/select-utils";
import { Search, X } from "@/tokens/icons";

import { LibraryCharacterCard } from "./LibraryCharacterCard";
import { type LibraryFilters, useLibraryCharacters, useLibraryUsage } from "./hooks/use-library";
import type { LibraryCharacter } from "./types";

interface CharacterLibraryBrowserProps {
  onSelect?: (character: LibraryCharacter) => void;
  onImport?: (character: LibraryCharacter) => void;
}

/** Wrapper that pre-fetches usage data for a single card. */
function LibraryCardWithUsage({
  character,
  onSelect,
  onImport,
}: {
  character: LibraryCharacter;
  onSelect?: (character: LibraryCharacter) => void;
  onImport?: (character: LibraryCharacter) => void;
}) {
  const { data: usage } = useLibraryUsage(character.id);
  return (
    <LibraryCharacterCard
      character={character}
      usageCount={usage?.length ?? 0}
      usage={usage ?? []}
      onSelect={onSelect}
      onImport={onImport}
    />
  );
}

export function CharacterLibraryBrowser({ onSelect, onImport }: CharacterLibraryBrowserProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSceneTypeId, setSelectedSceneTypeId] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState("");

  // Build API-level filters from selected IDs.
  const filters: LibraryFilters | undefined = useMemo(() => {
    const sceneTypeIds = selectedSceneTypeId ? [Number(selectedSceneTypeId)] : undefined;
    const trackIds = selectedTrackId ? [Number(selectedTrackId)] : undefined;
    if (!sceneTypeIds && !trackIds) return undefined;
    return { sceneTypeIds, trackIds };
  }, [selectedSceneTypeId, selectedTrackId]);

  const { data: characters, isLoading, error } = useLibraryCharacters(filters);

  // Fetch scene types and tracks for the filter dropdowns.
  const { data: sceneCatalog } = useSceneCatalog();
  const { data: tracks } = useTracks();

  const sceneTypeOptions = useMemo(
    () => toSelectOptions(sceneCatalog?.filter((st) => st.is_active)),
    [sceneCatalog],
  );

  const trackOptions = useMemo(
    () => toSelectOptions(tracks?.filter((t) => t.is_active)),
    [tracks],
  );

  const hasActiveFilters = selectedSceneTypeId || selectedTrackId;

  const clearFilters = useCallback(() => {
    setSelectedSceneTypeId("");
    setSelectedTrackId("");
  }, []);

  // Client-side text search on top of server-filtered results.
  const filtered = useMemo(() => {
    if (!characters) return [];
    if (!searchQuery.trim()) return characters;
    const query = searchQuery.toLowerCase();
    return characters.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query) ||
        c.tags.some((t) => t.toLowerCase().includes(query)),
    );
  }, [characters, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12" data-testid="library-loading">
        <Spinner size="md" />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="text-sm text-[var(--color-status-error)] text-center py-8"
        data-testid="library-error"
      >
        Failed to load library characters.
      </div>
    );
  }

  return (
    <div data-testid="library-browser">
      {/* Search bar */}
      <div className="mb-4">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]"
            aria-hidden="true"
          />
          <Input
            placeholder="Search library characters..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="library-search"
          />
        </div>
      </div>

      {/* Scene Type & Track filters */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-[180px]">
          <Select
            label="Scene Type"
            placeholder="All scene types"
            options={sceneTypeOptions}
            value={selectedSceneTypeId}
            onChange={setSelectedSceneTypeId}
          />
        </div>
        <div className="min-w-[180px]">
          <Select
            label="Track"
            placeholder="All tracks"
            options={trackOptions}
            value={selectedTrackId}
            onChange={setSelectedTrackId}
          />
        </div>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" icon={<X />} onClick={clearFilters}>
            Clear Filters
          </Button>
        )}
      </div>

      {/* Results count */}
      <p className="text-xs text-[var(--color-text-muted)] mb-3">
        {filtered.length} character{filtered.length !== 1 ? "s" : ""}
        {(searchQuery || hasActiveFilters) && " matching"}
      </p>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div
          className={cn(
            "text-sm text-[var(--color-text-muted)] text-center py-12",
            "border border-dashed border-[var(--color-border-default)]",
            "rounded-[var(--radius-lg)]",
          )}
          data-testid="library-empty"
        >
          {searchQuery || hasActiveFilters
            ? "No characters match your filters."
            : "No library characters yet."}
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
          data-testid="library-grid"
        >
          {filtered.map((character) => (
            <LibraryCardWithUsage
              key={character.id}
              character={character}
              onSelect={onSelect}
              onImport={onImport}
            />
          ))}
        </div>
      )}
    </div>
  );
}
