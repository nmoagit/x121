/**
 * Rule editor with template input, token chips, and live preview (PRD-116).
 * Renders the form content only; embed inside a <Modal> for chrome.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/composite/useToast";
import { Button } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { TERMINAL_TEXTAREA, TERMINAL_LABEL } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import { Check, Save } from "@/tokens/icons";

import {
  useCreateNamingRule,
  useNamingPreview,
  useUpdateNamingRule,
} from "../hooks/use-naming-rules";
import type { NamingCategory, NamingRule } from "../types";
import { TemplatePreview } from "./TemplatePreview";
import { TokenList } from "./TokenList";
import { TYPO_DATA_SUCCESS } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 500;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface RuleEditorProps {
  category: NamingCategory;
  rule: NamingRule | null;
  onClose: () => void;
}

export function RuleEditor({ category, rule, onClose }: RuleEditorProps) {
  const { addToast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [template, setTemplate] = useState(rule?.template ?? "");
  const [debouncedTemplate, setDebouncedTemplate] = useState(template);

  const { data: preview, isFetching: previewLoading } = useNamingPreview(
    category.name,
    debouncedTemplate,
  );

  const updateMutation = useUpdateNamingRule();
  const createMutation = useCreateNamingRule();
  const isSaving = updateMutation.isPending || createMutation.isPending;
  const isDirty = template !== (rule?.template ?? "");

  /* Debounce preview requests */
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedTemplate(template), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [template]);

  /* Insert token at cursor position */
  const handleTokenClick = useCallback((tokenName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const insertion = `{${tokenName}}`;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    setTemplate((prev) => prev.slice(0, start) + insertion + prev.slice(end));

    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + insertion.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  }, []);

  /* Save handler */
  const handleSave = useCallback(() => {
    if (!template.trim()) return;

    const callbacks = {
      onSuccess: () => {
        addToast({
          message: rule ? "Rule saved successfully." : "Rule created successfully.",
          variant: "success",
        });
        onClose();
      },
      onError: () => {
        addToast({
          message: rule ? "Failed to save rule." : "Failed to create rule.",
          variant: "error",
        });
      },
    };

    if (rule) {
      updateMutation.mutate({ id: rule.id, data: { template } }, callbacks);
    } else {
      createMutation.mutate({ category_id: category.id, template }, callbacks);
    }
  }, [template, rule, category.id, updateMutation, createMutation, addToast, onClose]);

  /* Reset to original */
  const handleReset = useCallback(() => {
    setTemplate(rule?.template ?? "");
  }, [rule?.template]);

  return (
    <Stack gap={4}>
      {/* Template textarea */}
      <div className="flex flex-col gap-1.5">
        <span className={TERMINAL_LABEL}>Template pattern</span>
        <textarea
          ref={textareaRef}
          id={`template-${category.id}`}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={2}
          className={cn(TERMINAL_TEXTAREA, "resize-none")}
          placeholder="e.g. {project}_{scene}_{version}.mp4"
        />
      </div>

      {/* Token chips */}
      <TokenList categoryId={category.id} onTokenClick={handleTokenClick} />

      {/* Live preview */}
      <TemplatePreview preview={preview} isLoading={previewLoading} />

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        {isDirty && (
          <Button variant="ghost" size="sm" onClick={handleReset}>
            Reset
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={isSaving ? undefined : <Save size={16} />}
          onClick={handleSave}
          loading={isSaving}
          disabled={!isDirty || !template.trim()}
        >
          {rule ? "Save" : "Create"}
        </Button>
      </div>

      {/* Save confirmation indicator */}
      {(updateMutation.isSuccess || createMutation.isSuccess) && (
        <div className={`${TYPO_DATA_SUCCESS} flex items-center gap-1.5`}>
          <Check size={14} aria-hidden />
          Saved
        </div>
      )}
    </Stack>
  );
}
