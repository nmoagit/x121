/**
 * Live preview display for a naming template (PRD-116).
 */

import { ContextLoader } from "@/components/primitives";
import { AlertTriangle } from "@/tokens/icons";
import { TERMINAL_LABEL } from "@/lib/ui-classes";

import type { PreviewResult } from "../types";
import { TYPO_DATA_WARNING } from "@/lib/typography-tokens";

interface TemplatePreviewProps {
  preview: PreviewResult | undefined;
  isLoading: boolean;
}

export function TemplatePreview({ preview, isLoading }: TemplatePreviewProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={TERMINAL_LABEL}>Preview</span>
      <div className="px-3 py-2 text-xs font-mono bg-[var(--color-surface-secondary)] rounded-[var(--radius-md)] min-h-[2rem] flex items-center">
        {isLoading ? (
          <ContextLoader size={32} />
        ) : preview ? (
          <span className="text-[var(--color-data-cyan)]">{preview.filename}</span>
        ) : (
          <span className="text-[var(--color-text-muted)]">
            Enter a template to see a preview
          </span>
        )}
      </div>
      {preview?.validation?.warnings && preview.validation.warnings.length > 0 && (
        <div className="flex items-start gap-1.5 mt-1">
          <AlertTriangle
            size={14}
            className="text-[var(--color-data-orange)] shrink-0 mt-0.5"
            aria-hidden
          />
          <span className={TYPO_DATA_WARNING}>
            {preview.validation.warnings.join("; ")}
          </span>
        </div>
      )}
    </div>
  );
}
