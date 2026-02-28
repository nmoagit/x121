/**
 * Main layout shell for the Director's View (PRD-55).
 *
 * Adapts to the current breakpoint:
 * - Phone: single column with bottom tab bar
 * - Tablet: two-column layout with sidebar nav
 * - Desktop: redirects to the main application (desktop users should
 *   use the full review interface)
 */

import { useCallback, useState } from "react";

import { cn } from "@/lib/cn";

import { ActivityFeed } from "./ActivityFeed";
import { DirectorsViewNav } from "./DirectorsViewNav";
import { useBreakpoint } from "./hooks/use-breakpoint";
import { useReviewQueue, useSubmitReviewAction } from "./hooks/use-directors-view";
import { MobilePlayer } from "./MobilePlayer";
import { OfflineIndicator } from "./OfflineIndicator";
import { ReviewQueue } from "./ReviewQueue";
import type { MobileTab, ReviewQueueItem, SwipeAction } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function DirectorsViewLayout() {
  const breakpoint = useBreakpoint();
  const [activeTab, setActiveTab] = useState<MobileTab>("queue");
  const [activeVideo, setActiveVideo] = useState<string | null>(null);
  const [pendingSyncCount] = useState(0);

  const { data: queueItems } = useReviewQueue();
  const submitAction = useSubmitReviewAction();

  const queueCount = queueItems?.length ?? 0;

  const handleSegmentAction = useCallback(
    (segmentId: number, action: SwipeAction) => {
      submitAction.mutate({ segmentId, action: { action } });
    },
    [submitAction],
  );

  const handleSegmentTap = useCallback(
    (segmentId: number) => {
      const item = queueItems?.find((q: ReviewQueueItem) => q.segment_id === segmentId);
      if (item?.video_url) {
        setActiveVideo(item.video_url);
      }
    },
    [queueItems],
  );

  const handleClosePlayer = useCallback(() => {
    setActiveVideo(null);
  }, []);

  /* -- Desktop redirect placeholder -------------------------------------- */

  if (breakpoint === "desktop") {
    return (
      <div
        data-testid="directors-view-desktop-redirect"
        className="flex h-screen items-center justify-center bg-[var(--color-surface-primary)] p-8 text-center"
      >
        <div className="flex flex-col gap-2">
          <p className="text-lg font-medium text-[var(--color-text-primary)]">
            Director's View is optimized for mobile and tablet
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Please use the full review interface on desktop, or resize your browser window.
          </p>
        </div>
      </div>
    );
  }

  /* -- Tablet: two-column layout ----------------------------------------- */

  if (breakpoint === "tablet") {
    return (
      <div data-testid="directors-view-layout" className="flex h-screen flex-col bg-[var(--color-surface-primary)]">
        <OfflineIndicator pendingSyncCount={pendingSyncCount} />

        <div className="flex flex-1 overflow-hidden">
          {/* Left column: queue */}
          <div className="flex w-1/2 flex-col overflow-y-auto border-r border-[var(--color-border-default)]">
            <SectionHeader title="Review Queue" />
            <ReviewQueue
              onSegmentAction={handleSegmentAction}
              onSegmentTap={handleSegmentTap}
            />
          </div>

          {/* Right column: activity */}
          <div className="flex w-1/2 flex-col overflow-y-auto">
            <SectionHeader title="Activity" />
            <ActivityFeed onSegmentTap={handleSegmentTap} />
          </div>
        </div>

        <DirectorsViewNav
          activeTab={activeTab}
          onTabChange={setActiveTab}
          queueCount={queueCount}
        />

        {activeVideo && <MobilePlayer videoUrl={activeVideo} onClose={handleClosePlayer} />}
      </div>
    );
  }

  /* -- Phone: single column with tab switching --------------------------- */

  return (
    <div data-testid="directors-view-layout" className="flex h-screen flex-col bg-[var(--color-surface-primary)]">
      <OfflineIndicator pendingSyncCount={pendingSyncCount} />

      <div className="flex-1 overflow-y-auto">
        {activeTab === "queue" && (
          <ReviewQueue
            onSegmentAction={handleSegmentAction}
            onSegmentTap={handleSegmentTap}
          />
        )}

        {activeTab === "projects" && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Projects view coming soon</p>
          </div>
        )}

        {activeTab === "activity" && (
          <ActivityFeed onSegmentTap={handleSegmentTap} />
        )}
      </div>

      <DirectorsViewNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        queueCount={queueCount}
      />

      {activeVideo && <MobilePlayer videoUrl={activeVideo} onClose={handleClosePlayer} />}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Internal sub-component
   -------------------------------------------------------------------------- */

function SectionHeader({ title }: { title: string }) {
  return (
    <div className={cn(
      "flex items-center px-4 py-3",
      "border-b border-[var(--color-border-default)]",
      "bg-[var(--color-surface-primary)]",
    )}>
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
    </div>
  );
}
