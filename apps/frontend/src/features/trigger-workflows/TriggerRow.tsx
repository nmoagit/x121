/**
 * Individual trigger table row (PRD-97).
 *
 * Displays a single trigger with toggle, edit, delete, and dry-run actions.
 * Expandable to show dry-run results.
 */

import { useState } from "react";

import { Badge, Button, Toggle } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { cn } from "@/lib/cn";
import { Edit3, Play, Trash2 } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { DryRunPanel } from "./DryRunPanel";
import {
  useDeleteTrigger,
  useDryRun,
  useUpdateTrigger,
} from "./hooks/use-trigger-workflows";
import type { DryRunResult, Trigger } from "./types";
import { ENTITY_TYPE_LABEL, EVENT_TYPE_LABEL } from "./types";
import type { EntityType, EventType } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface TriggerRowProps {
  trigger: Trigger;
  onEdit: (trigger: Trigger) => void;
}

export function TriggerRow({ trigger, onEdit }: TriggerRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);

  const updateMutation = useUpdateTrigger(trigger.id);
  const deleteMutation = useDeleteTrigger();
  const dryRunMutation = useDryRun();

  const handleToggle = (enabled: boolean) => {
    updateMutation.mutate({ is_enabled: enabled } as never);
  };

  const handleDelete = () => {
    if (window.confirm(`Delete trigger "${trigger.name}"?`)) {
      deleteMutation.mutate(trigger.id);
    }
  };

  const handleDryRun = (e: React.MouseEvent) => {
    e.stopPropagation();
    dryRunMutation.mutate(trigger.id, {
      onSuccess: (result) => {
        setDryRunResult(result);
        setExpanded(true);
      },
    });
  };

  const eventLabel = EVENT_TYPE_LABEL[trigger.event_type as EventType] ?? trigger.event_type;
  const entityLabel = ENTITY_TYPE_LABEL[trigger.entity_type as EntityType] ?? trigger.entity_type;

  return (
    <>
      <tr
        className={cn(
          "border-b border-[var(--color-border-default)] last:border-b-0",
          "hover:bg-[var(--color-surface-tertiary)]/50",
          "transition-colors duration-[var(--duration-instant)] cursor-pointer",
        )}
        onClick={() => setExpanded((prev) => !prev)}
        data-testid={`trigger-row-${trigger.id}`}
      >
        <td className="px-3 py-2.5 text-sm font-medium text-[var(--color-text-primary)]">
          {trigger.name}
          {trigger.requires_approval && (
            <Badge variant="warning" size="sm">Approval</Badge>
          )}
        </td>
        <td className="px-3 py-2.5">
          <Badge variant="info" size="sm">{eventLabel}</Badge>
        </td>
        <td className="px-3 py-2.5">
          <Badge variant="default" size="sm">{entityLabel}</Badge>
        </td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <Toggle
            checked={trigger.is_enabled}
            onChange={handleToggle}
            size="sm"
            disabled={updateMutation.isPending}
          />
        </td>
        <td className="px-3 py-2.5">
          <Stack direction="horizontal" gap={1} align="center">
            <Button
              variant="ghost"
              size="sm"
              icon={<Play size={iconSizes.sm} />}
              aria-label="Dry Run"
              onClick={handleDryRun}
              disabled={dryRunMutation.isPending}
              data-testid={`trigger-dryrun-${trigger.id}`}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Edit3 size={iconSizes.sm} />}
              aria-label="Edit"
              onClick={(e) => { e.stopPropagation(); onEdit(trigger); }}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 size={iconSizes.sm} />}
              aria-label="Delete"
              onClick={(e) => { e.stopPropagation(); handleDelete(); }}
              disabled={deleteMutation.isPending}
              data-testid={`trigger-delete-${trigger.id}`}
            />
          </Stack>
        </td>
      </tr>
      {expanded && dryRunResult && (
        <tr>
          <td colSpan={5} className="px-4 py-3 bg-[var(--color-surface-primary)]">
            <DryRunPanel results={[dryRunResult]} />
          </td>
        </tr>
      )}
    </>
  );
}
