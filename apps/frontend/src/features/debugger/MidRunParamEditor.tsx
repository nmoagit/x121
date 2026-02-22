/**
 * Mid-run parameter editor for paused jobs (PRD-34).
 *
 * Allows editing JSON parameters while a job is paused, with
 * visual indicators for modified parameters.
 */

import { useState } from "react";

import { cn } from "@/lib/cn";
import { Badge, Button } from "@/components/primitives";
import { Stack } from "@/components/layout";

import { DEBUGGER_CARD_CLASSES, DEBUGGER_TEXTAREA_BASE } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface MidRunParamEditorProps {
  /** Current modified parameters from debug state. */
  currentParams: Record<string, unknown>;
  /** Called when the user saves updated parameters. */
  onSave: (params: Record<string, unknown>) => void;
  /** Whether the save mutation is in progress. */
  isSaving: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function MidRunParamEditor({
  currentParams,
  onSave,
  isSaving,
}: MidRunParamEditorProps) {
  const [json, setJson] = useState(() =>
    JSON.stringify(currentParams, null, 2),
  );
  const [parseError, setParseError] = useState<string | null>(null);

  const modifiedKeys = Object.keys(currentParams);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(json);
      if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
        setParseError("Parameters must be a JSON object.");
        return;
      }
      setParseError(null);
      onSave(parsed);
    } catch {
      setParseError("Invalid JSON. Please check the format.");
    }
  };

  const handleReset = () => {
    setJson("{}");
    setParseError(null);
  };

  return (
    <div
      className={cn(...DEBUGGER_CARD_CLASSES)}
    >
      <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3">
        Mid-Run Parameters
      </h3>

      {/* Modified parameter badges */}
      {modifiedKeys.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {modifiedKeys.map((key) => (
            <Badge key={key} variant="info" size="sm">
              {key}
            </Badge>
          ))}
        </div>
      )}

      {/* JSON editor */}
      <label
        htmlFor="param-editor"
        className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1"
      >
        Parameters (JSON)
      </label>
      <textarea
        id="param-editor"
        className={cn(
          ...DEBUGGER_TEXTAREA_BASE,
          "h-32",
          "font-mono",
          "resize-y",
        )}
        value={json}
        onChange={(e) => {
          setJson(e.target.value);
          setParseError(null);
        }}
        placeholder='{ "steps": 30, "cfg_scale": 7.5 }'
      />

      {parseError && (
        <p className="text-xs text-[var(--color-status-error)] mt-1">
          {parseError}
        </p>
      )}

      {/* Actions */}
      <Stack direction="horizontal" gap={2} justify="end" className="mt-3">
        <Button variant="ghost" size="sm" onClick={handleReset}>
          Reset
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save Parameters"}
        </Button>
      </Stack>
    </div>
  );
}
