import { Badge } from "@/components/primitives";
import type { AssetNote } from "@/features/admin/hooks/use-assets";
import { AlertTriangle } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CompatibilityWarningProps {
  notes: AssetNote[];
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

interface SeverityStyle {
  variant: "warning" | "danger";
  bgClass: string;
  borderClass: string;
}

const SEVERITY_CONFIG: Record<string, SeverityStyle> = {
  warning: {
    variant: "warning",
    bgClass: "bg-[var(--color-action-warning)]/5",
    borderClass: "border-[var(--color-action-warning)]/30",
  },
  error: {
    variant: "danger",
    bgClass: "bg-[var(--color-action-danger)]/5",
    borderClass: "border-[var(--color-action-danger)]/30",
  },
};

const DEFAULT_CONFIG: SeverityStyle = {
  variant: "warning",
  bgClass: "bg-[var(--color-action-warning)]/5",
  borderClass: "border-[var(--color-action-warning)]/30",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CompatibilityWarning({ notes }: CompatibilityWarningProps) {
  if (notes.length === 0) return null;

  // Use the highest severity present for the banner style.
  const hasError = notes.some((n) => n.severity === "error");
  const config = (hasError ? SEVERITY_CONFIG.error : DEFAULT_CONFIG) ?? DEFAULT_CONFIG;

  return (
    <div
      className={`rounded-[var(--radius-lg)] border ${config.borderClass} ${config.bgClass} p-[var(--spacing-4)]`}
    >
      <div className="flex items-center gap-[var(--spacing-2)] mb-[var(--spacing-3)]">
        <AlertTriangle
          size={18}
          className={hasError ? "text-[var(--color-action-danger)]" : "text-[var(--color-action-warning)]"}
        />
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Compatibility {hasError ? "Errors" : "Warnings"}
        </h3>
      </div>

      <ul className="space-y-[var(--spacing-2)]">
        {notes.map((note) => {
          const noteConfig = (SEVERITY_CONFIG[note.severity] ?? DEFAULT_CONFIG);
          return (
            <li key={note.id} className="flex items-start gap-[var(--spacing-2)]">
              <Badge variant={noteConfig.variant} size="sm">
                {note.severity}
              </Badge>
              <span className="text-sm text-[var(--color-text-primary)]">
                {note.note_text}
                {note.related_asset_id != null && (
                  <span className="text-[var(--color-text-muted)]">
                    {" "}(related: #{note.related_asset_id})
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
