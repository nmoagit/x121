/**
 * Displays the generation_snapshot of a scene video version in a structured,
 * readable format. Shows prompts prominently, metadata inline, and generation
 * parameters / LoRA config in a collapsible section.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";

import { ChevronDown, ChevronRight } from "@/tokens/icons";
import { TYPO_INPUT_LABEL } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

/** Keys rendered specially (not in the generic metadata row). */
const STRUCTURED_KEYS = new Set(["prompts", "generation_params", "lora_config", "backfilled", "workflow"]);

/** Human-readable labels for snapshot metadata keys. */
const META_LABELS: Record<string, string> = {
  scene_type: "Scene Type",
  clip_position: "Clip Position",
  seed_image: "Seed Image",
  segment_index: "Segment",
  comfyui_instance_id: "ComfyUI Instance",
  generated_at: "Generated At",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface GenerationSnapshotPanelProps {
  snapshot: Record<string, unknown>;
}

export function GenerationSnapshotPanel({ snapshot }: GenerationSnapshotPanelProps) {
  const [showParams, setShowParams] = useState(false);

  const prompts = snapshot.prompts as Record<string, string> | undefined;
  const generationParams = snapshot.generation_params as Record<string, unknown> | undefined;
  const loraConfig = snapshot.lora_config as Record<string, unknown> | null | undefined;
  const workflowName = snapshot.workflow as string | undefined;

  // Metadata entries (scene_type, clip_position, etc.)
  const metaEntries = Object.entries(snapshot).filter(
    ([k]) => !STRUCTURED_KEYS.has(k),
  );

  const hasGenerationParams = generationParams && Object.keys(generationParams).length > 0;
  const hasLora = loraConfig != null && Object.keys(loraConfig).length > 0;

  return (
    <div className="flex flex-col gap-[var(--spacing-3)]">
      {/* Prompts — most important, always visible */}
      {prompts && Object.keys(prompts).length > 0 && (
        <div className="flex flex-col gap-[var(--spacing-2)]">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Prompts
          </h4>
          {Object.entries(prompts).map(([slot, text]) => (
            <div key={slot} className="flex flex-col gap-0.5">
              <span className={TYPO_INPUT_LABEL}>
                {slot}
              </span>
              <p className="rounded bg-[var(--color-surface-tertiary)] px-[var(--spacing-2)] py-[var(--spacing-1)] text-xs text-[var(--color-text-primary)] whitespace-pre-wrap break-words font-mono leading-relaxed">
                {text}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Workflow link + metadata row */}
      {(workflowName || metaEntries.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {workflowName && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-[var(--color-text-muted)]">Workflow:</span>
              <Link
                to="/tools/workflows"
                search={{ name: workflowName }}
                className="text-[var(--color-action-primary)] hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {workflowName}
              </Link>
            </div>
          )}
          {metaEntries.map(([key, value]) => {
            const label = META_LABELS[key] ?? key;
            let display = typeof value === "object" ? JSON.stringify(value) : String(value ?? "—");
            // Shorten seed image path to just the filename
            if (key === "seed_image" && typeof value === "string") {
              display = value.split("/").pop() ?? value;
            }
            // Format clip_position for readability
            if (key === "clip_position" && typeof value === "string") {
              display = value.replace(/_/g, " ");
            }
            return (
              <div key={key} className="flex items-center gap-1 text-xs">
                <span className="text-[var(--color-text-muted)]">{label}:</span>
                <span className="text-[var(--color-text-primary)]">{display}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Generation params + LoRA — collapsible */}
      {(hasGenerationParams || hasLora) && (
        <div>
          <button
            type="button"
            onClick={() => setShowParams((v) => !v)}
            className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {showParams ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {hasLora ? "Generation Parameters & LoRA" : "Generation Parameters"}
          </button>
          {showParams && (
            <div className="mt-[var(--spacing-1)] rounded bg-[var(--color-surface-tertiary)] px-[var(--spacing-2)] py-[var(--spacing-1)]">
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs font-mono">
                {hasGenerationParams &&
                  Object.entries(generationParams!).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-[var(--color-text-secondary)]">{k}</dt>
                      <dd className="text-[var(--color-text-primary)] break-all">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </dd>
                    </div>
                  ))}
                {hasLora &&
                  Object.entries(loraConfig!).map(([k, v]) => (
                    <div key={`lora-${k}`} className="contents">
                      <dt className="text-[var(--color-text-secondary)]">lora.{k}</dt>
                      <dd className="text-[var(--color-text-primary)] break-all">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
