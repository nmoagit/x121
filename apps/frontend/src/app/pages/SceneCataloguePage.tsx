/**
 * Scene catalogue management page (PRD-111).
 *
 * Provides a tabbed interface for managing scene types (with workflow
 * assignment), scene catalogue entries, and track definitions.
 */

import { useCallback, useState } from "react";

import { ConfirmDeleteModal, ConfigToolbar, Modal, Tabs } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { cn } from "@/lib/cn";
import {
  GHOST_DANGER_BTN,
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_PANEL,
  TERMINAL_ROW_HOVER,
  TERMINAL_STATUS_COLORS,
} from "@/lib/ui-classes";
import { Plus, Trash2 } from "@/tokens/icons";

import { useExportSceneCatalogue, useConfigImport } from "@/features/config-io";
import { SceneTypePromptDefaultsPanel } from "@/features/prompt-management";
import { SceneCatalogueList } from "@/features/scene-catalogue/SceneCatalogueList";
import { TrackManager } from "@/features/scene-catalogue/TrackManager";
import { TrackWorkflowManager } from "@/features/scene-catalogue/TrackWorkflowManager";
import {
  SceneTypeEditor,
  useSceneTypes,
  useCreateSceneType,
  useUpdateSceneType,
  useDeleteSceneType,
} from "@/features/scene-types";
import type { CreateSceneType, SceneType } from "@/features/scene-types";
import { ImageCatalogueList } from "@/features/image-catalogue/ImageCatalogueList";
import { VideoSettingsDefaultsTab } from "@/features/video-settings/VideoSettingsDefaultsTab";
import { usePipelineContextSafe } from "@/features/pipelines";



/* --------------------------------------------------------------------------
   Tab options
   -------------------------------------------------------------------------- */

type TabKey = "scene-types" | "workflows" | "catalogue" | "image-types" | "tracks" | "prompt-defaults" | "video-settings";

const TABS: { id: TabKey; label: string }[] = [
  { id: "image-types", label: "Image Types" },
  { id: "scene-types", label: "Scene Types" },
  { id: "catalogue", label: "Catalogue" },
  { id: "tracks", label: "Tracks" },
  { id: "workflows", label: "Workflows" },
  { id: "prompt-defaults", label: "Prompt Defaults" },
  { id: "video-settings", label: "Video Settings" },
];

/* --------------------------------------------------------------------------
   Scene Types tab
   -------------------------------------------------------------------------- */

function SceneTypesTab({ onSwitchTab }: { onSwitchTab?: (tab: string) => void }) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: sceneTypes, isLoading } = useSceneTypes(undefined, pipelineCtx?.pipelineId);
  const createMutation = useCreateSceneType();
  const deleteMutation = useDeleteSceneType();

  const [editing, setEditing] = useState<SceneType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SceneType | null>(null);

  const handleCreateSave = useCallback(
    (data: CreateSceneType) => {
      createMutation.mutate(data, {
        onSuccess: () => setCreating(false),
      });
    },
    [createMutation],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => setDeleting(null),
    });
  }, [deleting, deleteMutation]);

  if (isLoading) return <LoadingPane />;

  if (!sceneTypes?.length && !creating) {
    return (
      <>
        <EmptyState
          title="No Scene Types"
          description="Create your first scene type to define workflow configurations for video generation."
          action={
            <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
              Create Scene Type
            </Button>
          }
        />
        {creating && (
          <SceneTypeEditorModal onSave={handleCreateSave} onClose={() => setCreating(false)} />
        )}
      </>
    );
  }

  return (
    <Stack gap={4}>
      <div className={TERMINAL_PANEL}>
        <div className={cn(TERMINAL_HEADER, "flex items-center justify-between")}>
          <span className={TERMINAL_HEADER_TITLE}>Scene Types</span>
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            New
          </Button>
        </div>
        <div className={TERMINAL_BODY}>
          {(sceneTypes ?? []).map((st) => (
            <div
              key={st.id}
              role="button"
              tabIndex={0}
              className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER, "flex items-center justify-between px-3 py-2 cursor-pointer")}
              onClick={() => setEditing(st)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setEditing(st); }}
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="font-mono text-xs text-cyan-400 w-[160px] truncate shrink-0">
                  {st.name}
                </span>
                {st.description && (
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)] truncate">
                    {st.description}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={cn("font-mono text-[10px]", TERMINAL_STATUS_COLORS[st.is_active ? "active" : "pending"])}>
                  {st.is_active ? "active" : "off"}
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className={GHOST_DANGER_BTN}
                  icon={<Trash2 size={12} />}
                  onClick={(e) => { e.stopPropagation(); setDeleting(st); }}
                  aria-label="Delete"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create modal */}
      {creating && (
        <SceneTypeEditorModal onSave={handleCreateSave} onClose={() => setCreating(false)} />
      )}

      {/* Edit modal */}
      {editing && (
        <EditSceneTypeModal sceneType={editing} onClose={() => setEditing(null)} onSwitchTab={onSwitchTab} />
      )}

      <ConfirmDeleteModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete Scene Type"
        entityName={deleting?.name ?? ""}
        warningText="All scenes using this type will need to be reconfigured."
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Scene Type editor modals — wrap SceneTypeEditor in a Modal
   -------------------------------------------------------------------------- */

