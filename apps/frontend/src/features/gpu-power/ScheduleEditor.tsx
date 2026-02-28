/**
 * Weekly schedule editor for GPU power on/off times (PRD-87).
 *
 * Displays a 7-day grid where each row is a day of the week with
 * configurable on/off time inputs.
 */

import { useCallback } from "react";

import { Card } from "@/components/composite/Card";
import { Input, Toggle } from "@/components/primitives";

import type { DayOfWeek, DaySchedule } from "./types";
import { DAYS_OF_WEEK, DAY_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ScheduleEditorProps {
  /** Current schedule keyed by day of week. Missing days are "always on". */
  schedule: Record<string, DaySchedule>;
  /** Called when any day's times change. */
  onChange: (schedule: Record<string, DaySchedule>) => void;
  /** Whether the schedule is currently enabled. */
  enabled?: boolean;
  /** Called when the enabled toggle changes. */
  onEnabledChange?: (enabled: boolean) => void;
  /** Optional label displayed above the editor. */
  label?: string;
}

/* --------------------------------------------------------------------------
   Day row
   -------------------------------------------------------------------------- */

interface DayRowProps {
  day: DayOfWeek;
  value: DaySchedule | undefined;
  onChangeDay: (day: DayOfWeek, value: DaySchedule | undefined) => void;
}

function DayRow({ day, value, onChangeDay }: DayRowProps) {
  const isActive = value !== undefined;

  function handleToggle(checked: boolean) {
    if (checked) {
      onChangeDay(day, { on: "08:00", off: "20:00" });
    } else {
      onChangeDay(day, undefined);
    }
  }

  function handleTimeChange(field: "on" | "off", time: string) {
    if (!value) return;
    onChangeDay(day, { ...value, [field]: time });
  }

  return (
    <div className="flex items-center gap-[var(--spacing-3)] py-[var(--spacing-2)]">
      {/* Day toggle */}
      <div className="w-24 shrink-0">
        <Toggle
          checked={isActive}
          onChange={handleToggle}
          label={DAY_LABELS[day].slice(0, 3)}
          size="sm"
        />
      </div>

      {/* Time inputs */}
      {isActive && value ? (
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Input
            type="time"
            value={value.on}
            onChange={(e) => handleTimeChange("on", e.target.value)}
            className="w-28 text-xs"
          />
          <span className="text-xs text-[var(--color-text-muted)]">to</span>
          <Input
            type="time"
            value={value.off}
            onChange={(e) => handleTimeChange("off", e.target.value)}
            className="w-28 text-xs"
          />
        </div>
      ) : (
        <span className="text-xs text-[var(--color-text-muted)]">
          Always off
        </span>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ScheduleEditor({
  schedule,
  onChange,
  enabled,
  onEnabledChange,
  label,
}: ScheduleEditorProps) {
  const handleDayChange = useCallback(
    (day: DayOfWeek, value: DaySchedule | undefined) => {
      const next = { ...schedule };
      if (value) {
        next[day] = value;
      } else {
        delete next[day];
      }
      onChange(next);
    },
    [schedule, onChange],
  );

  return (
    <Card elevation="flat" padding="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-[var(--spacing-3)]">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {label ?? "Power Schedule"}
        </span>
        {onEnabledChange !== undefined && enabled !== undefined && (
          <Toggle
            checked={enabled}
            onChange={onEnabledChange}
            label="Enabled"
            size="sm"
          />
        )}
      </div>

      {/* Day rows */}
      <div className="divide-y divide-[var(--color-border-default)]">
        {DAYS_OF_WEEK.map((day) => (
          <DayRow
            key={day}
            day={day}
            value={schedule[day]}
            onChangeDay={handleDayChange}
          />
        ))}
      </div>
    </Card>
  );
}
