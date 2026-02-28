/**
 * PresetManager -- popover dropdown for managing dashboard presets (PRD-89).
 *
 * Lists user presets with an active indicator. Supports create, rename,
 * delete, activate, and share operations.
 */

import { useRef, useState } from "react";

import { Button, Input } from "@/components/primitives";
import { useClickOutside } from "@/hooks/useClickOutside";
import { cn } from "@/lib/cn";
import { Plus } from "@/tokens/icons";

import type { DashboardPreset } from "./types";
import { PresetImportDialog } from "./PresetImportDialog";
import { PresetListItem } from "./PresetListItem";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface PresetManagerProps {
  presets: DashboardPreset[];
  onActivate: (id: number) => void;
  onDelete: (id: number) => void;
  onCreate: (name: string) => void;
  onShare: (id: number) => void;
  onImport: (shareToken: string) => void;
  isImporting?: boolean;
}

export function PresetManager({
  presets,
  onActivate,
  onDelete,
  onCreate,
  onShare,
  onImport,
  isImporting = false,
}: PresetManagerProps) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [showImport, setShowImport] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setOpen(false), open);

  const activePreset = presets.find((p) => p.is_active);

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name);
    setNewName("");
    setShowCreate(false);
  };

  return (
    <div data-testid="preset-manager" ref={containerRef} className="relative inline-flex">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen((prev) => !prev)}
      >
        {activePreset ? activePreset.name : "Presets"}
      </Button>

      {open && (
        <div
          className={cn(
            "absolute top-full right-0 mt-1 z-50 w-72",
            "bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)]",
            "rounded-[var(--radius-md)] shadow-[var(--shadow-md)]",
            "p-2 overflow-auto max-h-80",
            "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
          )}
        >
          {/* Preset list */}
          {presets.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--color-text-muted)]">
              No presets yet.
            </p>
          ) : (
            <div className="flex flex-col gap-0.5 mb-2">
              {presets.map((preset) => (
                <PresetListItem
                  key={preset.id}
                  preset={preset}
                  onActivate={onActivate}
                  onDelete={onDelete}
                  onShare={onShare}
                />
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-[var(--color-border-default)] my-2" />

          {/* Create new preset */}
          {showCreate ? (
            <div className="flex items-end gap-2 px-1">
              <div className="flex-1">
                <Input
                  placeholder="Preset name..."
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </div>
              <Button variant="primary" size="sm" onClick={handleCreate}>
                Save
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2 w-full text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] rounded-[var(--radius-sm)]"
                onClick={() => setShowCreate(true)}
              >
                <Plus size={14} aria-hidden="true" />
                Create Preset
              </button>
              <button
                type="button"
                className="flex items-center gap-2 px-3 py-2 w-full text-left text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-tertiary)] rounded-[var(--radius-sm)]"
                onClick={() => setShowImport(true)}
              >
                Import Shared Preset
              </button>
            </div>
          )}
        </div>
      )}

      <PresetImportDialog
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={(token) => {
          onImport(token);
          setShowImport(false);
        }}
        isImporting={isImporting}
      />
    </div>
  );
}
