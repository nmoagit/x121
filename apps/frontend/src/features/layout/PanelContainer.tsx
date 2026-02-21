/**
 * PanelContainer component (PRD-30).
 *
 * Top-level container that manages and renders all panel instances.
 * Panels are positioned absolutely using CSS transforms for performance.
 * Supports panel creation, deletion, reordering, resize, and collapse.
 */

import { Suspense, useCallback } from "react";
import { PanelDropZone } from "./PanelDropZone";
import { PanelHeader } from "./PanelHeader";
import type { PanelState } from "./types";
import { usePanelResize, type ResizeDirection } from "./usePanelResize";
import { getViewModule } from "./viewModuleRegistry";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PanelContainerProps {
  /** The current panel layout. */
  layout: PanelState[];
  /** Callback when the layout changes (panel move, resize, collapse, etc.). */
  onLayoutChange: (layout: PanelState[]) => void;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

interface SinglePanelProps {
  panel: PanelState;
  onUpdate: (id: string, updates: Partial<PanelState>) => void;
  onRemove: (id: string) => void;
}

function SinglePanel({ panel, onUpdate, onRemove }: SinglePanelProps) {
  const viewModule = getViewModule(panel.viewModule);

  const handleResize = useCallback(
    (size: { width: number; height: number }) => {
      onUpdate(panel.id, { size });
    },
    [panel.id, onUpdate],
  );

  const { startResize } = usePanelResize({
    size: panel.size,
    onResize: handleResize,
  });

  const handleToggleCollapse = useCallback(() => {
    onUpdate(panel.id, { collapsed: !panel.collapsed });
  }, [panel.id, panel.collapsed, onUpdate]);

  const handleSelectModule = useCallback(
    (moduleKey: string) => {
      onUpdate(panel.id, { viewModule: moduleKey });
    },
    [panel.id, onUpdate],
  );

  const ViewComponent = viewModule?.component;
  const title = viewModule?.label ?? "Empty Panel";

  const collapsedHeight = 36; // Header height only

  return (
    <div
      data-panel-id={panel.id}
      className="absolute flex flex-col overflow-hidden rounded border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-sm"
      style={{
        left: panel.position.x,
        top: panel.position.y,
        width: panel.size.width,
        height: panel.collapsed ? collapsedHeight : panel.size.height,
      }}
    >
      <PanelHeader
        title={title}
        collapsed={panel.collapsed}
        onToggleCollapse={handleToggleCollapse}
      />

      {/* Panel body */}
      {!panel.collapsed && (
        <div className="relative flex-1 overflow-auto">
          {ViewComponent ? (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
                  Loading...
                </div>
              }
            >
              <ViewComponent {...(panel.viewProps ?? {})} />
            </Suspense>
          ) : (
            <PanelDropZone onSelectModule={handleSelectModule} />
          )}
        </div>
      )}

      {/* Resize handles (only when not collapsed) */}
      {!panel.collapsed && (
        <>
          {/* Right edge */}
          <div
            className="absolute top-0 right-0 h-full w-1 cursor-e-resize"
            onPointerDown={(e) => startResize(e, "e" as ResizeDirection)}
          />
          {/* Bottom edge */}
          <div
            className="absolute right-0 bottom-0 left-0 h-1 cursor-s-resize"
            onPointerDown={(e) => startResize(e, "s" as ResizeDirection)}
          />
          {/* Bottom-right corner */}
          <div
            className="absolute right-0 bottom-0 h-3 w-3 cursor-se-resize"
            onPointerDown={(e) => startResize(e, "se" as ResizeDirection)}
          />
        </>
      )}

      {/* Close button (visible on hover) */}
      <button
        type="button"
        className="absolute top-1 right-6 rounded p-0.5 text-[var(--color-text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)] group-hover:opacity-100"
        style={{ opacity: undefined }}
        onClick={() => onRemove(panel.id)}
        aria-label={`Close ${title}`}
      >
        &times;
      </button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function PanelContainer({ layout, onLayoutChange }: PanelContainerProps) {
  const handleUpdate = useCallback(
    (id: string, updates: Partial<PanelState>) => {
      const next = layout.map((p) => (p.id === id ? { ...p, ...updates } : p));
      onLayoutChange(next);
    },
    [layout, onLayoutChange],
  );

  const handleRemove = useCallback(
    (id: string) => {
      onLayoutChange(layout.filter((p) => p.id !== id));
    },
    [layout, onLayoutChange],
  );

  return (
    <div className="relative h-full w-full overflow-auto bg-[var(--color-surface-base)]">
      {layout.map((panel) => (
        <SinglePanel
          key={panel.id}
          panel={panel}
          onUpdate={handleUpdate}
          onRemove={handleRemove}
        />
      ))}

      {layout.length === 0 && (
        <div className="flex h-full items-center justify-center text-sm text-[var(--color-text-tertiary)]">
          No panels. Add a panel to get started.
        </div>
      )}
    </div>
  );
}
