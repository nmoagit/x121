/**
 * Source path and project selection for legacy import (PRD-86).
 */

import { useState } from "react";

import type { MatchKey } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const MATCH_KEY_OPTIONS: { value: MatchKey; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "id", label: "ID" },
  { value: "path", label: "Path" },
  { value: "hash", label: "Hash" },
];

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface SourceSelectionProps {
  /** Currently selected project ID. */
  projectId: number;
  /** Called when the user selects the source path, project, and match key. */
  onSelect?: (sourcePath: string, projectId: number, matchKey: MatchKey) => void;
  /** Whether the form is disabled. */
  disabled?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SourceSelection({
  projectId,
  onSelect,
  disabled = false,
}: SourceSelectionProps) {
  const [sourcePath, setSourcePath] = useState("");
  const [matchKey, setMatchKey] = useState<MatchKey>("name");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sourcePath.trim() && onSelect) {
      onSelect(sourcePath.trim(), projectId, matchKey);
    }
  };

  return (
    <div data-testid="source-selection" className="space-y-4">
      <h3 className="text-lg font-medium text-[var(--color-text-primary)]">
        Select Source
      </h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label
            htmlFor="source-path"
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
          >
            Folder Path
          </label>
          <input
            id="source-path"
            data-testid="source-path-input"
            type="text"
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="/data/legacy/characters"
            disabled={disabled}
            className="w-full rounded border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="match-key"
            className="block text-sm font-medium text-[var(--color-text-secondary)] mb-1"
          >
            Match Key
          </label>
          <select
            id="match-key"
            data-testid="match-key-select"
            value={matchKey}
            onChange={(e) => setMatchKey(e.target.value as MatchKey)}
            disabled={disabled}
            className="w-full rounded border px-3 py-2 text-sm"
          >
            {MATCH_KEY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          data-testid="start-scan-btn"
          disabled={disabled || !sourcePath.trim()}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Start Scan
        </button>
      </form>
    </div>
  );
}
