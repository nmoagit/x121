/**
 * Slide-up activity console drawer.
 *
 * Opens from the bottom of the app shell, above the status footer.
 * Uses the existing Zustand store `isOpen` / `togglePanel` state.
 * Drag handle allows resizing between 120px and 80vh.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Button, Tooltip } from "@/components/primitives";
import { Tabs } from "@/components/composite";
import { ChevronDown, Terminal } from "@/tokens/icons";
import { cn } from "@/lib/cn";
import { TERMINAL_HEADER_TITLE } from "@/lib/ui-classes";

import { ActivityConsolePanel } from "./ActivityConsolePanel";
import { GenerationLogTab } from "./components/GenerationLogTab";
import { HistoryTab } from "./components/HistoryTab";
import { InfraTab } from "./components/InfraTab";
import { useActivityConsoleStore } from "./stores/useActivityConsoleStore";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const CONSOLE_TABS = [
  { id: "generation", label: "Generation" },
  { id: "infra", label: "Infra" },
  { id: "live", label: "Live" },
  { id: "history", label: "History" },
];

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT_RATIO = 0.5; // 50vh — opens to half the viewport
const MAX_HEIGHT_RATIO = 0.8; // 80vh

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ActivityConsoleDrawer() {
  const isOpen = useActivityConsoleStore((s) => s.isOpen);
  const togglePanel = useActivityConsoleStore((s) => s.togglePanel);
  const activeTab = useActivityConsoleStore((s) => s.activeTab);
  const setActiveTab = useActivityConsoleStore((s) => s.setActiveTab);
  const [height, setHeight] = useState(() => Math.round(window.innerHeight * DEFAULT_HEIGHT_RATIO));
  const dragging = useRef(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const clampHeight = useCallback((h: number) => {
    const maxH = window.innerHeight * MAX_HEIGHT_RATIO;
    return Math.max(MIN_HEIGHT, Math.min(h, maxH));
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      dragging.current = true;
      startY.current = e.clientY;
      startHeight.current = height;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [height],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      // Dragging up → larger height (startY is below new Y)
      const delta = startY.current - e.clientY;
      setHeight(clampHeight(startHeight.current + delta));
    },
    [clampHeight],
  );

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  // Clamp on window resize
  useEffect(() => {
    const onResize = () => setHeight((h) => clampHeight(h));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [clampHeight]);

  return (
    <div
      className={cn(
        "shrink-0 border-t border-[var(--color-border-default)] bg-[var(--color-surface-primary)]",
        "transition-[height] duration-300 ease-in-out overflow-hidden",
        !isOpen && "!h-0 !border-t-0",
      )}
      style={{ height: isOpen ? height : 0 }}
    >
      <div className="flex h-full flex-col">
        {/* Drag handle */}
        <Tooltip content="Drag to resize">
          <div
            className="flex h-1.5 shrink-0 cursor-row-resize items-center justify-center hover:bg-[var(--color-surface-secondary)] active:bg-[var(--color-action-primary-hover)] w-full"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <div className="h-0.5 w-8 rounded-full bg-[var(--color-border-default)]" />
          </div>
        </Tooltip>

        {/* Drawer header */}
        <div className="flex h-7 items-center justify-between px-2 border-b border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] shrink-0">
          <button
            type="button"
            onClick={togglePanel}
            className="flex items-center gap-1 cursor-pointer hover:opacity-80 transition-opacity"
            aria-label="Close console"
          >
            <Terminal size={12} className="text-[var(--color-data-green)]" />
            <span className={TERMINAL_HEADER_TITLE}>
              Console
            </span>
          </button>
          <div className="flex items-center gap-1">
            <Tabs
              tabs={CONSOLE_TABS}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              variant="pill"
              size="sm"
            />
            <Button
              variant="ghost"
              size="xs"
              icon={<ChevronDown size={12} />}
              onClick={togglePanel}
              title="Close console"
            />
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === "generation" ? (
            <GenerationLogTab />
          ) : activeTab === "infra" ? (
            <InfraTab />
          ) : activeTab === "live" ? (
            <ActivityConsolePanel />
          ) : (
            <HistoryTab />
          )}
        </div>
      </div>
    </div>
  );
}
