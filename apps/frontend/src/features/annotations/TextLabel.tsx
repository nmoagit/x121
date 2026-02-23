/**
 * Click-to-place text annotation on a video frame (PRD-70).
 *
 * Shows an editable text input positioned at click coordinates,
 * with font size and color controls.
 */

import { useState } from "react";

import { Button } from "@/components/primitives/Button";

import type { DrawingObject } from "./types";
import { COLOR_PRESETS, MAX_TEXT_LENGTH } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface TextLabelProps {
  /** X position where the text was placed. */
  x: number;
  /** Y position where the text was placed. */
  y: number;
  /** Initial text content. */
  initialText?: string;
  /** Initial color. */
  initialColor?: string;
  /** Initial font size. */
  initialFontSize?: number;
  /** Called when the text annotation is confirmed. */
  onConfirm?: (annotation: DrawingObject) => void;
  /** Called when the text annotation is cancelled. */
  onCancel?: () => void;
}

const FONT_SIZES = [12, 14, 16, 20, 24, 32] as const;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TextLabel({
  x,
  y,
  initialText = "",
  initialColor = "#FF0000",
  initialFontSize = 16,
  onConfirm,
  onCancel,
}: TextLabelProps) {
  const [text, setText] = useState(initialText);
  const [color, setColor] = useState(initialColor);
  const [fontSize, setFontSize] = useState(initialFontSize);

  const handleConfirm = () => {
    if (!text.trim()) return;

    const annotation: DrawingObject = {
      tool: "text",
      data: {
        x,
        y,
        content: text.trim(),
        fontSize,
      },
      color,
      strokeWidth: 0,
    };

    onConfirm?.(annotation);
  };

  return (
    <div
      className="absolute z-10 flex flex-col gap-1 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] p-2 shadow-lg"
      style={{ left: x, top: y }}
      data-testid="text-label"
    >
      {/* Text input */}
      <textarea
        className="min-h-[60px] w-48 resize-none rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-2 py-1 text-sm"
        value={text}
        onChange={(e) =>
          setText(e.target.value.slice(0, MAX_TEXT_LENGTH))
        }
        placeholder="Enter text annotation..."
        maxLength={MAX_TEXT_LENGTH}
        data-testid="text-input"
        autoFocus
      />

      <div className="text-right text-xs text-[var(--color-text-muted)]">
        {text.length}/{MAX_TEXT_LENGTH}
      </div>

      {/* Font size selector */}
      <div className="flex items-center gap-1" data-testid="font-size-selector">
        <span className="text-xs text-[var(--color-text-muted)]">Size</span>
        <select
          className="rounded border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)] px-1 py-0.5 text-xs"
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          data-testid="font-size-select"
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}px
            </option>
          ))}
        </select>
      </div>

      {/* Color picker */}
      <div className="flex items-center gap-1" data-testid="text-color-picker">
        {COLOR_PRESETS.slice(0, 6).map((preset) => (
          <button
            key={preset}
            type="button"
            className={`h-4 w-4 rounded-full border-2 ${
              color === preset
                ? "border-[var(--color-action-primary)]"
                : "border-transparent"
            }`}
            style={{ backgroundColor: preset }}
            onClick={() => setColor(preset)}
            aria-label={`Color ${preset}`}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          onClick={handleConfirm}
          disabled={!text.trim()}
          data-testid="confirm-text-button"
        >
          Place
        </Button>
      </div>
    </div>
  );
}
