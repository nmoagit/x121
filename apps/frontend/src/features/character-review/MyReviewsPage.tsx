import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/primitives";
import { Spinner } from "@/components/primitives";
import { ReviewStatusBadge } from "./ReviewStatusBadge";
import { useMyReviewQueue, useStartReview } from "./hooks/use-character-review";
import type { ReviewQueueCharacter } from "./types";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { formatDate } from "@/lib/format";

type SortField = "assigned_at" | "character_name" | "project_name";

function sortQueue(items: ReviewQueueCharacter[], sortBy: SortField): ReviewQueueCharacter[] {
  return [...items].sort((a, b) => {
    if (sortBy === "character_name") return a.character_name.localeCompare(b.character_name);
    if (sortBy === "project_name") return a.project_name.localeCompare(b.project_name);
    return new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime();
  });
}

export function MyReviewsPage() {
  useSetPageTitle("My Reviews");

  const { data, isPending, isError } = useMyReviewQueue();
  const startReview = useStartReview();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<SortField>("assigned_at");

  const items: ReviewQueueCharacter[] = data ?? [];
  const sorted = sortQueue(items, sortBy);

  if (isPending) return <div className="m-6"><Spinner /></div>;
  if (isError) return <div className="p-6 text-action-danger">Failed to load review queue.</div>;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Sort by:</span>
          <select
            className="bg-surface-secondary text-text-primary text-sm rounded px-2 py-1 border border-border-primary"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortField)}
          >
            <option value="assigned_at">Assignment Date</option>
            <option value="character_name">Character Name</option>
            <option value="project_name">Project</option>
          </select>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 text-text-muted">
          No characters assigned for review.
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <QueueRow
              key={item.assignment_id}
              item={item}
              onNavigate={() =>
                navigate({
                  to: "/projects/$projectId/characters/$characterId",
                  params: {
                    projectId: String(item.project_id),
                    characterId: String(item.character_id),
                  },
                  search: { tab: undefined, scene: undefined },
                })
              }
              onStart={() => startReview.mutate(item.assignment_id)}
              isStarting={startReview.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface QueueRowProps {
  item: ReviewQueueCharacter;
  onNavigate: () => void;
  onStart: () => void;
  isStarting: boolean;
}

function QueueRow({ item, onNavigate, onStart, isStarting }: QueueRowProps) {
  return (
    <div
      className="flex items-center justify-between p-4 bg-surface-secondary rounded-[var(--radius-lg)] border border-border-primary hover:border-action-primary cursor-pointer transition-colors"
      role="button"
      tabIndex={0}
      onClick={onNavigate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onNavigate();
      }}
    >
      <div className="flex items-center gap-4">
        <div>
          <div className="font-medium text-text-primary">{item.character_name}</div>
          <div className="text-sm text-text-muted">{item.project_name}</div>
        </div>
        <ReviewStatusBadge
          status={item.status === "active" ? "assigned" : "in_review"}
          size="sm"
        />
        {item.review_round > 1 && (
          <span className="text-xs text-text-muted">Round {item.review_round}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <div className="text-sm text-text-muted">
          {item.scene_count} scene{item.scene_count !== 1 ? "s" : ""}
        </div>
        <div className="text-sm text-text-muted">
          {formatDate(item.assigned_at)}
        </div>
        {item.deadline && (
          <div className="text-sm text-action-danger">
            Due {formatDate(item.deadline)}
          </div>
        )}
        <Button
          size="sm"
          variant="primary"
          disabled={isStarting}
          onClick={(e) => {
            e.stopPropagation();
            onStart();
          }}
        >
          Start Review
        </Button>
      </div>
    </div>
  );
}
