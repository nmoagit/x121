/**
 * Character detail page with tabbed sub-views (PRD-112).
 *
 * Shows breadcrumb (Projects > Project Name > Character Name),
 * character header with status badge, and tabbed content.
 */

import { useState } from "react";
import { Link, useParams } from "@tanstack/react-router";

import { Tabs } from "@/components/composite";
import { Badge, Spinner } from "@/components/primitives";
import type { BadgeVariant } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { AlertCircle, ChevronRight, User } from "@/tokens/icons";

import { useProject } from "@/features/projects/hooks/use-projects";
import { useCharacter } from "@/features/projects/hooks/use-project-characters";
import {
  CHARACTER_TABS,
  STATUS_COLORS,
  STATUS_LABELS,
} from "@/features/projects/types";

import { CharacterOverviewTab } from "./tabs/CharacterOverviewTab";
import { CharacterImagesTab } from "./tabs/CharacterImagesTab";
import { CharacterScenesTab } from "./tabs/CharacterScenesTab";
import { CharacterAssetsTab } from "./tabs/CharacterAssetsTab";
import { CharacterMetadataTab } from "./tabs/CharacterMetadataTab";
import { CharacterSettingsTab } from "./tabs/CharacterSettingsTab";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const COLOR_TO_VARIANT: Record<string, BadgeVariant> = {
  gray: "default",
  yellow: "warning",
  blue: "info",
  purple: "info",
  green: "success",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterDetailPage() {
  const params = useParams({ strict: false }) as {
    projectId: string;
    characterId: string;
  };
  const projectId = Number(params.projectId);
  const characterId = Number(params.characterId);

  const { data: project } = useProject(projectId);
  const { data: character, isLoading, error } = useCharacter(projectId, characterId);

  const [activeTab, setActiveTab] = useState<string>(CHARACTER_TABS[0].id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !character) {
    return (
      <EmptyState
        icon={<AlertCircle size={32} />}
        title="Character not found"
        description="The requested character could not be loaded."
      />
    );
  }

  const statusLabel = character.status_id
    ? (STATUS_LABELS[character.status_id] ?? "Unknown")
    : "No Status";

  const statusColor = character.status_id
    ? (STATUS_COLORS[character.status_id] ?? "gray")
    : "gray";

  const badgeVariant = COLOR_TO_VARIANT[statusColor] ?? "default";

  return (
    <Stack gap={6}>
      {/* Breadcrumb */}
      <nav className="flex items-center gap-[var(--spacing-1)] text-sm text-[var(--color-text-muted)]">
        <Link
          to="/projects"
          className="hover:text-[var(--color-text-primary)] transition-colors"
        >
          Projects
        </Link>
        <ChevronRight size={14} aria-hidden />
        <Link
          to="/projects/$projectId"
          params={{ projectId: String(projectId) }}
          className="hover:text-[var(--color-text-primary)] transition-colors"
        >
          {project?.name ?? `Project ${projectId}`}
        </Link>
        <ChevronRight size={14} aria-hidden />
        <span className="text-[var(--color-text-primary)] font-medium">
          {character.name}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-[var(--spacing-2)]">
        <User size={24} className="text-[var(--color-text-muted)]" aria-hidden />
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
          {character.name}
        </h1>
        <Badge variant={badgeVariant} size="sm">
          {statusLabel}
        </Badge>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={CHARACTER_TABS.map((t) => ({ id: t.id, label: t.label }))}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab content */}
      {activeTab === "overview" && (
        <CharacterOverviewTab character={character} />
      )}
      {activeTab === "images" && <CharacterImagesTab />}
      {activeTab === "scenes" && <CharacterScenesTab />}
      {activeTab === "assets" && <CharacterAssetsTab />}
      {activeTab === "metadata" && (
        <CharacterMetadataTab characterId={characterId} />
      )}
      {activeTab === "settings" && (
        <CharacterSettingsTab
          projectId={projectId}
          characterId={characterId}
        />
      )}
    </Stack>
  );
}
