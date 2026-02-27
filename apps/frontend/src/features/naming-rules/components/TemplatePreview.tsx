/**
 * Live preview display for a naming template (PRD-116).
 */

import { Spinner } from "@/components/primitives";
import { AlertTriangle } from "@/tokens/icons";

import type { PreviewResult } from "../types";

interface TemplatePreviewProps {
  preview: PreviewResult | undefined;
  isLoading: boolean;
}

export function TemplatePreview({ preview, isLoading }: TemplatePreviewProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-[var(--color-text-muted)]">Preview</span>
      <div className="px-3 py-2 text-sm font-mono bg-[var(--color-surface-tertiary)] rounded-[var(--radius-md)] min-h-[2rem] flex items-center">
        {isLoading ? (
          <Spinner size="sm" />
        ) : preview ? (
          <span className="text-[var(--color-text-primary)]">{preview.filename}</span>
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
            className="text-[var(--color-action-warning)] shrink-0 mt-0.5"
            aria-hidden
          />
          <span className="text-xs text-[var(--color-action-warning)]">
            {preview.validation.warnings.join("; ")}
          </span>
        </div>
      )}
    </div>
  );
}
