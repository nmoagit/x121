/**
 * CSS-grid heatmap: endpoints (Y) x time buckets (X) (PRD-106).
 *
 * Color gradient from blue (low traffic) to red (high traffic).
 * Hover tooltips show request count.
 */

import { Fragment, useMemo } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { ContextLoader } from "@/components/primitives";
import { Layers } from "@/tokens/icons";

import type { Granularity, HeatmapCell, TimePeriod } from "./types";
import { formatChartTime } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Convert a 0.0-1.0 intensity to an HSL color string.
 * Gradient: blue (220deg) at 0 -> red (0deg) at 1.
 */
function intensityToColor(intensity: number): string {
  const hue = 220 - intensity * 220;
  const saturation = 60 + intensity * 20;
  const lightness = 85 - intensity * 40;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface EndpointHeatmapProps {
  data: HeatmapCell[] | undefined;
  isLoading: boolean;
  granularity: Granularity;
  period: TimePeriod;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function EndpointHeatmap({ data, isLoading }: EndpointHeatmapProps) {
  // Derive unique endpoints and time buckets
  const { endpoints, timeBuckets, cellMap } = useMemo(() => {
    if (!data || data.length === 0) {
      return { endpoints: [], timeBuckets: [], cellMap: new Map<string, HeatmapCell>() };
    }

    const endpointSet = new Set<string>();
    const bucketSet = new Set<string>();
    const map = new Map<string, HeatmapCell>();

    for (const cell of data) {
      endpointSet.add(cell.endpoint);
      bucketSet.add(cell.time_bucket);
      map.set(`${cell.endpoint}::${cell.time_bucket}`, cell);
    }

    return {
      endpoints: Array.from(endpointSet).sort(),
      timeBuckets: Array.from(bucketSet).sort(),
      cellMap: map,
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-6)]">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (!data || endpoints.length === 0) {
    return (
      <Card padding="lg">
        <p className="text-center text-sm text-[var(--color-text-muted)]">
          No heatmap data available.
        </p>
      </Card>
    );
  }

  return (
    <Card elevation="sm" padding="none">
      <CardHeader className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="flex items-center gap-[var(--spacing-2)]">
          <Layers size={16} className="text-[var(--color-text-muted)]" aria-hidden />
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Endpoint Heatmap
          </span>
        </div>
      </CardHeader>
      <CardBody className="px-[var(--spacing-4)] py-[var(--spacing-3)]">
        <div className="overflow-x-auto">
          {/* Column headers: time buckets */}
          <div
            className="grid gap-px"
            style={{
              gridTemplateColumns: `minmax(140px, max-content) repeat(${timeBuckets.length}, minmax(36px, 1fr))`,
            }}
          >
            {/* Empty top-left cell */}
            <div />
            {timeBuckets.map((bucket) => (
              <div
                key={bucket}
                className="text-center text-[10px] text-[var(--color-text-muted)] pb-1 truncate"
              >
                {formatChartTime(bucket)}
              </div>
            ))}

            {/* Rows: one per endpoint */}
            {endpoints.map((endpoint) => (
              <Fragment key={endpoint}>
                <div
                  className="truncate pr-2 text-xs text-[var(--color-text-secondary)] leading-8"
                  title={endpoint}
                >
                  {endpoint}
                </div>
                {timeBuckets.map((bucket) => {
                  const cell = cellMap.get(`${endpoint}::${bucket}`);
                  const intensity = cell?.intensity ?? 0;
                  const count = cell?.request_count ?? 0;

                  return (
                    <div
                      key={`${endpoint}::${bucket}`}
                      className="h-8 rounded-[var(--radius-sm)] transition-colors"
                      style={{ backgroundColor: intensityToColor(intensity) }}
                      title={`${endpoint} @ ${formatChartTime(bucket)}: ${count} requests`}
                      role="gridcell"
                      aria-label={`${endpoint}, ${formatChartTime(bucket)}, ${count} requests`}
                    />
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
