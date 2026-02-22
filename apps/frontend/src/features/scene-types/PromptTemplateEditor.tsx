/**
 * Editor for multi-position prompt templates (PRD-23).
 *
 * Displays tabs for Full Clip / Start Clip / Continuation Clip,
 * each with positive and negative prompt text areas.
 */

import { useState } from "react";

import { Tabs } from "@/components/composite/Tabs";
import { Badge } from "@/components/primitives/Badge";

/** Shared textarea styling matching the design system input pattern. */
export const TEXTAREA_CLASSES =
  "w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface PromptTemplateValues {
  prompt_template: string;
  negative_prompt_template: string;
  prompt_start_clip: string;
  negative_prompt_start_clip: string;
  prompt_continuation_clip: string;
  negative_prompt_continuation_clip: string;
}

interface PromptTemplateEditorProps {
  prompts: PromptTemplateValues;
  onChange: (prompts: PromptTemplateValues) => void;
}

/* --------------------------------------------------------------------------
   Tab configuration
   -------------------------------------------------------------------------- */

const CLIP_TABS = [
  { id: "full_clip", label: "Full Clip" },
  { id: "start_clip", label: "Start Clip" },
  { id: "continuation_clip", label: "Continuation Clip" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PromptTemplateEditor({ prompts, onChange }: PromptTemplateEditorProps) {
  const [activeTab, setActiveTab] = useState("full_clip");

  const hasStartClip =
    prompts.prompt_start_clip.trim() !== "" || prompts.negative_prompt_start_clip.trim() !== "";
  const hasContinuationClip =
    prompts.prompt_continuation_clip.trim() !== "" ||
    prompts.negative_prompt_continuation_clip.trim() !== "";

  const tabs = CLIP_TABS.map((tab) => {
    const hasCustom =
      (tab.id === "start_clip" && hasStartClip) ||
      (tab.id === "continuation_clip" && hasContinuationClip);
    return {
      ...tab,
      icon: hasCustom ? (
        <Badge variant="info" size="sm">
          custom
        </Badge>
      ) : undefined,
    };
  });

  const getPositiveKey = (): keyof PromptTemplateValues => {
    switch (activeTab) {
      case "start_clip":
        return "prompt_start_clip";
      case "continuation_clip":
        return "prompt_continuation_clip";
      default:
        return "prompt_template";
    }
  };

  const getNegativeKey = (): keyof PromptTemplateValues => {
    switch (activeTab) {
      case "start_clip":
        return "negative_prompt_start_clip";
      case "continuation_clip":
        return "negative_prompt_continuation_clip";
      default:
        return "negative_prompt_template";
    }
  };

  const positiveKey = getPositiveKey();
  const negativeKey = getNegativeKey();
  const isOverride = activeTab !== "full_clip";

  const handleChange = (key: keyof PromptTemplateValues, value: string) => {
    onChange({ ...prompts, [key]: value });
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`positive-${activeTab}`}
            className="text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Positive Prompt
          </label>
          <textarea
            id={`positive-${activeTab}`}
            rows={4}
            className={TEXTAREA_CLASSES}
            value={prompts[positiveKey]}
            onChange={(e) => handleChange(positiveKey, e.target.value)}
            placeholder={
              isOverride
                ? "Leave empty to use Full Clip prompt as fallback"
                : "Enter positive prompt template. Use {character_name}, {hair_color}, etc."
            }
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={`negative-${activeTab}`}
            className="text-sm font-medium text-[var(--color-text-secondary)]"
          >
            Negative Prompt
          </label>
          <textarea
            id={`negative-${activeTab}`}
            rows={3}
            className={TEXTAREA_CLASSES}
            value={prompts[negativeKey]}
            onChange={(e) => handleChange(negativeKey, e.target.value)}
            placeholder={
              isOverride
                ? "Leave empty to use Full Clip negative prompt as fallback"
                : "Enter negative prompt template"
            }
          />
        </div>
      </div>
    </div>
  );
}
