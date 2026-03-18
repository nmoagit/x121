/**
 * Character library browser grid with search/filter (PRD-60).
 *
 * Displays all characters across all projects in a read-only browsing view,
 * with debounced server-side search (name, project, group), grid/list toggle,
 * and a character preview modal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterSelect, SearchInput, Spinner, Toggle } from "@/components";
import { cn } from "@/lib/cn";
import { LayoutGrid, List } from "@/tokens/icons";

import { LibraryCharacterCard, LibraryCharacterRow } from "./LibraryCharacterCard";
import { LibraryCharacterModal } from "./LibraryCharacterModal";
import { type LibraryFilters, useLibraryCharacters } from "./hooks/use-library";
import type { LibraryCharacter } from "./types";

const DEBOUNCE_MS = 300;

type ViewMode = "grid" | "list";

export function CharacterLibraryBrowser() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedCharacter, setSelectedCharacter] = useState<LibraryCharacter | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  // Debounce the search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Build API-level filters from debounced search.
  const filters: LibraryFilters | undefined = useMemo(() => {
    const search = debouncedSearch.trim() || undefined;
    if (!search) return undefined;
    return { search };
  }, [debouncedSearch]);

  const { data: characters, isLoading, error } = useLibraryCharacters(filters);

  const handleSelect = useCallback((character: LibraryCharacter) => {
    setSelectedCharacter(character);
  }, []);

  // Derive project options from all loaded characters.
  const projectOptions = useMemo(() => {
    if (!characters) return [];
    const seen = new Map<number, string>();
    for (const c of characters) {
      if (!seen.has(c.project_id)) seen.set(c.project_id, c.project_name);
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ value: String(id), label: name }));
  }, [characters]);

  // Derive group options from characters matching the selected project.
  const groupOptions = useMemo(() => {
    if (!characters) return [];
    const pool = projectFilter
      ? characters.filter((c) => c.project_id === Number(projectFilter))
      : characters;
    const names = new Set<string>();
    for (const c of pool) {
      if (c.group_name) names.add(c.group_name);
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [characters, projectFilter]);

  // Reset group filter when project changes (groups are project-scoped).
  useEffect(() => {
    setGroupFilter("");
  }, [projectFilter]);

  const filteredCharacters = useMemo(() => {
    if (!characters) return [];
    return characters.filter((c) => {
      if (!showDisabled && !c.is_enabled) return false;
      if (projectFilter && c.project_id !== Number(projectFilter)) return false;
      if (groupFilter && c.group_name !== groupFilter) return false;
      return true;
    });
  }, [characters, showDisabled, projectFilter, groupFilter]);

  const resultCount = filteredCharacters.length;

  return (
    <div data-testid="library-browser">
      {/* Search bar — always rendered to preserve focus */}
      <SearchInput
        placeholder="Search by name, project, or group..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        data-testid="library-search"
        className="mb-4"
      />

      {/* Filters */}
      <div className="flex items-center gap-2 mb-3">
        <FilterSelect
          options={projectOptions}
          value={projectFilter}
          onChange={setProjectFilter}
          placeholder="All Projects"
          size="sm"
        />
        <FilterSelect
          options={groupOptions}
          value={groupFilter}
          onChange={setGroupFilter}
          placeholder="All Groups"
          size="sm"
          disabled={!projectFilter}
        />
      </div>

      {/* Results count + view toggle */}
      {!isLoading && !error && (
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            {resultCount} model{resultCount !== 1 ? "s" : ""}
            {debouncedSearch && " matching"}
          </p>
          <div className="flex items-center gap-2">
            <Toggle
              checked={showDisabled}
              onChange={() => setShowDisabled((p) => !p)}
              label="Show disabled"
              size="sm"
            />
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-1.5 rounded-[var(--radius-sm)] transition-colors",
                viewMode === "grid"
                  ? "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
              aria-label="Grid view"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={cn(
                "p-1.5 rounded-[var(--radius-sm)] transition-colors",
                viewMode === "list"
                  ? "bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)]"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
              )}
              aria-label="List view"
            >
              <List size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12" data-testid="library-loading">
          <Spinner size="md" />
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="text-sm text-[var(--color-status-error)] text-center py-8"
          data-testid="library-error"
        >
          Failed to load library models.
        </div>
      )}

      {/* Grid / List */}
      {!isLoading && !error && resultCount === 0 && (
        <div
          className={cn(
            "text-sm text-[var(--color-text-muted)] text-center py-12",
            "border border-dashed border-[var(--color-border-default)]",
            "rounded-[var(--radius-lg)]",
          )}
          data-testid="library-empty"
        >
          {debouncedSearch
            ? "No models match your search."
            : "No models found."}
        </div>
      )}

      {!isLoading && !error && resultCount > 0 && viewMode === "grid" && (
        <div
          className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-5 xl:grid-cols-6 gap-4"
          data-testid="library-grid"
        >
          {filteredCharacters.map((character) => (
            <LibraryCharacterCard
              key={character.id}
              character={character}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      {!isLoading && !error && resultCount > 0 && viewMode === "list" && (
        <div className="flex flex-col gap-1" data-testid="library-list">
          {filteredCharacters.map((character) => (
            <LibraryCharacterRow
              key={character.id}
              character={character}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      {/* Character preview modal */}
      {selectedCharacter && (
        <LibraryCharacterModal
          character={selectedCharacter}
          open
          onClose={() => setSelectedCharacter(null)}
        />
      )}
    </div>
  );
}
