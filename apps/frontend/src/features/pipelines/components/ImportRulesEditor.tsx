/**
 * Import rules editor for pipeline configuration (PRD-141).
 *
 * Edits seed_patterns, video_patterns, metadata_patterns, and case_sensitive
 * toggle. Saves via the pipeline update API.
 */

import React, { useCallback, useEffect, useState } from "react";

import { Button, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { TERMINAL_BODY, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_PANEL } from "@/lib/ui-classes";
import { Plus, Save } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { toastStore } from "@/components/composite/useToast";

import { useUpdatePipeline } from "../hooks/use-pipelines";
import type { ImportRules, MetadataImportPattern, Pipeline, SeedImportPattern, VideoImportPattern } from "../types";
import { MetadataPatternRow, SeedPatternRow, VideoPatternRow } from "./ImportPatternRows";

/* --------------------------------------------------------------------------
   Defaults
   -------------------------------------------------------------------------- */

const DEFAULT_IMPORT_RULES: ImportRules = {
  seed_patterns: [],
  video_patterns: [],
  metadata_patterns: [],
  case_sensitive: false,
};

/* --------------------------------------------------------------------------
   Hook: import rules state management
   -------------------------------------------------------------------------- */

function useImportRulesState(pipeline: Pipeline) {
  const [rules, setRules] = useState<ImportRules>(() =>
    pipeline.import_rules ?? { ...DEFAULT_IMPORT_RULES },
  );

  useEffect(() => {
    setRules(pipeline.import_rules ?? { ...DEFAULT_IMPORT_RULES });
  }, [pipeline.id, pipeline.import_rules]);

  const addSeedPattern = useCallback(() => {
    setRules((prev) => ({
      ...prev,
      seed_patterns: [...prev.seed_patterns, { slot: "", pattern: "", extensions: ["png", "jpg", "webp"] }],
    }));
  }, []);

  const updateSeedPattern = useCallback((index: number, updated: SeedImportPattern) => {
    setRules((prev) => ({
      ...prev,
      seed_patterns: prev.seed_patterns.map((p, i) => (i === index ? updated : p)),
    }));
  }, []);

  const removeSeedPattern = useCallback((index: number) => {
    setRules((prev) => ({ ...prev, seed_patterns: prev.seed_patterns.filter((_, i) => i !== index) }));
  }, []);

  const addVideoPattern = useCallback(() => {
    setRules((prev) => ({
      ...prev,
      video_patterns: [...prev.video_patterns, { pattern: "", extensions: ["mp4", "webm", "mov"] }],
    }));
  }, []);

  const updateVideoPattern = useCallback((index: number, updated: VideoImportPattern) => {
    setRules((prev) => ({
      ...prev,
      video_patterns: prev.video_patterns.map((p, i) => (i === index ? updated : p)),
    }));
  }, []);

  const removeVideoPattern = useCallback((index: number) => {
    setRules((prev) => ({ ...prev, video_patterns: prev.video_patterns.filter((_, i) => i !== index) }));
  }, []);

  const addMetadataPattern = useCallback(() => {
    setRules((prev) => ({
      ...prev,
      metadata_patterns: [...prev.metadata_patterns, { type: "", pattern: "" }],
    }));
  }, []);

  const updateMetadataPattern = useCallback((index: number, updated: MetadataImportPattern) => {
    setRules((prev) => ({
      ...prev,
      metadata_patterns: prev.metadata_patterns.map((p, i) => (i === index ? updated : p)),
    }));
  }, []);

  const removeMetadataPattern = useCallback((index: number) => {
    setRules((prev) => ({ ...prev, metadata_patterns: prev.metadata_patterns.filter((_, i) => i !== index) }));
  }, []);

  const setCaseSensitive = useCallback((checked: boolean) => {
    setRules((prev) => ({ ...prev, case_sensitive: checked }));
  }, []);

  return {
    rules,
    addSeedPattern, updateSeedPattern, removeSeedPattern,
    addVideoPattern, updateVideoPattern, removeVideoPattern,
    addMetadataPattern, updateMetadataPattern, removeMetadataPattern,
    setCaseSensitive,
  };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ImportRulesEditorProps {
  pipeline: Pipeline;
}

export function ImportRulesEditor({ pipeline }: ImportRulesEditorProps) {
  const updatePipeline = useUpdatePipeline();
  const state = useImportRulesState(pipeline);

  const handleSave = useCallback(() => {
    updatePipeline.mutate(
      { id: pipeline.id, data: { import_rules: state.rules } },
      {
        onSuccess: () => toastStore.addToast({ message: "Import rules saved", variant: "success" }),
        onError: () => toastStore.addToast({ message: "Failed to save import rules", variant: "error" }),
      },
    );
  }, [pipeline.id, state.rules, updatePipeline]);

  return (
    <Stack gap={4}>
      <PatternSection
        title="Seed Image Patterns"
        description="Match filenames to seed slots during import. Pattern is a regex matched against the filename."
        emptyText="No seed patterns defined. Files will be matched by slot name substring."
        addLabel="Add Seed Pattern"
        onAdd={state.addSeedPattern}
      >
        {state.rules.seed_patterns.map((p, i) => (
          <SeedPatternRow key={`seed-${i}`} pattern={p} onChange={(u) => state.updateSeedPattern(i, u)} onRemove={() => state.removeSeedPattern(i)} />
        ))}
      </PatternSection>

      <PatternSection
        title="Video Patterns"
        description="Match video files for import classification. Pattern is a regex matched against the filename."
        emptyText="No video patterns defined. Standard video extensions will be used."
        addLabel="Add Video Pattern"
        onAdd={state.addVideoPattern}
      >
        {state.rules.video_patterns.map((p, i) => (
          <VideoPatternRow key={`video-${i}`} pattern={p} onChange={(u) => state.updateVideoPattern(i, u)} onRemove={() => state.removeVideoPattern(i)} />
        ))}
      </PatternSection>

      <PatternSection
        title="Metadata Patterns"
        description="Match metadata files (JSON) by type during import. Pattern is a regex matched against the filename."
        emptyText="No metadata patterns defined. Files named bio.json or tov.json will be auto-detected."
        addLabel="Add Metadata Pattern"
        onAdd={state.addMetadataPattern}
      >
        {state.rules.metadata_patterns.map((p, i) => (
          <MetadataPatternRow key={`meta-${i}`} pattern={p} onChange={(u) => state.updateMetadataPattern(i, u)} onRemove={() => state.removeMetadataPattern(i)} />
        ))}
      </PatternSection>

      <div className="flex items-center justify-between">
        <Toggle
          checked={state.rules.case_sensitive}
          onChange={state.setCaseSensitive}
          label="Case Sensitive Matching"
          size="sm"
        />
        <Button
          variant="primary"
          icon={<Save size={iconSizes.sm} />}
          onClick={handleSave}
          loading={updatePipeline.isPending}
        >
          Save Import Rules
        </Button>
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Pattern section wrapper
   -------------------------------------------------------------------------- */

interface PatternSectionProps {
  title: string;
  description: string;
  emptyText: string;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}

function PatternSection({ title, description, emptyText, addLabel, onAdd, children }: PatternSectionProps) {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <h3 className={TERMINAL_HEADER_TITLE}>{title}</h3>
      </div>
      <div className={TERMINAL_BODY}>
        <Stack gap={3}>
          <p className="text-[10px] text-[var(--color-text-muted)] font-mono">{description}</p>
          {!hasChildren && (
            <p className="font-mono text-xs text-[var(--color-text-muted)]">{emptyText}</p>
          )}
          {children}
          <div>
            <Button size="xs" variant="secondary" icon={<Plus size={12} />} onClick={onAdd}>
              {addLabel}
            </Button>
          </div>
        </Stack>
      </div>
    </div>
  );
}
