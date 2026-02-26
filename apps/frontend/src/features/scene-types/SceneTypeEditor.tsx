/**
 * Scene type editor form (PRD-23).
 *
 * Provides a form for creating or editing scene type configurations,
 * including basic info, prompt templates, duration settings, and variants.
 */

import { useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { Button } from "@/components/primitives/Button";
import { Input } from "@/components/primitives/Input";

import {
  PromptTemplateEditor,
  type PromptTemplateValues,
  TEXTAREA_CLASSES,
} from "./PromptTemplateEditor";
import type { CreateSceneType, SceneType } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SceneTypeEditorProps {
  sceneType?: SceneType;
  onSave: (data: CreateSceneType) => void;
  onCancel: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneTypeEditor({ sceneType, onSave, onCancel }: SceneTypeEditorProps) {
  const [name, setName] = useState(sceneType?.name ?? "");
  const [description, setDescription] = useState(sceneType?.description ?? "");
  const [targetDuration, setTargetDuration] = useState(
    sceneType?.target_duration_secs?.toString() ?? "",
  );
  const [segmentDuration, setSegmentDuration] = useState(
    sceneType?.segment_duration_secs?.toString() ?? "",
  );
  const [durationTolerance, setDurationTolerance] = useState(
    sceneType?.duration_tolerance_secs?.toString() ?? "2",
  );
  const [sortOrder, setSortOrder] = useState(sceneType?.sort_order?.toString() ?? "0");
  const [prompts, setPrompts] = useState<PromptTemplateValues>({
    prompt_template: sceneType?.prompt_template ?? "",
    negative_prompt_template: sceneType?.negative_prompt_template ?? "",
    prompt_start_clip: sceneType?.prompt_start_clip ?? "",
    negative_prompt_start_clip: sceneType?.negative_prompt_start_clip ?? "",
    prompt_continuation_clip: sceneType?.prompt_continuation_clip ?? "",
    negative_prompt_continuation_clip: sceneType?.negative_prompt_continuation_clip ?? "",
  });

  const isNameEmpty = name.trim() === "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isNameEmpty) return;

    const data: CreateSceneType = {
      name: name.trim(),
      description: description.trim() || null,
      target_duration_secs: targetDuration ? Number.parseInt(targetDuration, 10) : null,
      segment_duration_secs: segmentDuration ? Number.parseInt(segmentDuration, 10) : null,
      duration_tolerance_secs: durationTolerance ? Number.parseInt(durationTolerance, 10) : null,
      sort_order: sortOrder ? Number.parseInt(sortOrder, 10) : null,
      prompt_template: prompts.prompt_template || null,
      negative_prompt_template: prompts.negative_prompt_template || null,
      prompt_start_clip: prompts.prompt_start_clip || null,
      negative_prompt_start_clip: prompts.negative_prompt_start_clip || null,
      prompt_continuation_clip: prompts.prompt_continuation_clip || null,
      negative_prompt_continuation_clip: prompts.negative_prompt_continuation_clip || null,
    };

    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Basic Info</h3>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-4">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Scene type name"
              required
            />
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="description"
                className="text-sm font-medium text-[var(--color-text-secondary)]"
              >
                Description
              </label>
              <textarea
                id="description"
                rows={3}
                className={TEXTAREA_CLASSES}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Prompts */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Prompt Templates
          </h3>
        </CardHeader>
        <CardBody>
          <PromptTemplateEditor prompts={prompts} onChange={setPrompts} />
        </CardBody>
      </Card>

      {/* Duration */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Duration</h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Target (secs)"
              type="number"
              min={1}
              value={targetDuration}
              onChange={(e) => setTargetDuration(e.target.value)}
              placeholder="e.g. 30"
            />
            <Input
              label="Segment (secs)"
              type="number"
              min={1}
              value={segmentDuration}
              onChange={(e) => setSegmentDuration(e.target.value)}
              placeholder="e.g. 5"
            />
            <Input
              label="Tolerance (secs)"
              type="number"
              min={0}
              value={durationTolerance}
              onChange={(e) => setDurationTolerance(e.target.value)}
              placeholder="2"
            />
          </div>
        </CardBody>
      </Card>

      {/* Advanced */}
      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Advanced</h3>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Sort Order"
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={isNameEmpty}>
          {sceneType ? "Save Changes" : "Create Scene Type"}
        </Button>
      </div>
    </form>
  );
}
