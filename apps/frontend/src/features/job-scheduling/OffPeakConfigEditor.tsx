/**
 * Off-peak configuration editor (PRD-119).
 *
 * Provides a visual day-of-week x hours grid for defining off-peak windows,
 * with a timezone selector and save button.
 */

import { useCallback, useEffect, useState } from "react";

import { Button ,  WireframeLoader } from "@/components/primitives";
import { Select  } from "@/components/primitives";
import { Stack } from "@/components/layout";

import {
  useOffPeakConfig,
  useUpdateOffPeakConfig,
} from "./hooks/use-job-scheduling";
import { OffPeakGrid, createEmptyGrid } from "./OffPeakGrid";
import type { GridState } from "./OffPeakGrid";
import { TIMEZONE_SELECT_OPTIONS } from "./types";
import type { UpdateOffPeakConfig } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Convert the boolean grid to an array of off-peak windows for the API. */
function gridToEntries(grid: GridState, timezone: string): UpdateOffPeakConfig["entries"] {
  const entries: UpdateOffPeakConfig["entries"] = [];

  for (let day = 0; day < 7; day++) {
    const row = grid[day];
    if (!row) continue;

    let start: number | null = null;
    for (let hour = 0; hour <= 24; hour++) {
      const isOn = hour < 24 ? row[hour] : false;
      if (isOn && start === null) {
        start = hour;
      } else if (!isOn && start !== null) {
        entries.push({ day_of_week: day, start_hour: start, end_hour: hour, timezone });
        start = null;
      }
    }
  }

  return entries;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OffPeakConfigEditor() {
  const { data: windows, isPending, isError } = useOffPeakConfig();
  const updateMutation = useUpdateOffPeakConfig();

  const [grid, setGrid] = useState<GridState>(createEmptyGrid);
  const [timezone, setTimezone] = useState("UTC");
  const [isDirty, setIsDirty] = useState(false);

  // Hydrate grid from server data
  useEffect(() => {
    if (!windows) return;
    const newGrid = createEmptyGrid();
    let tz = "UTC";
    for (const w of windows) {
      tz = w.timezone;
      for (let h = w.start_hour; h < w.end_hour; h++) {
        const row = newGrid[w.day_of_week];
        if (row) row[h] = true;
      }
    }
    setGrid(newGrid);
    setTimezone(tz);
    setIsDirty(false);
  }, [windows]);

  const handleToggle = useCallback((day: number, hour: number) => {
    setGrid((prev) => {
      const next = prev.map((row) => [...row]);
      const row = next[day];
      if (row) row[hour] = !row[hour];
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    updateMutation.mutate({ entries: gridToEntries(grid, timezone) });
  }, [grid, timezone, updateMutation]);

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-8" data-testid="offpeak-loading">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load off-peak configuration.
      </div>
    );
  }

  return (
    <div data-testid="offpeak-editor">
      <Stack direction="vertical" gap={4}>
        <div className="max-w-xs">
          <Select
            label="Timezone"
            options={TIMEZONE_SELECT_OPTIONS}
            value={timezone}
            onChange={(v) => { setTimezone(v); setIsDirty(true); }}
          />
        </div>

        <OffPeakGrid grid={grid} onToggle={handleToggle} />

        <div>
          <Button
            variant="primary"
            size="md"
            disabled={!isDirty}
            loading={updateMutation.isPending}
            onClick={handleSave}
            data-testid="offpeak-save-btn"
          >
            Save Off-Peak Config
          </Button>
        </div>
      </Stack>
    </div>
  );
}
