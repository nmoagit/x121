/**
 * Character overview tab showing identity, stats, and completeness (PRD-112).
 */

import { useMemo, useState } from "react";

import { ConfirmModal } from "@/components/composite";
import { StatTicker, TerminalSection } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, FlagIcon, LoadingPane, Tooltip } from "@/components/primitives";
import { CheckCircle } from "@/tokens/icons";
import { getVoiceId } from "../types";
import { useBulkApprove } from "../hooks/use-character-detail";
import type { BulkApproveResult } from "../hooks/use-character-detail";

import {
  deriveMissingItems,
  GenerationHistorySection,
  MetadataSummarySection,
  MissingItemsBanner,
  SceneAssignmentsSection,
  useCharacterDashboard,
} from "@/features/character-dashboard";
import type { Character } from "@/features/projects/types";
import { useCharacterSceneSettings } from "@/features/scene-catalogue/hooks/use-character-scene-settings";
import { useExpandedSettings } from "@/features/scene-catalogue/hooks/use-expanded-settings";
import { ReadinessStateBadge } from "@/features/readiness/ReadinessStateBadge";
import type { ReadinessState } from "@/features/readiness/types";
import { useSpeechLanguageCounts } from "@/features/projects/hooks/use-character-deliverables";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CharacterOverviewTabProps {
  character: Character;
  characterId: number;
  projectId: number;
  /** Resolved blocking deliverables for this character. */
  blockingDeliverables?: string[];
  /** Called when a scene assignment row is clicked — navigate to scenes tab. */
  onSceneClick?: (sceneId: number) => void;
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

/** Total source images needed (clothed + topless tracks). */
const TOTAL_SOURCE_IMAGES_NEEDED = 2;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterOverviewTab({
  character,
  characterId,
  projectId,
  blockingDeliverables,
  onSceneClick,
}: CharacterOverviewTabProps) {
  const { data: dashboard, isLoading: dashboardLoading } =
    useCharacterDashboard(characterId);
  const { data: sceneSettings, isLoading: settingsLoading } =
    useCharacterSceneSettings(characterId);
  const { data: speechLangCounts } = useSpeechLanguageCounts(projectId);
  const expandedSettings = useExpandedSettings(sceneSettings);
  const bulkApprove = useBulkApprove(projectId, characterId);
  const [bulkResult, setBulkResult] = useState<BulkApproveResult | null>(null);
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  /** Per-language speech counts for this character. */
  const languageSpeechStats = useMemo(() => {
    if (!speechLangCounts) return [];
    return speechLangCounts.filter((r) => r.character_id === characterId);
  }, [speechLangCounts, characterId]);

  /** Set of enabled scene_type+track keys from the effective scene settings. */
  const enabledKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const s of expandedSettings) {
      if (s.is_enabled) {
        keys.add(`${s.scene_type_id}-${s.track_id ?? 0}`);
      }
    }
    return keys;
  }, [expandedSettings]);

  /** Dashboard assignments filtered to only enabled scene+track combos. */
  const activeAssignments = useMemo(() => {
    const raw = dashboard?.scene_assignments ?? [];
    return raw.filter((a) => enabledKeys.has(`${a.scene_type_id}-${a.track_id ?? 0}`));
  }, [dashboard?.scene_assignments, enabledKeys]);

  if (dashboardLoading || settingsLoading) {
    return <LoadingPane />;
  }

  const missingItems =
    dashboard?.readiness?.missing_items
      ? deriveMissingItems(characterId, dashboard.readiness.missing_items)
      : [];

  const metadataFieldCount = Object.keys(character.metadata ?? {}).length;

  return (
    <Stack gap={4}>
      {/* Stats ticker */}
      {dashboard && (() => {
        const scenesAssigned = activeAssignments.length;
        const scenesApproved = activeAssignments.filter((a) => a.status === "approved").length;
        const imagesApproved = dashboard.variant_counts.approved;
        const imagesComplete = imagesApproved >= TOTAL_SOURCE_IMAGES_NEEDED;
        const scenesComplete = scenesApproved >= scenesAssigned && scenesAssigned > 0;

        return (
          <StatTicker stats={[
            {
              label: "Images",
              value: `${imagesApproved}/${TOTAL_SOURCE_IMAGES_NEEDED}`,
              tooltip: `${imagesApproved} approved / ${TOTAL_SOURCE_IMAGES_NEEDED} needed (clothed + topless)`,
              complete: imagesComplete,
            },
            {
              label: "Variants",
              value: `${dashboard.variant_counts.approved}/${dashboard.variant_counts.total}`,
              complete: dashboard.variant_counts.approved >= dashboard.variant_counts.total && dashboard.variant_counts.total > 0,
            },
            {
              label: "Scenes",
              value: `${scenesApproved}/${scenesAssigned}`,
              tooltip: `${scenesApproved} approved / ${scenesAssigned} assigned`,
              complete: scenesComplete,
            },
            {
              label: "Metadata",
              value: metadataFieldCount,
            },
          ]} />
        );
      })()}

      {/* VoiceID status */}
      {(() => {
        const voiceId = getVoiceId(character.settings as Record<string, unknown> | null);

        return (
          <TerminalSection title="VoiceID">
            <div className="flex items-center justify-between font-mono text-xs">
              {voiceId ? (
                <div className="flex items-center gap-[var(--spacing-2)]">
                  <span className="text-green-400">configured</span>
                  <span className="text-cyan-400 truncate">{voiceId}</span>
                </div>
              ) : (
                <div className="flex items-center gap-[var(--spacing-2)]">
                  <span className="text-orange-400">missing</span>
                  <span className="text-[var(--color-text-muted)]">configure in Settings tab</span>
                </div>
              )}
            </div>
          </TerminalSection>
        );
      })()}

      {/* Speech Languages */}
      {languageSpeechStats.length > 0 && (
        <TerminalSection title="Speech Languages">
          <div className="flex flex-wrap gap-4 font-mono text-xs">
            {languageSpeechStats.map((lang) => (
              <Tooltip
                key={lang.language_id}
                content={`${lang.code.toUpperCase()}: ${lang.count} speech entries`}
              >
                <div className="flex items-center gap-1.5 cursor-help">
                  <FlagIcon flagCode={lang.flag_code} size={10} />
                  <span className="uppercase text-[var(--color-text-muted)]">
                    {lang.code}:
                  </span>
                  <span className="font-semibold text-cyan-400">
                    {lang.count}
                  </span>
                </div>
              </Tooltip>
            ))}
          </div>
        </TerminalSection>
      )}

      {/* Completeness */}
      {dashboard?.readiness && (
        <TerminalSection title="Readiness">
          <Stack gap={2}>
            <div className="flex items-center justify-between font-mono text-xs">
              <div className="flex items-center gap-[var(--spacing-2)]">
                <ReadinessStateBadge
                  state={dashboard.readiness.state as ReadinessState}
                  missingItems={dashboard.readiness.missing_items}
                />
              </div>
              <span className={`font-semibold text-sm ${
                dashboard.readiness.readiness_pct >= 100 ? "text-green-400" : "text-cyan-400"
              }`}>
                {dashboard.readiness.readiness_pct}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full rounded-full transition-all ${
                  dashboard.readiness.readiness_pct >= 100 ? "bg-green-400" : "bg-cyan-400"
                }`}
                style={{ width: `${dashboard.readiness.readiness_pct}%` }}
              />
            </div>

            <MissingItemsBanner items={missingItems} />
          </Stack>
        </TerminalSection>
      )}

      {/* Bulk approve — backfill shortcut */}
      {dashboard && (
        <TerminalSection title="Actions">
          <div className="flex items-center gap-[var(--spacing-3)]">
            <Button
              size="sm"
              variant="secondary"
              icon={<CheckCircle size={14} />}
              onClick={() => setConfirmApproveOpen(true)}
            >
              Approve All Deliverables
            </Button>
            <span className="text-xs text-[var(--color-text-muted)] font-mono">
              {bulkResult
                ? `approved: ${bulkResult.images_approved} images, ${bulkResult.clips_approved} clips, ${bulkResult.metadata_approved} metadata${bulkResult.skipped_sections.length > 0 ? ` (skipped: ${bulkResult.skipped_sections.join(", ")})` : ""}`
                : `approve blocking deliverables: ${(blockingDeliverables ?? ["metadata", "images", "scenes"]).join(", ")}`}
            </span>
          </div>
        </TerminalSection>
      )}

      <ConfirmModal
        open={confirmApproveOpen}
        onClose={() => setConfirmApproveOpen(false)}
        title="Approve All Deliverables"
        confirmLabel="Approve All"
        confirmVariant="primary"
        loading={bulkApprove.isPending}
        onConfirm={() =>
          bulkApprove.mutate(blockingDeliverables, {
            onSuccess: (result) => {
              setBulkResult(result);
              setConfirmApproveOpen(false);
            },
          })
        }
      >
        <p>
          This will approve unapproved deliverables for{" "}
          <strong>{character.name}</strong> in the following sections:{" "}
          <strong>{(blockingDeliverables ?? ["metadata", "images", "scenes"]).join(", ")}</strong>.
        </p>
        {blockingDeliverables && (
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            Only sections enabled in blocking deliverables are approved.
          </p>
        )}
        <p className="mt-2">
          This bypasses the normal review workflow and should only be used
          for backfill operations. This action cannot be easily undone.
        </p>
      </ConfirmModal>

      {/* Metadata Completeness */}
      {dashboard && (
        <TerminalSection title="Metadata">
          <MetadataSummarySection
            characterId={characterId}
            sourceImageCount={dashboard.source_image_count}
          />
        </TerminalSection>
      )}

      {/* Scene Assignments */}
      {dashboard && (
        <TerminalSection title="Scene Assignments">
          <SceneAssignmentsSection
            assignments={activeAssignments}
            sceneCount={activeAssignments.length}
            onSceneClick={onSceneClick}
          />
        </TerminalSection>
      )}

      {/* Generation History */}
      {dashboard && (
        <TerminalSection title="Generation History">
          <GenerationHistorySection summary={dashboard.generation_summary} />
        </TerminalSection>
      )}
    </Stack>
  );
}
