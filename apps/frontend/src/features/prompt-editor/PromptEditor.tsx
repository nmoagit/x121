/**
 * Prompt editor component (PRD-63).
 *
 * Provides twin textareas for positive/negative prompts with placeholder
 * highlighting, character count, estimated CLIP token count, change notes,
 * and a save button that triggers prompt version creation.
 */

import { useCallback, useMemo, useState } from "react";

import { MAX_PROMPT_LENGTH, MAX_NEGATIVE_PROMPT_LENGTH, PLACEHOLDER_REGEX } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Sync: mirrors `TOKEN_ESTIMATE_MULTIPLIER` in `core/src/prompt_editor.rs`. */
const TOKEN_ESTIMATE_MULTIPLIER = 1.3;

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface PromptEditorProps {
  /** Scene type ID to save versions against. */
  sceneTypeId: number;
  /** Initial positive prompt text. */
  initialPositive?: string;
  /** Initial negative prompt text. */
  initialNegative?: string;
  /** Known placeholder names to highlight. */
  placeholders?: string[];
  /** Whether the save mutation is currently in-flight. */
  isSaving?: boolean;
  /** Callback triggered when the user clicks Save. */
  onSave?: (data: {
    positive_prompt: string;
    negative_prompt: string | null;
    change_notes: string | null;
  }) => void;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Rough CLIP token estimate: words * 1.3 */
function estimateTokens(text: string): number {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return Math.ceil(wordCount * TOKEN_ESTIMATE_MULTIPLIER);
}

/** Find placeholder tokens in text and return segments for rendering. */
function highlightPlaceholders(text: string): Array<{ text: string; isPlaceholder: boolean }> {
  const segments: Array<{ text: string; isPlaceholder: boolean }> = [];
  let lastIndex = 0;
  // Reset regex state for global match.
  const regex = new RegExp(PLACEHOLDER_REGEX.source, "g");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), isPlaceholder: false });
    }
    segments.push({ text: match[0], isPlaceholder: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), isPlaceholder: false });
  }

  return segments;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function PromptEditor({
  sceneTypeId: _sceneTypeId,
  initialPositive = "",
  initialNegative = "",
  placeholders: _placeholders,
  isSaving = false,
  onSave,
}: PromptEditorProps) {
  const [positivePrompt, setPositivePrompt] = useState(initialPositive);
  const [negativePrompt, setNegativePrompt] = useState(initialNegative);
  const [changeNotes, setChangeNotes] = useState("");

  const positiveTokens = useMemo(() => estimateTokens(positivePrompt), [positivePrompt]);
  const negativeTokens = useMemo(() => estimateTokens(negativePrompt), [negativePrompt]);

  const positiveHighlighted = useMemo(
    () => highlightPlaceholders(positivePrompt),
    [positivePrompt],
  );

  const handleSave = useCallback(() => {
    if (!positivePrompt.trim()) return;
    onSave?.({
      positive_prompt: positivePrompt,
      negative_prompt: negativePrompt.trim() || null,
      change_notes: changeNotes.trim() || null,
    });
  }, [positivePrompt, negativePrompt, changeNotes, onSave]);

  return (
    <div data-testid="prompt-editor" className="space-y-4">
      {/* Positive prompt */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            Positive Prompt
          </label>
          <span
            data-testid="positive-char-count"
            className="text-xs text-[var(--color-text-muted)]"
          >
            {positivePrompt.length}/{MAX_PROMPT_LENGTH} chars | ~{positiveTokens} tokens
          </span>
        </div>
        <textarea
          data-testid="positive-prompt-input"
          value={positivePrompt}
          onChange={(e) => setPositivePrompt(e.target.value)}
          maxLength={MAX_PROMPT_LENGTH}
          rows={6}
          className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
          placeholder="Enter your positive prompt..."
        />

        {/* Placeholder preview */}
        {positiveHighlighted.some((s) => s.isPlaceholder) && (
          <div
            data-testid="placeholder-preview"
            className="rounded bg-[var(--color-surface-tertiary)] p-2 text-xs"
          >
            {positiveHighlighted.map((segment, i) =>
              segment.isPlaceholder ? (
                <span
                  key={i}
                  className="rounded bg-blue-100 px-1 py-0.5 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                >
                  {segment.text}
                </span>
              ) : (
                <span key={i}>{segment.text}</span>
              ),
            )}
          </div>
        )}
      </div>

      {/* Negative prompt */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-[var(--color-text-primary)]">
            Negative Prompt
          </label>
          <span
            data-testid="negative-char-count"
            className="text-xs text-[var(--color-text-muted)]"
          >
            {negativePrompt.length}/{MAX_NEGATIVE_PROMPT_LENGTH} chars | ~{negativeTokens} tokens
          </span>
        </div>
        <textarea
          data-testid="negative-prompt-input"
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          maxLength={MAX_NEGATIVE_PROMPT_LENGTH}
          rows={3}
          className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
          placeholder="Enter your negative prompt (optional)..."
        />
      </div>

      {/* Change notes */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-[var(--color-text-primary)]">
          Change Notes
        </label>
        <input
          data-testid="change-notes-input"
          type="text"
          value={changeNotes}
          onChange={(e) => setChangeNotes(e.target.value)}
          maxLength={1000}
          className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm"
          placeholder="Describe what changed (optional)..."
        />
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          data-testid="save-prompt-btn"
          type="button"
          disabled={isSaving || !positivePrompt.trim()}
          onClick={handleSave}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save Version"}
        </button>
      </div>
    </div>
  );
}
