/**
 * Pipeline-scoped naming rules editor (PRD-139, PRD-141).
 *
 * Shows naming engine categories with hierarchy:
 * - Platform defaults (read-only reference)
 * - Pipeline overrides (editable)
 * - Template mapping section (category -> template string)
 */

import { useCallback, useEffect, useState } from "react";

import { Button, Input } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { TERMINAL_PANEL, TERMINAL_BODY, TERMINAL_HEADER, TERMINAL_HEADER_TITLE } from "@/lib/ui-classes";
import { Save, Plus, Trash2, RotateCcw } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { toastStore } from "@/components/composite/useToast";
import { useUpdatePipeline } from "@/features/pipelines/hooks/use-pipelines";
import type { Pipeline } from "@/features/pipelines/types";

import { CategoryTemplatesSection } from "./components/CategoryTemplatesSection";
import { useNamingCategories, useNamingRules } from "./hooks/use-naming-rules";
import { TYPO_DATA, TYPO_DATA_MUTED } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PipelineNamingRules {
  video_template: string;
  prefix_rules: Record<string, string>;
  transition_suffix: string;
  category_templates: Record<string, string>;
}

const DEFAULT_RULES: PipelineNamingRules = {
  video_template: "{avatar}_{scene}_{track}",
  prefix_rules: {},
  transition_suffix: "_transition",
  category_templates: {},
};

function parseRules(raw: Record<string, unknown>): PipelineNamingRules {
  return {
    video_template: (raw?.video_template as string) ?? DEFAULT_RULES.video_template,
    prefix_rules: (raw?.prefix_rules as Record<string, string>) ?? DEFAULT_RULES.prefix_rules,
    transition_suffix: (raw?.transition_suffix as string) ?? DEFAULT_RULES.transition_suffix,
    category_templates: (raw?.category_templates as Record<string, string>) ?? DEFAULT_RULES.category_templates,
  };
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface PipelineNamingRulesEditorProps {
  pipeline: Pipeline;
}

export function PipelineNamingRulesEditor({ pipeline }: PipelineNamingRulesEditorProps) {
  const updatePipeline = useUpdatePipeline();
  const { data: categories } = useNamingCategories();
  const { data: platformRules } = useNamingRules();

  const [rules, setRules] = useState<PipelineNamingRules>(() =>
    parseRules(pipeline.naming_rules as Record<string, unknown>),
  );
  const [newPrefixField, setNewPrefixField] = useState("");
  const [newPrefixValue, setNewPrefixValue] = useState("");

  useEffect(() => {
    setRules(parseRules(pipeline.naming_rules as Record<string, unknown>));
  }, [pipeline.id, pipeline.naming_rules]);

  const handleSave = useCallback(() => {
    updatePipeline.mutate(
      { id: pipeline.id, data: { naming_rules: rules as unknown as Record<string, unknown> } },
      {
        onSuccess: () => toastStore.addToast({ message: "Naming rules saved", variant: "success" }),
        onError: () => toastStore.addToast({ message: "Failed to save naming rules", variant: "error" }),
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

  const setCategoryTemplate = useCallback((name: string, template: string) => {
    setRules((prev) => ({
      ...prev,
      category_templates: { ...prev.category_templates, [name]: template },
    }));
  }, []);

  const removeCategoryTemplate = useCallback((name: string) => {
    setRules((prev) => {
      const next = { ...prev.category_templates };
      delete next[name];
      return { ...prev, category_templates: next };
    });
  }, []);

  const savedRules = parseRules(pipeline.naming_rules as Record<string, unknown>);
  const isDirty = JSON.stringify(rules) !== JSON.stringify(savedRules);

  const handleCancel = useCallback(() => {
    setRules(parseRules(pipeline.naming_rules as Record<string, unknown>));
    setNewPrefixField("");
    setNewPrefixValue("");
  }, [pipeline.naming_rules]);

  const prefixEntries = Object.entries(rules.prefix_rules);

  return (
    <Stack gap={6}>
      {/* Category templates with platform defaults */}
      <CategoryTemplatesSection
        categories={categories}
        platformRules={platformRules}
        categoryTemplates={rules.category_templates}
        onSetTemplate={setCategoryTemplate}
        onRemoveTemplate={removeCategoryTemplate}
      />

      {/* Video template */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_HEADER}>
          <h3 className={TERMINAL_HEADER_TITLE}>Video Filename Template</h3>
        </div>
        <div className={TERMINAL_BODY}>
          <Stack gap={4}>
            <Input
              label="Template"
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
        <div className={TERMINAL_HEADER}>
          <h3 className={TERMINAL_HEADER_TITLE}>Transition Suffix</h3>
        </div>
        <div className={TERMINAL_BODY}>
          <Input
            value={rules.transition_suffix}
            onChange={(e) => setRules((prev) => ({ ...prev, transition_suffix: e.target.value }))}
            placeholder="_transition"
          />
        </div>
      </div>

      {/* Prefix rules */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_HEADER}>
          <h3 className={TERMINAL_HEADER_TITLE}>Prefix Rules</h3>
        </div>
        <div className={TERMINAL_BODY}>
          <Stack gap={3}>
            {prefixEntries.length > 0 ? (
              <div className="space-y-2">
                {prefixEntries.map(([field, prefix]) => (
                  <div key={field} className="flex items-center gap-2">
                    <span className={`${TYPO_DATA_MUTED} min-w-[120px]`}>
                      {field}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">{"\u2192"}</span>
                    <span className={TYPO_DATA}>{prefix}</span>
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

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {isDirty && (
          <Button
            variant="ghost"
            icon={<RotateCcw size={iconSizes.sm} />}
            onClick={handleCancel}
            disabled={updatePipeline.isPending}
          >
            Cancel
          </Button>
        )}
        <Button
          variant="primary"
          icon={<Save size={iconSizes.sm} />}
          onClick={handleSave}
          loading={updatePipeline.isPending}
          disabled={!isDirty}
        >
          Save Naming Rules
        </Button>
      </div>
    </Stack>
  );
}
