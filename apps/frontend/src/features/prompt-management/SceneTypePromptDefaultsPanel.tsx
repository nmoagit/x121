/**
 * Scene-type-level prompt defaults panel for the Scene Catalogue page.
 *
 * Shows all scene types that have assigned workflows, with collapsible
 * sections per workflow containing editable prompt slots. Saves to
 * scene-type prompt defaults (the "top level" of the prompt hierarchy).
 */

import { useCallback, useMemo, useState } from "react";

import { CollapsibleSection } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, LoadingPane } from "@/components/primitives";
import { Workflow as WorkflowIcon } from "@/tokens/icons";

import { useImageTypes, useUpdateImageType } from "@/features/image-catalogue/hooks/use-image-catalogue";
import type { ImageType } from "@/features/image-catalogue/types";
import { useSceneTypes } from "@/features/scene-types";
import type { SceneType } from "@/features/scene-types";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useWorkflows } from "@/features/workflow-import";
import type { Workflow } from "@/features/workflow-import";
import { useTrackConfigs, type SceneTypeTrackConfig } from "@/features/scene-catalogue";
import { cn } from "@/lib/cn";
import { TERMINAL_LABEL, TERMINAL_TEXTAREA } from "@/lib/ui-classes";
import { ChevronDown, ChevronRight } from "@/tokens/icons";

import {
  useWorkflowPromptSlots,
  useSceneTypePromptDefaults,
  useUpsertPromptDefault,
} from "./hooks/use-prompt-management";
import type { WorkflowPromptSlot } from "./types";
import { TYPO_DATA } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function SceneTypePromptDefaultsPanel() {
  const pipelineCtx = usePipelineContextSafe();
  const { data: sceneTypes, isLoading: loadingST } = useSceneTypes(undefined, pipelineCtx?.pipelineId);
  const { data: imageTypes, isLoading: loadingIT } = useImageTypes(pipelineCtx?.pipelineId);
  const { data: workflows, isLoading: loadingWF } = useWorkflows(undefined, pipelineCtx?.pipelineId);
  const [imageCollapsed, setImageCollapsed] = useState(false);
  const [sceneCollapsed, setSceneCollapsed] = useState(false);

  if (loadingST || loadingWF || loadingIT) return <LoadingPane />;

  const activeSceneTypes = (sceneTypes ?? []).filter((st) => st.is_active);
  const activeImageTypes = (imageTypes ?? []).filter((it) => it.is_active);

  if (!activeSceneTypes.length && !activeImageTypes.length) {
    return (
      <EmptyState
        title="No Active Types"
        description="Create and activate scene types or image types with workflows to configure prompt defaults."
        icon={<WorkflowIcon />}
      />
    );
  }

  return (
    <Stack gap={6}>
      {/* Image type prompts */}
      {activeImageTypes.length > 0 && (
        <div>
          <SectionHeader
            title="Image Types"
            count={activeImageTypes.length}
            collapsed={imageCollapsed}
            onToggle={() => setImageCollapsed((p) => !p)}
          />
          {!imageCollapsed && (
            <Stack gap={3}>
              {activeImageTypes.map((it) => (
                <ImageTypePromptSection key={it.id} imageType={it} />
              ))}
            </Stack>
          )}
        </div>
      )}

      {/* Scene type prompts */}
      {activeSceneTypes.length > 0 && (
        <div>
          <SectionHeader
            title="Scene Types"
            count={activeSceneTypes.length}
            collapsed={sceneCollapsed}
            onToggle={() => setSceneCollapsed((p) => !p)}
          />
          {!sceneCollapsed && (
            <Stack gap={4}>
              {activeSceneTypes.map((st) => (
                <SceneTypeSection key={st.id} sceneType={st} workflows={workflows ?? []} />
              ))}
            </Stack>
          )}
        </div>
      )}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Collapsible section header (shared)
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
      className="flex items-center gap-2 py-1.5 mb-2 w-full text-left group"
      onClick={onToggle}
    >
      <Icon size={14} className="text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" />
      <span className={`${TYPO_DATA} font-medium text-[var(--color-text-primary)] uppercase tracking-wide`}>{title}</span>
      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">({count})</span>
    </button>
  );
}

