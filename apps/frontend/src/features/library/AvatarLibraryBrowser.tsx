/**
 * Avatar library browser grid with search/filter (PRD-60).
 *
 * Displays all avatars across all projects in a read-only browsing view,
 * with debounced server-side search (name, project, group), grid/list toggle,
 * and a avatar preview modal.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { FilterSelect, SearchInput, Toggle ,  WireframeLoader } from "@/components";
import { Button  } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { TERMINAL_PANEL } from "@/lib/ui-classes";
import { LayoutGrid, List } from "@/tokens/icons";

import { LibraryAvatarCard, LibraryAvatarRow } from "./LibraryAvatarCard";
import { LibraryAvatarModal } from "./LibraryAvatarModal";
import { type LibraryFilters, useLibraryAvatars } from "./hooks/use-library";
import type { LibraryAvatar } from "./types";

const DEBOUNCE_MS = 300;

type ViewMode = "grid" | "list";

export function AvatarLibraryBrowser() {
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [showDisabled, setShowDisabled] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<LibraryAvatar | null>(null);
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

  const { data: avatars, isLoading, error } = useLibraryAvatars(filters);

  const handleSelect = useCallback((avatar: LibraryAvatar) => {
    setSelectedAvatar(avatar);
  }, []);

  // Derive project options from all loaded avatars.
  const projectOptions = useMemo(() => {
    if (!avatars) return [];
    const seen = new Map<number, string>();
    for (const c of avatars) {
      if (!seen.has(c.project_id)) seen.set(c.project_id, c.project_name);
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, name]) => ({ value: String(id), label: name }));
  }, [avatars]);

  // Derive group options from avatars matching the selected project.
  const groupOptions = useMemo(() => {
    if (!avatars) return [];
    const pool = projectFilter
      ? avatars.filter((c) => c.project_id === Number(projectFilter))
      : avatars;
    const names = new Set<string>();
    for (const c of pool) {
      if (c.group_name) names.add(c.group_name);
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [avatars, projectFilter]);

  // Reset group filter when project changes (groups are project-scoped).
  useEffect(() => {
    setGroupFilter("");
  }, [projectFilter]);

  const filteredAvatars = useMemo(() => {
    if (!avatars) return [];
    return avatars.filter((c) => {
      if (!showDisabled && !c.is_enabled) return false;
      if (projectFilter && c.project_id !== Number(projectFilter)) return false;
      if (groupFilter && c.group_name !== groupFilter) return false;
      return true;
    });
  }, [avatars, showDisabled, projectFilter, groupFilter]);

  const resultCount = filteredAvatars.length;

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
          <p className="font-mono text-[10px] text-[var(--color-text-muted)]">
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
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="xs"
              icon={<LayoutGrid size={14} />}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
            />
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="xs"
              icon={<List size={14} />}
              onClick={() => setViewMode("list")}
              aria-label="List view"
            />
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12" data-testid="library-loading">
          <WireframeLoader size={48} />
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
            TERMINAL_PANEL,
            "font-mono text-xs text-[var(--color-text-muted)] text-center py-12",
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
          className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 min-[1500px]:grid-cols-7 min-[1700px]:grid-cols-8 gap-4"
          data-testid="library-grid"
        >
          {filteredAvatars.map((avatar) => (
            <LibraryAvatarCard
              key={avatar.id}
              avatar={avatar}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      {!isLoading && !error && resultCount > 0 && viewMode === "list" && (
        <div className="flex flex-col gap-1" data-testid="library-list">
          {filteredAvatars.map((avatar) => (
            <LibraryAvatarRow
              key={avatar.id}
              avatar={avatar}
              onSelect={handleSelect}
            />
          ))}
        </div>
      )}

      {/* Avatar preview modal */}
      {selectedAvatar && (() => {
        const idx = filteredAvatars.findIndex((c) => c.id === selectedAvatar.id);
        const prev = idx > 0 ? filteredAvatars[idx - 1] : undefined;
        const next = idx >= 0 && idx < filteredAvatars.length - 1 ? filteredAvatars[idx + 1] : undefined;
        return (
          <LibraryAvatarModal
            avatar={selectedAvatar}
            open
            onClose={() => setSelectedAvatar(null)}
            onPrev={prev ? () => setSelectedAvatar(prev) : undefined}
            onNext={next ? () => setSelectedAvatar(next) : undefined}
          />
        );
      })()}
    </div>
  );
}
