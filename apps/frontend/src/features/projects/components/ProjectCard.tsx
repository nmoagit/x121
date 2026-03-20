/**
 * Project summary card for the project list grid (PRD-112).
 */

import { Button } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";
import { TERMINAL_STATUS_COLORS } from "@/lib/ui-classes";
import { Archive, ArchiveRestore, Trash2 } from "@/tokens/icons";

import type { Project } from "../types";
import { PROJECT_STATUS_LABELS, projectStatusSlug } from "../types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ProjectCardProps {
  project: Project;
  onClick: () => void;
  onArchive?: (id: number) => void;
  onUnarchive?: (id: number) => void;
  onDelete?: (id: number) => void;
  isUpdating?: boolean;
}

/** Map project status to terminal color class. */
const STATUS_COLOR: Record<string, string> = {
  active: TERMINAL_STATUS_COLORS["active"] ?? "text-green-400",
  draft: TERMINAL_STATUS_COLORS["draft"] ?? "text-orange-400",
  archived: "text-[var(--color-text-muted)]",
};

export function ProjectCard({
  project,
  onClick,
  onArchive,
  onUnarchive,
  onDelete,
  isUpdating,
}: ProjectCardProps) {
  const status = projectStatusSlug(project.status_id);
  const statusLabel = PROJECT_STATUS_LABELS[status] ?? status;
  const isArchived = status === "archived";
  const total = project.character_count ?? 0;
  const ready = project.characters_ready ?? 0;
  const allReady = total > 0 && ready === total;

  return (
    <div
      className={cn(
        "cursor-pointer rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] overflow-hidden",
        "transition-shadow duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        "hover:shadow-[var(--shadow-md)]",
        isArchived && "opacity-60",
      )}
    >
      <div
        onClick={onClick}
        className="w-full text-left"
        aria-label={`Open project ${project.name}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#161b22] border-b border-[var(--color-border-default)]">
          <h3 className="text-xs font-medium text-[var(--color-text-primary)] font-mono truncate uppercase tracking-wide">
            {project.name}
          </h3>
          <span className={cn("text-[10px] font-mono shrink-0", STATUS_COLOR[status] ?? "text-[var(--color-text-muted)]")}>
            {statusLabel.toLowerCase()}
          </span>
        </div>

        {/* Body */}
        <div className="px-3 py-2 space-y-1.5">
          {project.description && (
            <p className="text-[11px] font-mono text-[var(--color-text-muted)] line-clamp-2">
              {project.description}
            </p>
          )}

          {/* Model counter */}
          {total > 0 && (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-[var(--color-text-muted)]">models</span>
              <span className={allReady ? "text-green-400" : "text-cyan-400"}>
                {ready}/{total}
              </span>
              {allReady && (
                <span className="text-green-400 text-[10px]">ready</span>
              )}
            </div>
          )}

          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-[var(--color-text-muted)]">
              {formatDate(project.created_at)}
            </p>

            {isArchived && (
              <div className="flex items-center gap-1">
                {onUnarchive && (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<ArchiveRestore size={12} />}
                    loading={isUpdating}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUnarchive(project.id);
                    }}
                  >
                    Unarchive
                  </Button>
                )}
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={<Trash2 size={12} />}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(project.id);
                    }}
                    className="text-red-400 hover:text-red-400"
                  >
                    Delete
                  </Button>
                )}
              </div>
            )}
            {!isArchived && onArchive && (
              <Button
                variant="ghost"
                size="xs"
                icon={<Archive size={12} />}
                loading={isUpdating}
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(project.id);
                }}
              >
                Archive
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
