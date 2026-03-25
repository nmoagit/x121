/**
 * SVG-based treemap visualization (PRD-19).
 *
 * Renders a squarified treemap of storage usage. Click a cell to
 * drill down into that entity's children. Breadcrumbs allow navigating
 * back up the hierarchy.
 */

import { Card, CardBody, CardHeader } from "@/components/composite";
import { Stack } from "@/components/layout";
import { ContextLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatBytes } from "@/lib/format";
import { useCallback, useMemo, useRef, useState } from "react";

import { useTreemapData } from "./hooks/use-storage-visualizer";
import { TreemapActions } from "./TreemapActions";
import { TreemapBreadcrumbs } from "./TreemapBreadcrumbs";
import type { BreadcrumbItem } from "./TreemapBreadcrumbs";
import { computeTreemapLayout } from "./treemap-layout";
import type { TreemapRect } from "./treemap-layout";
import type { TreemapNode } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SVG_WIDTH = 800;
const SVG_HEIGHT = 480;
const MIN_LABEL_WIDTH = 60;
const MIN_LABEL_HEIGHT = 30;
const CELL_GAP = 2;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function StorageTreemap() {
  const [drillPath, setDrillPath] = useState<BreadcrumbItem[]>([
    { label: "Root" },
  ]);
  const [selectedNode, setSelectedNode] = useState<TreemapNode | null>(null);

  const currentCrumb = drillPath[drillPath.length - 1];
  const { data: root, isLoading } = useTreemapData(
    currentCrumb?.entityType,
    currentCrumb?.entityId,
  );

  const rects = useMemo(() => {
    if (!root) return [];
    return computeTreemapLayout(root, SVG_WIDTH, SVG_HEIGHT);
  }, [root]);

  const handleCellClick = useCallback(
    (rect: TreemapRect) => {
      const node = rect.node;
      if (node.children.length > 0) {
        setDrillPath((prev) => [
          ...prev,
          {
            label: node.name,
            entityType: node.entity_type,
            entityId: node.entity_id,
          },
        ]);
        setSelectedNode(null);
      } else {
        setSelectedNode(node);
      }
    },
    [],
  );

  const handleBreadcrumbNav = useCallback((index: number) => {
    setDrillPath((prev) => prev.slice(0, index + 1));
    setSelectedNode(null);
  }, []);

  return (
    <Card elevation="sm">
      <CardHeader>
        <Stack direction="horizontal" gap={3} align="center" justify="between">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
            Storage Treemap
          </span>
          <TreemapBreadcrumbs items={drillPath} onNavigate={handleBreadcrumbNav} />
        </Stack>
      </CardHeader>

      <CardBody>
        {isLoading ? (
          <div className="flex h-[480px] items-center justify-center">
            <ContextLoader size={48} />
          </div>
        ) : rects.length === 0 ? (
          <div className="flex h-[480px] items-center justify-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              No storage data available.
            </p>
          </div>
        ) : (
          <Stack direction="vertical" gap={3}>
            <TreemapSvg rects={rects} onCellClick={handleCellClick} />
            {selectedNode && <TreemapActions node={selectedNode} />}
          </Stack>
        )}
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   SVG sub-component (kept private — renders the rect grid)
   -------------------------------------------------------------------------- */

interface TreemapSvgProps {
  rects: TreemapRect[];
  onCellClick: (rect: TreemapRect) => void;
}

function TreemapSvg({ rects, onCellClick }: TreemapSvgProps) {
  const [hovered, setHovered] = useState<TreemapRect | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full rounded-[var(--radius-md)]"
        role="img"
        aria-label="Storage treemap"
      >
        {rects.map((rect) => {
          const isHovered = hovered === rect;
          const drawW = Math.max(0, rect.width - CELL_GAP);
          const drawH = Math.max(0, rect.height - CELL_GAP);
          const showLabel = drawW >= MIN_LABEL_WIDTH && drawH >= MIN_LABEL_HEIGHT;

          return (
            <g
              key={`${rect.node.entity_type}-${rect.node.entity_id}`}
              onClick={() => onCellClick(rect)}
              onMouseEnter={() => setHovered(rect)}
              onMouseLeave={() => setHovered(null)}
              className="cursor-pointer"
            >
              <rect
                x={rect.x + CELL_GAP / 2}
                y={rect.y + CELL_GAP / 2}
                width={drawW}
                height={drawH}
                rx={4}
                fill={`hsl(${rect.hue}, 55%, ${isHovered ? 38 : 45}%)`}
                stroke={`hsl(${rect.hue}, 55%, 30%)`}
                strokeWidth={1}
              />
              {showLabel && (
                <>
                  <text
                    x={rect.x + CELL_GAP / 2 + 6}
                    y={rect.y + CELL_GAP / 2 + 18}
                    fill="white"
                    fontSize={12}
                    fontWeight={600}
                    pointerEvents="none"
                  >
                    {truncateLabel(rect.node.name, drawW - 12)}
                  </text>
                  <text
                    x={rect.x + CELL_GAP / 2 + 6}
                    y={rect.y + CELL_GAP / 2 + 34}
                    fill="rgba(255,255,255,0.75)"
                    fontSize={10}
                    pointerEvents="none"
                  >
                    {formatBytes(rect.node.size)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered && <TreemapTooltip rect={hovered} />}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Tooltip sub-component
   -------------------------------------------------------------------------- */

function TreemapTooltip({ rect }: { rect: TreemapRect }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute top-2 right-2 z-10",
        "rounded-[var(--radius-md)] border border-[var(--color-border-default)]",
        "bg-[var(--color-surface-secondary)] p-3 shadow-lg",
        "text-xs text-[var(--color-text-primary)]",
      )}
    >
      <p className="font-semibold">{rect.node.name}</p>
      <p className="text-[var(--color-text-muted)]">
        Type: {rect.node.entity_type}
      </p>
      <p>Size: {formatBytes(rect.node.size)}</p>
      <p>Files: {rect.node.file_count.toLocaleString()}</p>
      {rect.node.reclaimable_bytes > 0 && (
        <p className="text-[var(--color-action-warning)]">
          Reclaimable: {formatBytes(rect.node.reclaimable_bytes)}
        </p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Rough avatar truncation based on available pixel width. */
function truncateLabel(label: string, maxPx: number): string {
  const approxCharWidth = 7;
  const maxChars = Math.floor(maxPx / approxCharWidth);
  if (label.length <= maxChars) return label;
  if (maxChars <= 3) return "";
  return `${label.slice(0, maxChars - 1)}\u2026`;
}
