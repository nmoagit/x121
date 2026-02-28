/**
 * Condition builder for trigger event filtering (PRD-97).
 *
 * Visual builder for selecting event type, entity scope, and filter
 * conditions. Shows a preview of what would match.
 */

import { useCallback } from "react";

import { Badge, Select } from "@/components/primitives";
import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";

import { JsonTextarea } from "./JsonTextarea";
import type { EntityType, EventType } from "./types";
import { ENTITY_TYPE_LABEL, EVENT_TYPE_LABEL } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const EVENT_TYPE_OPTIONS = Object.entries(EVENT_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

const ENTITY_TYPE_OPTIONS = Object.entries(ENTITY_TYPE_LABEL).map(
  ([value, label]) => ({ value, label }),
);

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ConditionBuilderProps {
  eventType: string;
  entityType: string;
  scope: string;
  conditions: string;
  onEventTypeChange: (value: string) => void;
  onEntityTypeChange: (value: string) => void;
  onScopeChange: (value: string) => void;
  onConditionsChange: (value: string) => void;
  scopeError?: string;
  conditionsError?: string;
  onScopeErrorClear?: () => void;
  onConditionsErrorClear?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ConditionBuilder({
  eventType,
  entityType,
  scope,
  conditions,
  onEventTypeChange,
  onEntityTypeChange,
  onScopeChange,
  onConditionsChange,
  scopeError,
  conditionsError,
  onScopeErrorClear,
  onConditionsErrorClear,
}: ConditionBuilderProps) {
  const eventLabel = EVENT_TYPE_LABEL[eventType as EventType] ?? eventType;
  const entityLabel = ENTITY_TYPE_LABEL[entityType as EntityType] ?? entityType;

  const handleEventType = useCallback(
    (v: string) => onEventTypeChange(v),
    [onEventTypeChange],
  );

  const handleEntityType = useCallback(
    (v: string) => onEntityTypeChange(v),
    [onEntityTypeChange],
  );

  return (
    <div data-testid="condition-builder">
      <Stack direction="vertical" gap={4}>
        <Stack direction="horizontal" gap={3}>
          <div className="flex-1">
            <Select
              label="Event Type"
              options={EVENT_TYPE_OPTIONS}
              value={eventType}
              onChange={handleEventType}
            />
          </div>
          <div className="flex-1">
            <Select
              label="Entity Type"
              options={ENTITY_TYPE_OPTIONS}
              value={entityType}
              onChange={handleEntityType}
            />
          </div>
        </Stack>

        <JsonTextarea
          label="Scope (JSON)"
          value={scope}
          onChange={onScopeChange}
          error={scopeError}
          onErrorClear={onScopeErrorClear}
          rows={3}
          data-testid="condition-scope"
        />

        <JsonTextarea
          label="Conditions (JSON)"
          value={conditions}
          onChange={onConditionsChange}
          error={conditionsError}
          onErrorClear={onConditionsErrorClear}
          rows={3}
          data-testid="condition-filters"
        />

        {/* Preview */}
        <Card elevation="flat" padding="sm">
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            <span>Fires when</span>
            <Badge variant="info" size="sm">{entityLabel}</Badge>
            <span>is</span>
            <Badge variant="success" size="sm">{eventLabel}</Badge>
          </div>
        </Card>
      </Stack>
    </div>
  );
}
