/**
 * PanelDropZone component (PRD-30).
 *
 * Renders a drop zone overlay inside an empty panel where the user can
 * assign a view module via drag-and-drop. Falls back to a module picker
 * when drag-and-drop is not used.
 */

import { Columns } from "@/tokens/icons";
import { useState } from "react";
import { getAllViewModules, type ViewModuleRegistration } from "./viewModuleRegistry";

interface PanelDropZoneProps {
  /** Callback when a view module is selected or dropped. */
  onSelectModule: (moduleKey: string) => void;
}

export function PanelDropZone({ onSelectModule }: PanelDropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const modules = getAllViewModules();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const moduleKey = e.dataTransfer.getData("text/x-view-module");
    if (moduleKey) {
      onSelectModule(moduleKey);
    }
  };

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-3 rounded border-2 border-dashed p-4 transition-colors ${
        isDragOver
          ? "border-[var(--color-action-primary)] bg-[var(--color-action-primary-subtle)]"
          : "border-[var(--color-border-default)] bg-[var(--color-surface-primary)]"
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Columns size={24} className="text-[var(--color-text-tertiary)]" />
      <p className="text-sm text-[var(--color-text-secondary)]">
        Drop a view module here or select one below
      </p>

      {modules.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2">
          {modules.map((mod: ViewModuleRegistration) => (
            <button
              key={mod.key}
              type="button"
              className="rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-3 py-1.5 text-xs text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
              onClick={() => onSelectModule(mod.key)}
            >
              {mod.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
