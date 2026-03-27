/**
 * Modal form for creating/editing image types (PRD-154).
 *
 * Core fields (name, slug, description, source/output track, sort, active)
 * are editable. Workflow and prompts shown as read-only summary with links
 * to the relevant tabs — matching the scene type modal pattern.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite/Modal";
import { Stack } from "@/components/layout";
import { Button, Input, Select, Toggle } from "@/components/primitives";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useWorkflows } from "@/features/workflow-import/hooks/use-workflow-import";
import { generateSnakeSlug } from "@/lib/format";
import { TERMINAL_LABEL, TRACK_TEXT_COLORS } from "@/lib/ui-classes";
import { ArrowRight } from "@/tokens/icons";

import { useCreateImageType, useUpdateImageType } from "./hooks/use-image-catalogue";
import type { CreateImageType, ImageType } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImageCatalogueFormProps {
  entry?: ImageType;
  open: boolean;
  onClose: () => void;
  /** Navigate to a specific tab (e.g., "workflows", "prompt-defaults"). */
  onSwitchTab?: (tab: string) => void;
}

/* --------------------------------------------------------------------------
   Tab link button
   -------------------------------------------------------------------------- */

function TabLink({ label, tab, onSwitchTab }: { label: string; tab: string; onSwitchTab?: (tab: string) => void }) {
  if (!onSwitchTab) return <span className={TERMINAL_LABEL}>{label}</span>;
  return (
    <button
      type="button"
      className="font-mono text-[10px] font-medium text-cyan-400 uppercase tracking-wide hover:text-cyan-300 transition-colors cursor-pointer"
      onClick={() => onSwitchTab(tab)}
    >
      {label} →
    </button>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImageCatalogueForm({ entry, open, onClose, onSwitchTab }: ImageCatalogueFormProps) {
  const isEdit = entry !== undefined;
  const pipelineCtx = usePipelineContextSafe();
  const pipelineId = pipelineCtx?.pipelineId;

  const [name, setName] = useState(entry?.name ?? "");
  const [slug, setSlug] = useState(entry?.slug ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [sourceTrackId, setSourceTrackId] = useState<string>(
    entry?.source_track_id != null ? String(entry.source_track_id) : "",
  );
  const [outputTrackId, setOutputTrackId] = useState<string>(
    entry?.output_track_id != null ? String(entry.output_track_id) : "",
  );
  const [sortOrder, setSortOrder] = useState(entry?.sort_order?.toString() ?? "0");
  const [isActive, setIsActive] = useState(entry?.is_active ?? true);

  const { data: tracks } = useTracks(false, pipelineId);
  const { data: workflows } = useWorkflows(undefined, pipelineId);
  const createMutation = useCreateImageType();
  const updateMutation = useUpdateImageType(entry?.id ?? 0);

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isNameEmpty = name.trim() === "";

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!isEdit) setSlug(generateSnakeSlug(value));
    },
    [isEdit],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isNameEmpty || pipelineId == null) return;

      const shared = {
        description: description.trim() || null,
        source_track_id: sourceTrackId ? Number(sourceTrackId) : null,
        output_track_id: outputTrackId ? Number(outputTrackId) : null,
        sort_order: Number.parseInt(sortOrder, 10) || 0,
        is_active: isActive,
      };

      if (isEdit) {
        updateMutation.mutate(
          { name: name.trim(), ...shared },
          { onSuccess: () => onClose() },
        );
      } else {
        const data: CreateImageType = {
          name: name.trim(),
          slug: slug.trim(),
          pipeline_id: pipelineId,
          ...shared,
        };
        createMutation.mutate(data, { onSuccess: () => onClose() });
      }
    },
    [isEdit, isNameEmpty, pipelineId, name, slug, description, sourceTrackId, outputTrackId, sortOrder, isActive, createMutation, updateMutation, onClose],
  );

  const trackOptions = (tracks ?? []).map((t) => ({
    value: String(t.id),
    label: t.name,
  }));

  const handleSwitchTab = onSwitchTab ? (tab: string) => {
    onClose();
    onSwitchTab(tab);
  } : undefined;

  // Resolve names for summary
  const srcTrack = tracks?.find((t) => t.id === entry?.source_track_id);
  const outTrack = tracks?.find((t) => t.id === entry?.output_track_id);
  const wfName = entry?.workflow_id ? workflows?.find((w) => w.id === entry.workflow_id)?.name : null;

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit: ${entry?.name}` : "Add Image Type"} size="lg">
      <form onSubmit={handleSubmit}>
        <Stack gap={2}>
          {/* Row 1: Name, Slug, Sort, Active */}
          <div className="grid grid-cols-[1fr_1fr_64px_auto] gap-2 items-end">
            <Input label="Name" size="xs" value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Name" required />
            <Input label="Slug" size="xs" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto" disabled={isEdit} />
            <Input label="Sort" size="xs" type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            <div className="flex items-center h-[26px]">
              <Toggle checked={isActive} onChange={setIsActive} label="Active" size="sm" />
            </div>
          </div>

          {/* Row 2: Description */}
          <Input label="Description" size="xs" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />

          {/* Row 3: Source Track, Output Track */}
          <div className="grid grid-cols-2 gap-2">
            <Select label="Source Track" size="xs" options={[{ value: "", label: "None" }, ...trackOptions]} value={sourceTrackId} onChange={setSourceTrackId} />
            <Select label="Output Track" size="xs" options={[{ value: "", label: "None" }, ...trackOptions]} value={outputTrackId} onChange={setOutputTrackId} />
          </div>

          {/* Read-only config summary (edit mode only) */}
          {isEdit && entry && (
            <div className="rounded-[var(--radius-md)] bg-[#0d1117] border border-[var(--color-border-default)]/30 p-2.5 space-y-2.5">
              {/* Tracks */}
              <div className="space-y-1">
                <span className={TERMINAL_LABEL}>Track Flow</span>
                {srcTrack && outTrack ? (
                  <div className="flex items-center gap-1.5 font-mono text-[10px]">
                    <span className={TRACK_TEXT_COLORS[srcTrack.slug] ?? "text-[var(--color-text-muted)]"}>{srcTrack.name}</span>
                    <ArrowRight size={8} className="text-[var(--color-text-muted)]" />
                    <span className={TRACK_TEXT_COLORS[outTrack.slug] ?? "text-[var(--color-text-muted)]"}>{outTrack.name}</span>
                  </div>
                ) : (
                  <div className="font-mono text-[10px] text-orange-400">Tracks not configured</div>
                )}
              </div>

              {/* Workflow */}
              <div className="space-y-1">
                <TabLink label="Workflows" tab="workflows" onSwitchTab={handleSwitchTab} />
                {wfName ? (
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">{wfName}</div>
                ) : (
                  <div className="font-mono text-[10px] text-orange-400">No workflow assigned</div>
                )}
              </div>

              {/* Prompts */}
              <div className="space-y-1">
                <TabLink label="Prompt Defaults" tab="prompt-defaults" onSwitchTab={handleSwitchTab} />
                {entry.prompt_template || entry.negative_prompt_template ? (
                  <div className="space-y-1">
                    {entry.prompt_template && (
                      <div className="font-mono text-[10px] text-green-400/60 border-l-2 border-l-green-500/30 pl-1.5">
                        {entry.prompt_template.slice(0, 60)}{entry.prompt_template.length > 60 ? "…" : ""}
                      </div>
                    )}
                    {entry.negative_prompt_template && (
                      <div className="font-mono text-[10px] text-red-400/60 border-l-2 border-l-red-500/30 pl-1.5">
                        {entry.negative_prompt_template.slice(0, 60)}{entry.negative_prompt_template.length > 60 ? "…" : ""}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="font-mono text-[10px] text-[var(--color-text-muted)]">No prompts configured</div>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--color-border-default)]">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" disabled={isNameEmpty} loading={isPending}>{isEdit ? "Save" : "Create"}</Button>
          </div>
        </Stack>
      </form>
    </Modal>
  );
}
