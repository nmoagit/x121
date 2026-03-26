/**
 * Modal form for creating/editing image types (PRD-154).
 *
 * Includes name, slug (auto-generated on create, readonly on edit),
 * description, source/output track selectors, workflow selector,
 * prompt templates, track association checkboxes, and sort order.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite/Modal";
import { Stack } from "@/components/layout";
import { Button, Checkbox, Input, Select, Toggle } from "@/components/primitives";
import { usePipelineContextSafe } from "@/features/pipelines";
import { useTracks } from "@/features/scene-catalogue/hooks/use-tracks";
import { useWorkflows } from "@/features/workflow-import/hooks/use-workflow-import";
import { generateSnakeSlug } from "@/lib/format";
import { TERMINAL_TEXTAREA } from "@/lib/ui-classes";

import { useCreateImageType, useUpdateImageType } from "./hooks/use-image-catalogue";
import type { CreateImageType, ImageType } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ImageCatalogueFormProps {
  entry?: ImageType;
  open: boolean;
  onClose: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImageCatalogueForm({ entry, open, onClose }: ImageCatalogueFormProps) {
  const isEdit = entry !== undefined;
  const pipelineCtx = usePipelineContextSafe();
  const pipelineId = pipelineCtx?.pipelineId;

  const [name, setName] = useState(entry?.name ?? "");
  const [slug, setSlug] = useState(entry?.slug ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [workflowId, setWorkflowId] = useState<string>(
    entry?.workflow_id != null ? String(entry.workflow_id) : "",
  );
  const [sourceTrackId, setSourceTrackId] = useState<string>(
    entry?.source_track_id != null ? String(entry.source_track_id) : "",
  );
  const [outputTrackId, setOutputTrackId] = useState<string>(
    entry?.output_track_id != null ? String(entry.output_track_id) : "",
  );
  const [promptTemplate, setPromptTemplate] = useState(entry?.prompt_template ?? "");
  const [negativePromptTemplate, setNegativePromptTemplate] = useState(
    entry?.negative_prompt_template ?? "",
  );
  const [sortOrder, setSortOrder] = useState(entry?.sort_order?.toString() ?? "0");
  const [isActive, setIsActive] = useState(entry?.is_active ?? true);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(
    new Set(entry?.tracks.map((t) => t.id) ?? []),
  );

  const { data: tracks } = useTracks(false, pipelineId);
  const { data: workflows } = useWorkflows(undefined, pipelineId);
  const createMutation = useCreateImageType();
  const updateMutation = useUpdateImageType(entry?.id ?? 0);

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isNameEmpty = name.trim() === "";

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!isEdit) {
        setSlug(generateSnakeSlug(value));
      }
    },
    [isEdit],
  );

  const handleTrackToggle = useCallback((trackId: number, checked: boolean) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(trackId);
      else next.delete(trackId);
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isNameEmpty || pipelineId == null) return;

      const shared = {
        description: description.trim() || null,
        workflow_id: workflowId ? Number(workflowId) : null,
        source_track_id: sourceTrackId ? Number(sourceTrackId) : null,
        output_track_id: outputTrackId ? Number(outputTrackId) : null,
        prompt_template: promptTemplate.trim() || null,
        negative_prompt_template: negativePromptTemplate.trim() || null,
        sort_order: Number.parseInt(sortOrder, 10) || 0,
        is_active: isActive,
        track_ids: Array.from(selectedTrackIds),
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
    [
      isEdit, isNameEmpty, pipelineId, name, slug, description,
      workflowId, sourceTrackId, outputTrackId,
      promptTemplate, negativePromptTemplate, sortOrder,
      isActive, selectedTrackIds, createMutation, updateMutation, onClose,
    ],
  );

  const trackOptions = (tracks ?? []).map((t) => ({
    value: String(t.id),
    label: t.name,
  }));

  const workflowOptions = (workflows ?? []).map((w) => ({
    value: String(w.id),
    label: w.name,
  }));

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? "Edit Image Type" : "Add Image Type"} size="lg">
      <form onSubmit={handleSubmit}>
        <Stack gap={5}>
          <Input
            label="Name"
            size="sm"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Image type name"
            required
          />

          <Input
            label="Slug"
            size="sm"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="auto-generated"
            disabled={isEdit}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="image-type-description"
              className="font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide"
            >
              Description
            </label>
            <textarea
              id="image-type-description"
              rows={2}
              className={TERMINAL_TEXTAREA}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Source Track"
              options={[{ value: "", label: "None" }, ...trackOptions]}
              value={sourceTrackId}
              onChange={setSourceTrackId}
            />
            <Select
              label="Output Track"
              options={[{ value: "", label: "None" }, ...trackOptions]}
              value={outputTrackId}
              onChange={setOutputTrackId}
            />
          </div>

          <Select
            label="Workflow"
            options={[{ value: "", label: "None" }, ...workflowOptions]}
            value={workflowId}
            onChange={setWorkflowId}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="image-type-prompt"
              className="font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide"
            >
              Prompt Template
            </label>
            <textarea
              id="image-type-prompt"
              rows={3}
              className={TERMINAL_TEXTAREA}
              value={promptTemplate}
              onChange={(e) => setPromptTemplate(e.target.value)}
              placeholder="Prompt template for image generation"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="image-type-neg-prompt"
              className="font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide"
            >
              Negative Prompt Template
            </label>
            <textarea
              id="image-type-neg-prompt"
              rows={2}
              className={TERMINAL_TEXTAREA}
              value={negativePromptTemplate}
              onChange={(e) => setNegativePromptTemplate(e.target.value)}
              placeholder="Negative prompt template"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Sort Order"
              size="sm"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
            <div className="flex items-end pb-1">
              <Toggle checked={isActive} onChange={setIsActive} label="Active" />
            </div>
          </div>

          {/* Track association checkboxes */}
          {tracks && tracks.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="font-mono text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                Associated Tracks
              </span>
              <div className="flex flex-col gap-2">
                {tracks.map((track) => (
                  <Checkbox
                    key={track.id}
                    checked={selectedTrackIds.has(track.id)}
                    onChange={(checked) => handleTrackToggle(track.id, checked)}
                    label={track.name}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={isNameEmpty} loading={isPending}>
              {isEdit ? "Save Changes" : "Create Image Type"}
            </Button>
          </div>
        </Stack>
      </form>
    </Modal>
  );
}
