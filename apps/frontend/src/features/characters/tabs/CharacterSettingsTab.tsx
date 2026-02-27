/**
 * Character settings tab showing key-value settings (PRD-112).
 */

import { Card } from "@/components/composite";
import { Spinner } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { formatValue } from "@/lib/format";
import { Settings } from "@/tokens/icons";

import { useCharacterSettings } from "../hooks/use-character-detail";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterSettingsTabProps {
  projectId: number;
  characterId: number;
}

export function CharacterSettingsTab({
  projectId,
  characterId,
}: CharacterSettingsTabProps) {
  const { data: settings, isLoading } = useCharacterSettings(
    projectId,
    characterId,
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-[var(--spacing-8)]">
        <Spinner size="lg" />
      </div>
    );
  }

  const entries = settings ? Object.entries(settings) : [];

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Settings size={32} />}
        title="No settings"
        description="This character has no settings configured."
      />
    );
  }

  return (
    <Stack gap={4}>
      <Card elevation="flat" padding="md">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-[var(--spacing-3)]">
          Character Settings
        </h2>
        <dl className="grid grid-cols-1 gap-[var(--spacing-2)] sm:grid-cols-2">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="flex flex-col gap-[var(--spacing-1)] p-[var(--spacing-2)] rounded-[var(--radius-sm)] bg-[var(--color-surface-primary)]"
            >
              <dt className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
                {key}
              </dt>
              <dd className="text-sm text-[var(--color-text-primary)] break-words">
                {formatValue(value)}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </Stack>
  );
}