function SceneTypeEditorModal({
  onSave,
  onClose,
}: {
  onSave: (data: CreateSceneType) => void;
  onClose: () => void;
}) {
  return (
    <Modal open onClose={onClose} title="New Scene Type" size="lg">
      <SceneTypeEditor onSave={onSave} onCancel={onClose} />
    </Modal>
  );
}

function EditSceneTypeModal({
  sceneType,
  onClose,
  onSwitchTab,
}: {
  sceneType: SceneType;
  onClose: () => void;
  onSwitchTab?: (tab: string) => void;
}) {
  const updateMutation = useUpdateSceneType(sceneType.id);

  const handleSave = (data: CreateSceneType) => {
    updateMutation.mutate(data, { onSuccess: onClose });
  };

  const handleSwitchTab = onSwitchTab ? (tab: string) => {
    onClose();
    onSwitchTab(tab);
  } : undefined;

  return (
    <Modal open onClose={onClose} title={`Edit: ${sceneType.name}`} size="lg">
      <SceneTypeEditor sceneType={sceneType} onSave={handleSave} onCancel={onClose} onSwitchTab={handleSwitchTab} />
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Main page
   -------------------------------------------------------------------------- */

export function SceneCataloguePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("scene-types");
  const { exporting, exportConfig } = useExportSceneCatalogue();
  const { importing, importFile } = useConfigImport();

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div className="flex items-start justify-between">
          <PageHeader
            title="Catalogue"
            description="Manage scene types, image types, catalogue entries, and track definitions."
          />
          <ConfigToolbar
            onExport={exportConfig}
            onImport={(file) => importFile(file)}
            exporting={exporting}
            importing={importing}
          />
        </div>

        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={(k) => setActiveTab(k as TabKey)} variant="pill" />

        {activeTab === "scene-types" && <SceneTypesTab onSwitchTab={(t) => setActiveTab(t as TabKey)} />}
        {activeTab === "workflows" && <TrackWorkflowManager />}
        {activeTab === "catalogue" && <SceneCatalogueList />}
        {activeTab === "image-types" && <ImageCatalogueList onSwitchTab={(t) => setActiveTab(t as TabKey)} />}
        {activeTab === "tracks" && <TrackManager />}
        {activeTab === "video-settings" && <VideoSettingsDefaultsTab />}
        {activeTab === "prompt-defaults" && <SceneTypePromptDefaultsPanel />}
      </Stack>
    </div>
  );
}
