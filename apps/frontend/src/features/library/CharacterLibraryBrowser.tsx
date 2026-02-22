/**
 * Character library browser grid with search/filter (PRD-60).
 *
 * Displays all library characters the current user can see,
 * with search filtering and an import callback.
 */

import { useMemo, useState } from "react";

import { Input, Spinner } from "@/components";
import { cn } from "@/lib/cn";
import { Search } from "@/tokens/icons";

import { useLibraryCharacters, useLibraryUsage } from "./hooks/use-library";
import { LibraryCharacterCard } from "./LibraryCharacterCard";
import type { LibraryCharacter } from "./types";

interface CharacterLibraryBrowserProps {
  onSelect?: (character: LibraryCharacter) => void;
  onImport?: (character: LibraryCharacter) => void;
}

/** Wrapper that pre-fetches usage count for a single card. */
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
      onSelect={onSelect}
      onImport={onImport}
    />
  );
}

export function CharacterLibraryBrowser({
  onSelect,
  onImport,
}: CharacterLibraryBrowserProps) {
  const { data: characters, isLoading, error } = useLibraryCharacters();
  const [searchQuery, setSearchQuery] = useState("");

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
      <div
        className="flex items-center justify-center py-12"
        data-testid="library-loading"
      >
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

      {/* Results count */}
      <p className="text-xs text-[var(--color-text-muted)] mb-3">
        {filtered.length} character{filtered.length !== 1 ? "s" : ""}
        {searchQuery && " matching"}
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
          {searchQuery
            ? "No characters match your search."
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
