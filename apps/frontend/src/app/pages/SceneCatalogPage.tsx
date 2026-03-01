/**
 * Scene catalog management page (PRD-111).
 *
 * Provides a tabbed interface for managing the scene catalog entries
 * and track definitions.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { TabBar } from "@/components/primitives";

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
        <PageHeader
          title="Scene Catalog"
          description="Manage the global scene catalog and track definitions."
        />

        <TabBar tabs={TABS} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />

        {/* Tab content */}
        {activeTab === "catalog" && <SceneCatalogList />}
        {activeTab === "tracks" && <TrackManager />}
      </Stack>
    </div>
  );
}
