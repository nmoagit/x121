/**
 * Scene catalogue management page (PRD-111).
 *
 * Provides a tabbed interface for managing scene types (with workflow
 * assignment), scene catalogue entries, and track definitions.
 */

import { useCallback, useState } from "react";

import { ConfirmDeleteModal, ConfigToolbar } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { PageHeader, Stack } from "@/components/layout";
import { Badge, Button, LoadingPane, SelectableRow, TabBar } from "@/components/primitives";
import { Edit3, Plus, Trash2 } from "@/tokens/icons";

import { useExportSceneCatalogue, useConfigImport } from "@/features/config-io";
import { SceneTypePromptDefaultsPanel } from "@/features/prompt-management";
import { SceneCatalogueList } from "@/features/scene-catalogue/SceneCatalogueList";
import { useTrackConfigs } from "@/features/scene-catalogue/hooks/use-track-configs";
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
import { VideoSettingsDefaultsTab } from "@/features/video-settings/VideoSettingsDefaultsTab";
import { useWorkflows } from "@/features/workflow-import";
import type { Workflow } from "@/features/workflow-import";

/* --------------------------------------------------------------------------
   Tab options
   -------------------------------------------------------------------------- */

type TabKey = "scene-types" | "workflows" | "catalogue" | "tracks" | "prompt-defaults" | "video-settings";

const TABS: { key: TabKey; label: string }[] = [
  { key: "scene-types", label: "Scene Types" },
  { key: "catalogue", label: "Scene Catalogue" },
  { key: "tracks", label: "Tracks" },
  { key: "workflows", label: "Workflows" },
  { key: "prompt-defaults", label: "Prompt Defaults" },
  { key: "video-settings", label: "Video Settings" },
];

/* --------------------------------------------------------------------------
   Scene Types tab
   -------------------------------------------------------------------------- */

function SceneTypesTab() {
  const { data: sceneTypes, isLoading } = useSceneTypes();
  const { data: workflows } = useWorkflows();
  const createMutation = useCreateSceneType();
  const deleteMutation = useDeleteSceneType();

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<SceneType | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<SceneType | null>(null);

  const selected = sceneTypes?.find((st) => st.id === selectedId) ?? null;

  const workflowName = (wfId: number | null) => {
    if (!wfId) return null;
    return workflows?.find((w) => w.id === wfId)?.name ?? `Workflow #${wfId}`;
  };

  const handleCreateSave = useCallback(
    (data: CreateSceneType) => {
      createMutation.mutate(data, {
        onSuccess: (newSt) => {
          setCreating(false);
          setSelectedId(newSt.id);
        },
      });
    },
    [createMutation],
  );

  const handleDeleteConfirm = useCallback(() => {
    if (!deleting) return;
    deleteMutation.mutate(deleting.id, {
      onSuccess: () => {
        if (selectedId === deleting.id) setSelectedId(null);
        setDeleting(null);
      },
    });
  }, [deleting, deleteMutation, selectedId]);

  if (creating) {
    return (
      <div className="max-w-2xl">
        <SceneTypeEditor
          onSave={handleCreateSave}
          onCancel={() => setCreating(false)}
        />
      </div>
    );
  }

  if (editing) {
    return (
      <div className="max-w-2xl">
        <EditSceneTypeForm
          sceneType={editing}
          onDone={() => setEditing(null)}
        />
      </div>
    );
  }

  if (isLoading) return <LoadingPane />;

  if (!sceneTypes?.length) {
    return (
      <EmptyState
        title="No Scene Types"
        description="Create your first scene type to define workflow configurations for video generation."
        action={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Create Scene Type
          </Button>
        }
      />
    );
  }

  return (
    <div className="flex gap-6">
      {/* List */}
      <div className="w-[340px] shrink-0">
        <Stack gap={2}>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={14} />}
            onClick={() => setCreating(true)}
          >
            New Scene Type
          </Button>

          {sceneTypes.map((st) => (
            <SelectableRow
              key={st.id}
              isSelected={st.id === selectedId}
              onSelect={() => setSelectedId(st.id)}
            >
              <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 w-full">
                <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                  {st.name}
                </span>
                <Badge variant={st.is_active ? "success" : "default"} size="sm">
                  {st.is_active ? "Active" : "Inactive"}
                </Badge>
                <span className="truncate text-xs text-[var(--color-text-muted)] max-w-[100px]">
                  {st.workflow_id ? workflowName(st.workflow_id) : ""}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Edit3 size={14} />}
                    onClick={(e) => { e.stopPropagation(); setEditing(st); }}
                    aria-label="Edit scene type"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 size={14} />}
                    onClick={(e) => { e.stopPropagation(); setDeleting(st); }}
                    aria-label="Delete scene type"
                  />
                </div>
              </div>
            </SelectableRow>
          ))}
        </Stack>
      </div>

      {/* Detail */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <SceneTypeDetail sceneType={selected} workflows={workflows ?? []} />
        ) : (
          <EmptyState
            title="Select a Scene Type"
            description="Choose a scene type from the list to view its configuration."
          />
        )}
      </div>

      <ConfirmDeleteModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete Scene Type"
        entityName={deleting?.name ?? ""}
        warningText="All scenes using this type will need to be reconfigured."
        onConfirm={handleDeleteConfirm}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Edit wrapper — calls useUpdateSceneType at the top level of a component
   -------------------------------------------------------------------------- */