/* --------------------------------------------------------------------------
   Image type prompt section — editable prompt_template + negative
   -------------------------------------------------------------------------- */

function ImageTypePromptSection({ imageType }: { imageType: ImageType }) {
  const pipelineCtx = usePipelineContextSafe();
  const { data: tracks } = useTracks(false, pipelineCtx?.pipelineId);
  const updateMutation = useUpdateImageType(imageType.id);

  const [prompt, setPrompt] = useState(imageType.prompt_template ?? "");
  const [negPrompt, setNegPrompt] = useState(imageType.negative_prompt_template ?? "");

  const dirty =
    prompt !== (imageType.prompt_template ?? "") ||
    negPrompt !== (imageType.negative_prompt_template ?? "");

  const srcTrack = tracks?.find((t) => t.id === imageType.source_track_id);
  const outTrack = tracks?.find((t) => t.id === imageType.output_track_id);

  const handleSave = useCallback(() => {
    updateMutation.mutate({
      prompt_template: prompt.trim() || null,
      negative_prompt_template: negPrompt.trim() || null,
    });
  }, [updateMutation, prompt, negPrompt]);

  return (
    <CollapsibleSection
      card
      title={imageType.name}
      description={
        srcTrack && outTrack
          ? `${srcTrack.name} → ${outTrack.name}`
          : undefined
      }
      defaultOpen={false}
    >
      <Stack gap={3}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 border-l-2 border-l-green-500 pl-2">
            <label className={TERMINAL_LABEL}>Prompt Template</label>
            <textarea
              rows={3}
              className={TERMINAL_TEXTAREA}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Positive prompt for image generation"
            />
          </div>
          <div className="flex flex-col gap-1 border-l-2 border-l-red-500 pl-2">
            <label className={TERMINAL_LABEL}>Negative Prompt</label>
            <textarea
              rows={3}
              className={TERMINAL_TEXTAREA}
              value={negPrompt}
              onChange={(e) => setNegPrompt(e.target.value)}
              placeholder="Negative prompt"
            />
          </div>
        </div>
        {dirty && (
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} loading={updateMutation.isPending}>
              Save Defaults
            </Button>
          </div>
        )}
      </Stack>
    </CollapsibleSection>
  );
}

/* --------------------------------------------------------------------------
   Per-scene-type section — finds assigned workflows via track configs
   -------------------------------------------------------------------------- */

function SceneTypeSection({
  sceneType,
  workflows,
}: {
  sceneType: SceneType;
  workflows: Workflow[];
}) {
  const { data: configs } = useTrackConfigs(sceneType.id);

  // One section per scene_type × track config that has a workflow
  const configsWithWorkflow = useMemo(
    () => (configs ?? []).filter((c) => c.workflow_id != null),
    [configs],
  );

  if (!configsWithWorkflow.length) return null;

  return (
    <>
      {configsWithWorkflow.map((config) => {
        const workflow = workflows.find((w) => w.id === config.workflow_id);
        if (!workflow) return null;
        return (
          <WorkflowDefaultsSection
            key={`${sceneType.id}-${config.track_id}-${config.is_clothes_off}`}
            sceneType={sceneType}
            workflow={workflow}
            trackConfig={config}
          />
        );
      })}
    </>
  );
}

/* --------------------------------------------------------------------------
   Per-workflow collapsible section with editable prompt slot defaults
   -------------------------------------------------------------------------- */

