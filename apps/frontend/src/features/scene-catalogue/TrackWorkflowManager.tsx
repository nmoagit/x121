/**
 * Workflow assignment manager for both scene types and image types.
 *
 * Scene section: table of (scene_type, track) workflow assignments.
 * Image section: table of image types with workflow dropdowns.
 * Both sections are collapsible.
 */

import { useState } from "react";

import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { LoadingPane, Toggle } from "@/components/primitives";
import {
  TERMINAL_HEADER_TITLE,
} from "@/lib/ui-classes";
import { ChevronDown, ChevronRight, Workflow } from "@/tokens/icons";

import { useImageTypes } from "@/features/image-catalogue/hooks/use-image-catalogue";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useWorkflows } from "@/features/workflow-import";

import { ImageWorkflowTable } from "./ImageWorkflowTable";
import { WorkflowAssignmentTable } from "./WorkflowAssignmentTable";
import { useSceneCatalogue } from "./hooks/use-scene-catalogue";


/* --------------------------------------------------------------------------
   Collapsible section header
   -------------------------------------------------------------------------- */

function SectionHeader({
  title,
  count,
  collapsed,
  onToggle,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Icon = collapsed ? ChevronRight : ChevronDown;
  return (
    <button
      type="button"
      className="flex items-center gap-2 py-1.5 w-full text-left group"
      onClick={onToggle}
    >
      <Icon size={14} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" />
      <span className="font-mono text-xs font-medium text-[var(--color-text-primary)] uppercase tracking-wide">{title}</span>
      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">({count})</span>
    </button>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function TrackWorkflowManager() {
  const pipelineCtx = usePipelineContextSafe();
  const { data: entries, isLoading: loadingEntries } = useSceneCatalogue(false, pipelineCtx?.pipelineId);
  const { data: imageTypes, isLoading: loadingImages } = useImageTypes(pipelineCtx?.pipelineId);
  const { data: workflows, isLoading: loadingWorkflows } = useWorkflows(undefined, pipelineCtx?.pipelineId);
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);
  const [showNotSet, setShowNotSet] = useState(true);
  const [imagesCollapsed, setImagesCollapsed] = useState(false);
  const [scenesCollapsed, setScenesCollapsed] = useState(false);

  if (loadingEntries || loadingWorkflows || loadingImages) return <LoadingPane />;

  const entriesWithTracks = (entries ?? []).filter((e) => e.tracks.length > 0);
  const activeImageTypes = (imageTypes ?? []).filter((it) => it.is_active);
  const filteredImageTypes = showNotSet
    ? activeImageTypes
    : activeImageTypes.filter((it) => it.workflow_id != null);

  if (!entriesWithTracks.length && !activeImageTypes.length) {
    return (
      <EmptyState
        title="No Workflow Assignments"
        description="Create scene types or image types first, then assign workflows here."
        icon={<Workflow />}
      />
    );
  }

  const workflowOptions = (workflows ?? []).map((w) => ({
    value: String(w.id),
    label: w.name,
  }));

  return (
    <Stack gap={4}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className={TERMINAL_HEADER_TITLE}>Workflow Assignments</h2>
          <p className="mt-1 font-mono text-xs text-[var(--color-text-muted)]">
            Assign workflows to image types and scene types.
          </p>
        </div>
        <Toggle
          checked={showNotSet}
          onChange={setShowNotSet}
          label="Show Not Set"
          size="sm"
        />
      </div>

      {/* Image Types section */}
      {activeImageTypes.length > 0 && (
        <div>
          <SectionHeader
            title="Image Types"
            count={filteredImageTypes.length}
            collapsed={imagesCollapsed}
            onToggle={() => setImagesCollapsed((p) => !p)}
          />
          {!imagesCollapsed && (
            <ImageWorkflowTable
              imageTypes={filteredImageTypes}
              workflowOptions={workflowOptions}
              tracks={tracks ?? []}
              editable
            />
          )}
        </div>
      )}

      {/* Scene Types section */}
      {entriesWithTracks.length > 0 && (
        <div>
          <SectionHeader
            title="Scene Types"
            count={entriesWithTracks.length}
            collapsed={scenesCollapsed}
            onToggle={() => setScenesCollapsed((p) => !p)}
          />
          {!scenesCollapsed && (
            <WorkflowAssignmentTable
              entries={entriesWithTracks}
              workflowOptions={workflowOptions}
              showNotSet={showNotSet}
            />
          )}
        </div>
      )}
    </Stack>
  );
}
