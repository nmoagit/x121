/**
 * PresetSwitcher component (PRD-30).
 *
 * Dropdown for switching between saved layout presets.
 * Provides save, switch, and delete actions.
 */

import { api } from "@/lib/api";
import { Layout, Save, Trash2 } from "@/tokens/icons";
import { useCallback, useEffect, useState } from "react";
import type { PanelState } from "./types";
import { useLayoutStore } from "./useLayoutStore";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface LayoutSummary {
  id: number;
  layout_name: string;
  layout_json: PanelState[];
  is_default: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface PresetSwitcherProps {
  /** Callback after a layout is loaded. */
  onLayoutLoaded?: () => void;
}

export function PresetSwitcher({ onLayoutLoaded }: PresetSwitcherProps) {
  const [layouts, setLayouts] = useState<LayoutSummary[]>([]);
  const [open, setOpen] = useState(false);

  const activeMeta = useLayoutStore((s) => s.activeMeta);
  const panels = useLayoutStore((s) => s.panels);
  const setPanels = useLayoutStore((s) => s.setPanels);
  const markSaved = useLayoutStore((s) => s.markSaved);

  const fetchLayouts = useCallback(async () => {
    const data = await api.get<LayoutSummary[]>("/user/layouts");
    setLayouts(data);
  }, []);

  useEffect(() => {
    void fetchLayouts();
  }, [fetchLayouts]);

  const handleSwitch = useCallback(
    (layout: LayoutSummary) => {
      setPanels(layout.layout_json, {
        id: layout.id,
        name: layout.layout_name,
      });
      setOpen(false);
      onLayoutLoaded?.();
    },
    [setPanels, onLayoutLoaded],
  );

  const handleSave = useCallback(async () => {
    if (activeMeta.id) {
      await api.put(`/user/layouts/${activeMeta.id}`, {
        layout_json: panels,
      });
      markSaved(activeMeta.id, activeMeta.name);
    } else {
      const name = activeMeta.name || "My Layout";
      const created = await api.post<LayoutSummary>("/user/layouts", {
        layout_name: name,
        layout_json: panels,
        is_default: true,
      });
      markSaved(created.id, created.layout_name);
    }
    void fetchLayouts();
  }, [activeMeta, panels, markSaved, fetchLayouts]);

  const handleDelete = useCallback(
    async (layoutId: number, e: React.MouseEvent) => {
      e.stopPropagation();
      await api.delete(`/user/layouts/${layoutId}`);
      void fetchLayouts();
    },
    [fetchLayouts],
  );

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-1.5 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-1 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Switch layout preset"
      >
        <Layout size={16} />
        <span className="max-w-[120px] truncate">{activeMeta.name}</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 min-w-[200px] rounded border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-lg">
          {/* Save current */}
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
            onClick={() => {
              void handleSave();
              setOpen(false);
            }}
          >
            <Save size={14} />
            Save current layout
          </button>

          {/* Separator */}
          {layouts.length > 0 && (
            <div className="border-t border-[var(--color-border-default)]" />
          )}

          {/* Layout list */}
          {layouts.map((layout) => (
            <div
              key={layout.id}
              className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-[var(--color-surface-hover)] ${
                activeMeta.id === layout.id
                  ? "text-[var(--color-action-primary)]"
                  : "text-[var(--color-text-primary)]"
              }`}
            >
              <button
                type="button"
                className="flex-1 text-left"
                onClick={() => handleSwitch(layout)}
              >
                {layout.layout_name}
                {layout.is_default && (
                  <span className="ml-1 text-xs text-[var(--color-text-tertiary)]">
                    (default)
                  </span>
                )}
              </button>
              <button
                type="button"
                className="text-[var(--color-text-tertiary)] hover:text-[var(--color-status-error)]"
                onClick={(e) => void handleDelete(layout.id, e)}
                aria-label={`Delete ${layout.layout_name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
