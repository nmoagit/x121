/**
 * Admin platform settings page (PRD-110).
 *
 * Displays settings grouped by category with tabbed navigation.
 * Supports inline editing, reset-to-default, and connection testing.
 */

import { useMemo, useState } from "react";

import { Tabs } from "@/components/composite/Tabs";
import { Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { AlertCircle, Settings } from "@/tokens/icons";

import { RestartBanner } from "./components/RestartBanner";
import { SettingRow } from "./components/SettingRow";
import { useSettings } from "./hooks/use-settings";
import { SETTING_CATEGORIES } from "./types";

/* --------------------------------------------------------------------------
   Tab definitions (derived from constants)
   -------------------------------------------------------------------------- */

const CATEGORY_TABS = SETTING_CATEGORIES.map((c) => ({
  id: c.id,
  label: c.label,
}));

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SettingsPanel() {
  const { data, isLoading, error } = useSettings();
  const [activeCategory, setActiveCategory] = useState<string>(SETTING_CATEGORIES[0].id);

  /** Settings filtered to the active category tab. */
  const filteredSettings = useMemo(() => {
    if (!data?.settings) return [];
    return data.settings.filter((s) => s.category === activeCategory);
  }, [data?.settings, activeCategory]);

  return (
    <Stack gap={6}>
      {/* Page header */}
      <div>
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Settings size={24} className="text-[var(--color-text-muted)]" aria-hidden />
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Platform Settings
          </h1>
        </div>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Configure storage, ComfyUI, authentication, and system-level settings.
        </p>
      </div>

      {/* Restart warning banner */}
      {data?.pending_restart && (
        <RestartBanner pendingKeys={data.pending_restart_keys} />
      )}

      {/* Category tabs */}
      <Tabs
        tabs={CATEGORY_TABS}
        activeTab={activeCategory}
        onTabChange={setActiveCategory}
      />

      {/* Content area */}
      {isLoading ? (
        <div className="flex items-center justify-center py-[var(--spacing-8)]">
          <Spinner size="lg" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
          <AlertCircle
            size={24}
            className="text-[var(--color-action-danger)]"
            aria-hidden
          />
          <p className="text-sm text-[var(--color-text-muted)]">
            Failed to load settings.
          </p>
        </div>
      ) : filteredSettings.length > 0 ? (
        <div className="grid grid-cols-1 gap-[var(--spacing-4)] lg:grid-cols-2">
          {filteredSettings.map((s) => (
            <SettingRow key={s.key} setting={s} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-[var(--spacing-3)] py-[var(--spacing-8)]">
          <Settings
            size={32}
            className="text-[var(--color-text-muted)]"
            aria-hidden
          />
          <p className="text-sm text-[var(--color-text-muted)]">
            No settings in this category.
          </p>
        </div>
      )}
    </Stack>
  );
}
