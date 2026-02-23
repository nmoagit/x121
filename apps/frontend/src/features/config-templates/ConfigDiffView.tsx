/**
 * ConfigDiffView -- shows what will change when importing a config (PRD-74).
 *
 * Color-coded entries: green (added), yellow (changed), gray (unchanged).
 */

import { Badge, Button, Card, CardBody, CardHeader } from "@/components";
import { formatValue } from "@/lib/format";

import type { ConfigDiffEntry, DiffStatus } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const STATUS_STYLES: Record<DiffStatus, string> = {
  added:
    "border-l-4 border-l-[var(--color-success)] bg-[var(--color-success-bg,transparent)]",
  changed:
    "border-l-4 border-l-[var(--color-warning)] bg-[var(--color-warning-bg,transparent)]",
  unchanged:
    "border-l-4 border-l-[var(--color-border)] bg-[var(--color-bg-secondary)]",
};

const STATUS_BADGES: Record<DiffStatus, { label: string; variant: "success" | "warning" | "default" }> = {
  added: { label: "Added", variant: "success" },
  changed: { label: "Changed", variant: "warning" },
  unchanged: { label: "Unchanged", variant: "default" },
};

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ConfigDiffViewProps {
  entries: ConfigDiffEntry[];
  onAccept?: () => void;
  onCancel?: () => void;
  isImporting?: boolean;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ConfigDiffView({
  entries,
  onAccept,
  onCancel,
  isImporting,
}: ConfigDiffViewProps) {
  const addedCount = entries.filter((e) => e.status === "added").length;
  const changedCount = entries.filter((e) => e.status === "changed").length;
  const unchangedCount = entries.filter((e) => e.status === "unchanged").length;

  return (
    <div data-testid="config-diff-view" className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--color-text-primary)]">
              Configuration Diff
            </h3>
            <div className="flex gap-2">
              <Badge variant="success">{addedCount} added</Badge>
              <Badge variant="warning">{changedCount} changed</Badge>
              <Badge variant="default">{unchangedCount} unchanged</Badge>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {entries.length === 0 && (
            <p
              data-testid="diff-empty"
              className="text-sm text-[var(--color-text-secondary)]"
            >
              No differences found.
            </p>
          )}

          <div className="space-y-2">
            {entries.map((entry) => (
              <DiffEntryRow key={entry.scene_type_name} entry={entry} />
            ))}
          </div>
        </CardBody>
      </Card>

      {(onAccept || onCancel) && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button data-testid="diff-cancel-btn" onClick={onCancel}>
              Cancel
            </Button>
          )}
          {onAccept && (
            <Button
              data-testid="diff-accept-btn"
              onClick={onAccept}
              disabled={isImporting}
            >
              {isImporting ? "Importing..." : "Accept & Import"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   DiffEntryRow
   -------------------------------------------------------------------------- */

function DiffEntryRow({ entry }: { entry: ConfigDiffEntry }) {
  const style = STATUS_STYLES[entry.status];
  const badge = STATUS_BADGES[entry.status];

  return (
    <div
      data-testid={`diff-entry-${entry.scene_type_name}`}
      className={`rounded p-3 ${style}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {entry.scene_type_name}
        </span>
        <Badge variant={badge.variant}>{badge.label}</Badge>
      </div>

      {entry.status === "changed" && entry.current_value && entry.incoming_value && (
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="font-medium text-[var(--color-text-secondary)]">
              Current:
            </span>
            <pre className="mt-1 overflow-auto rounded bg-[var(--color-bg-primary)] p-1">
              {formatValue(entry.current_value)}
            </pre>
          </div>
          <div>
            <span className="font-medium text-[var(--color-text-secondary)]">
              Incoming:
            </span>
            <pre className="mt-1 overflow-auto rounded bg-[var(--color-bg-primary)] p-1">
              {formatValue(entry.incoming_value)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