function WorkflowDefaultsSection({
  sceneType,
  workflow,
  trackConfig,
}: {
  sceneType: SceneType;
  workflow: Workflow;
  trackConfig: SceneTypeTrackConfig;
}) {
  const { data: slots, isPending: slotsLoading } = useWorkflowPromptSlots(workflow.id);
  const { data: defaults } = useSceneTypePromptDefaults(sceneType.id);
  const upsertDefault = useUpsertPromptDefault();

  // Local draft state: slot_id → prompt text
  const [drafts, setDrafts] = useState<Map<number, string>>(new Map());
  const [initialized, setInitialized] = useState(false);

  // Initialize drafts from existing defaults + slot default_text
  const editableSlots = useMemo(
    () => (slots?.filter((s) => s.is_user_editable) ?? []).sort((a, b) => { const r = (s: typeof a) => (s.slot_type === "positive" ? 0 : 1); return r(a) - r(b) || a.sort_order - b.sort_order; }),
    [slots],
  );

  // Build defaults map once data arrives
  const defaultsMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const d of defaults ?? []) {
      map.set(d.prompt_slot_id, d.prompt_text);
    }
    return map;
  }, [defaults]);

  // Initialize draft state when data loads
  if (!initialized && editableSlots.length > 0 && defaults !== undefined) {
    const initial = new Map<number, string>();
    for (const slot of editableSlots) {
      initial.set(slot.id, defaultsMap.get(slot.id) ?? slot.default_text ?? "");
    }
    setDrafts(initial);
    setInitialized(true);
  }

  const handleChange = useCallback((slotId: number, text: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(slotId, text);
      return next;
    });
  }, []);

  const handleSave = useCallback(() => {
    for (const [slotId, text] of drafts) {
      upsertDefault.mutate({ sceneTypeId: sceneType.id, slotId, promptText: text });
    }
  }, [drafts, upsertDefault, sceneType.id]);

  const trackLabel = trackConfig.track_name ?? `Track ${trackConfig.track_id}`;
  const trackSuffix = trackConfig.is_clothes_off ? " (Clothes Off)" : "";

  return (
    <CollapsibleSection
      card
      title={`${sceneType.name} — ${trackLabel}${trackSuffix}`}
      description={`Workflow: ${workflow.name}`}
      defaultOpen={false}
    >
      {slotsLoading && <LoadingPane />}

      {!slotsLoading && editableSlots.length === 0 && (
        <p className="text-xs text-[var(--color-text-muted)] py-2">
          No editable prompt slots for this workflow.
        </p>
      )}

      {!slotsLoading && editableSlots.length > 0 && (
        <Stack gap={3}>
          <div className="flex flex-col gap-3">
            {editableSlots.map((slot) => (
              <SlotDefaultEditor
                key={slot.id}
                slot={slot}
                value={drafts.get(slot.id) ?? slot.default_text ?? ""}
                onChange={(text) => handleChange(slot.id, text)}
              />
            ))}
          </div>

          <div className="flex justify-end">
            <Button size="sm" onClick={handleSave} loading={upsertDefault.isPending}>
              Save Defaults
            </Button>
          </div>
        </Stack>
      )}
    </CollapsibleSection>
  );
}

/* --------------------------------------------------------------------------
   Single slot default editor — shows label + textarea
   -------------------------------------------------------------------------- */

function SlotDefaultEditor({
  slot,
  value,
  onChange,
}: {
  slot: WorkflowPromptSlot;
  value: string;
  onChange: (text: string) => void;
}) {
  const isPositive = slot.slot_type === "positive";
  return (
    <div className={cn(
      "flex flex-col gap-1 border-l-2 pl-2",
      isPositive ? "border-l-green-500" : "border-l-red-500",
    )}>
      <label className={TERMINAL_LABEL}>{slot.slot_label} <span className="opacity-50">{slot.node_id}</span></label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={TERMINAL_TEXTAREA}
        placeholder={`${isPositive ? "Positive" : "Negative"} prompt...`}
      />
    </div>
  );
}
