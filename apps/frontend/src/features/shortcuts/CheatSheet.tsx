/**
 * Keyboard shortcut cheat sheet overlay (PRD-52).
 *
 * A semi-transparent modal listing all registered shortcuts grouped
 * by category. Triggered by the `?` key, dismissed with Escape.
 */

import { useCallback, useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { Keyboard } from "@/tokens/icons";

import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  groupBindingsByCategory,
  shortcutRegistry,
} from "./ShortcutRegistry";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CheatSheet() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  // Register the `?` key to open the cheat sheet via the registry.
  useEffect(() => {
    shortcutRegistry.register({
      id: "general.cheatSheet",
      key: "?",
      label: "Shortcut Cheat Sheet",
      category: "general",
      action: toggle,
    });

    return () => {
      shortcutRegistry.unregister("general.cheatSheet");
    };
  }, [toggle]);

  // Close on Escape (handled separately since Modal might not be used).
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  if (!open) return null;

  const allBindings = shortcutRegistry.getAllBindings();
  const customOverrides = shortcutRegistry.getCustomOverrides();

  // Group by category, excluding the cheat sheet shortcut itself.
  const grouped = groupBindingsByCategory(allBindings, new Set(["general.cheatSheet"]));

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-black/60 backdrop-blur-sm",
        "animate-[fadeIn_var(--duration-fast)_var(--ease-default)]",
      )}
      onClick={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
      role="dialog"
      aria-label="Keyboard Shortcuts"
    >
      <div
        className={cn(
          "w-full max-w-2xl max-h-[80vh] overflow-y-auto",
          "bg-[var(--color-surface-secondary)] rounded-[var(--radius-lg)]",
          "shadow-[var(--shadow-lg)] p-6",
          "animate-[scaleIn_var(--duration-fast)_var(--ease-default)]",
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={() => {}}
        role="presentation"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Keyboard size={20} className="text-[var(--color-text-muted)]" aria-hidden="true" />
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Keyboard Shortcuts
          </h2>
          <span className="ml-auto text-xs text-[var(--color-text-muted)]">
            Press{" "}
            <kbd className="px-1 py-0.5 bg-[var(--color-surface-tertiary)] rounded text-xs">
              Esc
            </kbd>{" "}
            to close
          </span>
        </div>

        {/* Shortcut grid by category */}
        <div className="space-y-5">
          {CATEGORY_ORDER.map((category) => {
            const items = grouped.get(category);
            if (!items || items.length === 0) return null;

            return (
              <div key={category}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  {CATEGORY_LABELS[category]}
                </h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {items.map((binding) => {
                    const resolved = shortcutRegistry.getResolvedBinding(binding.id);
                    const isCustom = binding.id in customOverrides;

                    return (
                      <div key={binding.id} className="flex items-center justify-between py-1">
                        <span className="text-sm text-[var(--color-text-primary)]">
                          {binding.label}
                        </span>
                        <kbd
                          className={cn(
                            "inline-flex items-center px-2 py-0.5 text-xs font-mono",
                            "rounded-[var(--radius-sm)] border",
                            isCustom
                              ? "bg-[var(--color-action-primary)]/10 border-[var(--color-action-primary)]/30 text-[var(--color-action-primary)]"
                              : "bg-[var(--color-surface-tertiary)] border-[var(--color-border-default)] text-[var(--color-text-secondary)]",
                          )}
                        >
                          {resolved}
                        </kbd>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
