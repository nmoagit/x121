/**
 * Scene catalog management page (PRD-111).
 *
 * Provides a tabbed interface for managing the scene catalog entries
 * and track definitions.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";

import { SceneCatalogList } from "@/features/scene-catalog/SceneCatalogList";
import { TrackManager } from "@/features/scene-catalog/TrackManager";

/* --------------------------------------------------------------------------
   Tab options
   -------------------------------------------------------------------------- */

type TabKey = "catalog" | "tracks";

const TABS: { key: TabKey; label: string }[] = [
  { key: "catalog", label: "Scene Catalog" },
  { key: "tracks", label: "Tracks" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneCatalogPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("catalog");

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Scene Catalog
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Manage the global scene catalog and track definitions.
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-[var(--color-border-default)]">
          {TABS.map((tab) => (
            <Button
              key={tab.key}
              type="button"
              variant={activeTab === tab.key ? "primary" : "ghost"}
              size="sm"
              onClick={() => setActiveTab(tab.key)}
              className="rounded-b-none"
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "catalog" && <SceneCatalogList />}
        {activeTab === "tracks" && <TrackManager />}
      </Stack>
    </div>
  );
}
