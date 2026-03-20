/**
 * Live preview display for a naming template (PRD-116).
 */

import { WireframeLoader } from "@/components/primitives";
import { AlertTriangle } from "@/tokens/icons";
import { TERMINAL_LABEL } from "@/lib/ui-classes";

import type { PreviewResult } from "../types";

interface TemplatePreviewProps {
  preview: PreviewResult | undefined;
  isLoading: boolean;
}

export function TemplatePreview({ preview, isLoading }: TemplatePreviewProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={TERMINAL_LABEL}>Preview</span>
      <div className="px-3 py-2 text-xs font-mono bg-[#161b22] rounded-[var(--radius-md)] min-h-[2rem] flex items-center">
        {isLoading ? (
          <WireframeLoader size={32} />
        ) : preview ? (
          <span className="text-cyan-400">{preview.filename}</span>
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
            className="text-orange-400 shrink-0 mt-0.5"
            aria-hidden
          />
          <span className="text-xs text-orange-400 font-mono">
            {preview.validation.warnings.join("; ")}
          </span>
        </div>
      )}
    </div>
  );
}
