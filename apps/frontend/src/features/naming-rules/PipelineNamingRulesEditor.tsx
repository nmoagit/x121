/**
 * Pipeline-scoped naming rules editor (PRD-139).
 *
 * When viewed within a pipeline workspace, shows that pipeline's naming_rules
 * JSONB config (video_template, prefix_rules, transition_suffix) with inline
 * editing that saves via the pipeline update API.
 */

import { useCallback, useEffect, useState } from "react";

import { Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { TERMINAL_PANEL, TERMINAL_BODY, TERMINAL_LABEL } from "@/lib/ui-classes";
import { Save, Plus, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { toastStore } from "@/components/composite/useToast";
import { useUpdatePipeline } from "@/features/pipelines/hooks/use-pipelines";
import type { Pipeline } from "@/features/pipelines/types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PipelineNamingRules {
  video_template: string;
  prefix_rules: Record<string, string>;
  transition_suffix: string;
}

const DEFAULT_RULES: PipelineNamingRules = {
  video_template: "{avatar}_{scene}_{track}",
  prefix_rules: {},
  transition_suffix: "_transition",
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface PipelineNamingRulesEditorProps {
  pipeline: Pipeline;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PipelineNamingRulesEditor({ pipeline }: PipelineNamingRulesEditorProps) {
  const updatePipeline = useUpdatePipeline();

  // Parse naming_rules from pipeline JSONB, falling back to defaults.
  const [rules, setRules] = useState<PipelineNamingRules>(() => {
    const raw = pipeline.naming_rules;
    return {
      video_template:
        (raw as Record<string, unknown>)?.video_template as string ?? DEFAULT_RULES.video_template,
      prefix_rules:
        (raw as Record<string, unknown>)?.prefix_rules as Record<string, string> ?? DEFAULT_RULES.prefix_rules,
      transition_suffix:
        (raw as Record<string, unknown>)?.transition_suffix as string ?? DEFAULT_RULES.transition_suffix,
    };
  });

  // Track new prefix rule being added.
  const [newPrefixField, setNewPrefixField] = useState("");
  const [newPrefixValue, setNewPrefixValue] = useState("");

  // Reset when pipeline changes.
  useEffect(() => {
    const raw = pipeline.naming_rules;
    setRules({
      video_template:
        (raw as Record<string, unknown>)?.video_template as string ?? DEFAULT_RULES.video_template,
      prefix_rules:
        (raw as Record<string, unknown>)?.prefix_rules as Record<string, string> ?? DEFAULT_RULES.prefix_rules,
      transition_suffix:
        (raw as Record<string, unknown>)?.transition_suffix as string ?? DEFAULT_RULES.transition_suffix,
    });
  }, [pipeline.id, pipeline.naming_rules]);

  const handleSave = useCallback(() => {
    updatePipeline.mutate(
      { id: pipeline.id, data: { naming_rules: rules as unknown as Record<string, unknown> } },
      {
        onSuccess: () => {
          toastStore.addToast({ message: "Naming rules saved", variant: "success" });
        },
        onError: () => {
          toastStore.addToast({ message: "Failed to save naming rules", variant: "error" });
        },
      },
    );
  }, [pipeline.id, rules, updatePipeline]);

  const addPrefixRule = useCallback(() => {
    if (!newPrefixField.trim()) return;
    setRules((prev) => ({
      ...prev,
      prefix_rules: { ...prev.prefix_rules, [newPrefixField.trim()]: newPrefixValue.trim() },
    }));
    setNewPrefixField("");
    setNewPrefixValue("");
  }, [newPrefixField, newPrefixValue]);

  const removePrefixRule = useCallback((field: string) => {
    setRules((prev) => {
      const next = { ...prev.prefix_rules };
      delete next[field];
      return { ...prev, prefix_rules: next };
    });
  }, []);

  const prefixEntries = Object.entries(rules.prefix_rules);

  return (
    <Stack gap={6}>
      {/* Video template */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_BODY}>
          <Stack gap={4}>
            <Input
              label="Video Filename Template"
              value={rules.video_template}
              onChange={(e) => setRules((prev) => ({ ...prev, video_template: e.target.value }))}
              placeholder="{avatar}_{scene}_{track}"
            />
            <p className="text-xs text-[var(--color-text-muted)] font-mono">
              Available tokens: {"{avatar}"}, {"{scene}"}, {"{track}"}, {"{project}"}, {"{scene_type}"}
            </p>
          </Stack>
        </div>
      </div>

      {/* Transition suffix */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_BODY}>
          <Input
            label="Transition Suffix"
            value={rules.transition_suffix}
            onChange={(e) => setRules((prev) => ({ ...prev, transition_suffix: e.target.value }))}
            placeholder="_transition"
          />
        </div>
      </div>

      {/* Prefix rules */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_BODY}>
          <Stack gap={3}>
            <span className={TERMINAL_LABEL}>Prefix Rules</span>

            {prefixEntries.length > 0 ? (
              <div className="space-y-2">
                {prefixEntries.map(([field, prefix]) => (
                  <div key={field} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-[var(--color-text-secondary)] min-w-[120px]">
                      {field}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">{"\u2192"}</span>
                    <span className="font-mono text-xs text-[var(--color-text-primary)]">{prefix}</span>
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<Trash2 size={iconSizes.sm} />}
                      onClick={() => removePrefixRule(field)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)] font-mono">
                No prefix rules configured.
              </p>
            )}

            {/* Add new prefix rule */}
            <div className="flex items-end gap-2">
              <Input
                label="Field"
                value={newPrefixField}
                onChange={(e) => setNewPrefixField(e.target.value)}
                placeholder="e.g. scene"
              />
              <Input
                label="Prefix"
                value={newPrefixValue}
                onChange={(e) => setNewPrefixValue(e.target.value)}
                placeholder="e.g. SC"
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<Plus size={iconSizes.sm} />}
                onClick={addPrefixRule}
                disabled={!newPrefixField.trim()}
              >
                Add
              </Button>
            </div>
          </Stack>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <Button
          variant="primary"
          icon={<Save size={iconSizes.sm} />}
          onClick={handleSave}
          loading={updatePipeline.isPending}
        >
          Save Naming Rules
        </Button>
      </div>
    </Stack>
  );
}