function EditSceneTypeForm({
  sceneType,
  onDone,
}: {
  sceneType: SceneType;
  onDone: () => void;
}) {
  const updateMutation = useUpdateSceneType(sceneType.id);

  const handleSave = (data: CreateSceneType) => {
    updateMutation.mutate(data, { onSuccess: onDone });
  };

  return (
    <SceneTypeEditor
      sceneType={sceneType}
      onSave={handleSave}
      onCancel={onDone}
    />
  );
}

/* --------------------------------------------------------------------------
   Scene Type detail panel
   -------------------------------------------------------------------------- */

function SceneTypeDetail({
  sceneType,
  workflows,
}: {
  sceneType: SceneType;
  workflows: Workflow[];
}) {
  const { data: trackConfigs } = useTrackConfigs(sceneType.id);

  const wfName = (wfId: number | null) => {
    if (!wfId) return null;
    return workflows.find((w) => w.id === wfId)?.name ?? `Workflow #${wfId}`;
  };

  // Build per-track workflow list from track configs
  const trackWorkflows = (trackConfigs ?? [])
    .filter((c) => c.workflow_id != null)
    .map((c) => ({
      trackName: c.track_name ?? `Track #${c.track_id}`,
      isClothesOff: c.is_clothes_off,
      workflowName: wfName(c.workflow_id) ?? `Workflow #${c.workflow_id}`,
    }));

  return (
    <div className="rounded border border-[var(--color-border-default)] p-5 space-y-4">
      <div className="flex items-center gap-3">
        <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
          {sceneType.name}
        </h3>
        <Badge variant={sceneType.is_active ? "success" : "default"} size="sm">
          {sceneType.is_active ? "Active" : "Inactive"}
        </Badge>
      </div>

      {sceneType.description && (
        <p className="text-sm text-[var(--color-text-secondary)]">{sceneType.description}</p>
      )}

      <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
        <DetailRow label="Slug" value={sceneType.slug} />
        <DetailRow
          label="Default Workflow"
          value={
            wfName(sceneType.workflow_id)
              ?? (trackWorkflows.length > 0 ? "Per-track (see below)" : "None assigned")
          }
        />
        <DetailRow
          label="Target Duration"
          value={sceneType.target_duration_secs ? `${sceneType.target_duration_secs}s` : "Not set"}
        />
        <DetailRow
          label="Segment Duration"
          value={sceneType.segment_duration_secs ? `${sceneType.segment_duration_secs}s` : "Not set"}
        />
        <DetailRow
          label="Duration Tolerance"
          value={`${sceneType.duration_tolerance_secs}s`}
        />
        <DetailRow
          label="Frame Rate"
          value={sceneType.target_fps ? `${sceneType.target_fps} fps` : "Not set"}
        />
        <DetailRow
          label="Resolution"
          value={sceneType.target_resolution ?? "Not set"}
        />
        <DetailRow label="Sort Order" value={String(sceneType.sort_order)} />
        <DetailRow
          label="Generation Strategy"
          value={sceneType.generation_strategy}
        />
        <DetailRow
          label="Auto-Retry"
          value={
            sceneType.auto_retry_enabled
              ? `Enabled (max ${sceneType.auto_retry_max_attempts})`
              : "Disabled"
          }
        />
      </dl>

      {/* Per-track workflow assignments */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Track Workflows</h4>
        <div className="rounded bg-[var(--color-surface-secondary)] p-3 space-y-1.5">
          {trackWorkflows.length > 0 ? (
            trackWorkflows.map((tw, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="font-medium text-[var(--color-text-primary)]">{tw.trackName}</span>
                {tw.isClothesOff && (
                  <Badge variant="warning" size="sm">Clothes Off</Badge>
                )}
                <span className="text-[var(--color-text-muted)]">&rarr;</span>
                <span className="text-[var(--color-text-secondary)]">{tw.workflowName}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">
              No per-track workflows assigned. Use the Workflows tab to assign workflows to tracks.
            </p>
          )}
        </div>
      </div>

      {/* Prompt templates */}
      {sceneType.prompt_template && (
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Prompt Template</h4>
          <pre className="rounded bg-[var(--color-surface-secondary)] p-3 text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-[200px] overflow-auto">
            {sceneType.prompt_template}
          </pre>
        </div>
      )}

      {sceneType.negative_prompt_template && (
        <div className="space-y-1">
          <h4 className="text-sm font-medium text-[var(--color-text-primary)]">Negative Prompt</h4>
          <pre className="rounded bg-[var(--color-surface-secondary)] p-3 text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap max-h-[150px] overflow-auto">
            {sceneType.negative_prompt_template}
          </pre>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[var(--color-text-tertiary)]">{label}</dt>
      <dd className="text-[var(--color-text-primary)] font-medium">{value}</dd>
    </div>
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
            title="Scene Catalogue"
            description="Manage scene types, catalogue entries, and track definitions."
          />
          <ConfigToolbar
            onExport={exportConfig}
            onImport={(file) => importFile(file)}
            exporting={exporting}
            importing={importing}
          />
        </div>

        <TabBar tabs={TABS} activeTab={activeTab} onChange={(k) => setActiveTab(k as TabKey)} />

        {activeTab === "scene-types" && <SceneTypesTab />}
        {activeTab === "workflows" && <TrackWorkflowManager />}
        {activeTab === "catalogue" && <SceneCatalogueList />}
        {activeTab === "tracks" && <TrackManager />}
        {activeTab === "video-settings" && <VideoSettingsDefaultsTab />}
        {activeTab === "prompt-defaults" && <SceneTypePromptDefaultsPanel />}
      </Stack>
    </div>
  );
}
