/**
 * Branch manager component (PRD-50).
 *
 * Displays all branches for a scene with active (default) branch indicator,
 * create/rename/delete actions, promote button, and depth indicator.
 */

import { useState } from "react";

import { Badge, Button } from "@/components";
import { formatDateTime } from "@/lib/format";

import type { Branch } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEPTH_INDENT_PX = 16;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface BranchManagerProps {
  /** All branches for the current scene. */
  branches: Branch[];
  /** Callback when the create button is submitted. */
  onCreate?: (name: string, description: string) => void;
  /** Callback when promote is clicked. */
  onPromote?: (id: number) => void;
  /** Callback when delete is clicked. */
  onDelete?: (id: number) => void;
  /** Callback when rename is submitted. */
  onRename?: (id: number, name: string) => void;
  /** Whether a mutation is in-flight. */
  isLoading?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BranchManager({
  branches,
  onCreate,
  onPromote,
  onDelete,
  onRename,
  isLoading = false,
}: BranchManagerProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const handleCreate = () => {
    if (newName.trim() && onCreate) {
      onCreate(newName.trim(), newDescription.trim());
      setNewName("");
      setNewDescription("");
      setShowCreate(false);
    }
  };

  const handleRename = (id: number) => {
    if (renameValue.trim() && onRename) {
      onRename(id, renameValue.trim());
      setRenamingId(null);
      setRenameValue("");
    }
  };

  return (
    <div data-testid="branch-manager" className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Branches ({branches.length})
        </h3>
        {onCreate && (
          <Button
            data-testid="create-branch-btn"
            variant="primary"
            size="sm"
            disabled={isLoading}
            onClick={() => setShowCreate(!showCreate)}
          >
            {showCreate ? "Cancel" : "New Branch"}
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <div
          data-testid="create-branch-form"
          className="space-y-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] p-3"
        >
          <input
            data-testid="branch-name-input"
            type="text"
            placeholder="Branch name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-2 py-1 text-sm"
          />
          <input
            data-testid="branch-description-input"
            type="text"
            placeholder="Description (optional)"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
            className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-2 py-1 text-sm"
          />
          <Button
            data-testid="submit-create-btn"
            variant="primary"
            size="sm"
            disabled={!newName.trim() || isLoading}
            onClick={handleCreate}
          >
            Create
          </Button>
        </div>
      )}

      {/* Branch list */}
      {branches.length === 0 && (
        <p
          data-testid="empty-state"
          className="py-4 text-center text-sm text-[var(--color-text-muted)]"
        >
          No branches yet.
        </p>
      )}

      <div className="space-y-1">
        {branches.map((branch) => (
          <div
            key={branch.id}
            data-testid={`branch-item-${branch.id}`}
            className="flex items-center gap-2 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-3 py-2"
            style={{ marginLeft: branch.depth * DEPTH_INDENT_PX }}
          >
            {/* Depth indicator */}
            {branch.depth > 0 && (
              <span
                data-testid={`depth-indicator-${branch.id}`}
                className="text-xs text-[var(--color-text-muted)]"
              >
                {"--".repeat(branch.depth)}
              </span>
            )}

            {/* Name or rename input */}
            <div className="min-w-0 flex-1">
              {renamingId === branch.id ? (
                <div className="flex items-center gap-1">
                  <input
                    data-testid={`rename-input-${branch.id}`}
                    type="text"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="flex-1 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-primary)] px-1.5 py-0.5 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(branch.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleRename(branch.id)}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span
                    data-testid={`branch-name-${branch.id}`}
                    className="truncate text-sm font-medium text-[var(--color-text-primary)]"
                  >
                    {branch.name}
                  </span>
                  {branch.is_default && (
                    <span data-testid={`default-badge-${branch.id}`}>
                      <Badge variant="info">Default</Badge>
                    </span>
                  )}
                </div>
              )}
              <span className="text-xs text-[var(--color-text-muted)]">
                {formatDateTime(branch.created_at)}
              </span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              {onRename && renamingId !== branch.id && (
                <button
                  data-testid={`rename-btn-${branch.id}`}
                  type="button"
                  className="rounded px-1.5 py-0.5 text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)]"
                  onClick={() => {
                    setRenamingId(branch.id);
                    setRenameValue(branch.name);
                  }}
                >
                  Rename
                </button>
              )}
              {!branch.is_default && onPromote && (
                <button
                  data-testid={`promote-btn-${branch.id}`}
                  type="button"
                  disabled={isLoading}
                  className="rounded bg-green-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  onClick={() => onPromote(branch.id)}
                >
                  Promote
                </button>
              )}
              {!branch.is_default && onDelete && (
                <button
                  data-testid={`delete-btn-${branch.id}`}
                  type="button"
                  disabled={isLoading}
                  className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  onClick={() => onDelete(branch.id)}
                >
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
