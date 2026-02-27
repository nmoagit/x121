/**
 * Character overview tab showing readiness summary (PRD-112).
 */

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";

import type { Character } from "@/features/projects/types";
import { characterStatusLabel } from "@/features/projects/types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterOverviewTabProps {
  character: Character;
}

export function CharacterOverviewTab({ character }: CharacterOverviewTabProps) {
  const statusLabel = characterStatusLabel(character.status_id);

  return (
    <Stack gap={4}>
      <Card elevation="flat" padding="md">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-[var(--spacing-2)]">
          Readiness Summary
        </h2>
        <dl className="grid grid-cols-2 gap-[var(--spacing-3)] text-sm">
          <div>
            <dt className="text-[var(--color-text-muted)]">Status</dt>
            <dd className="font-medium text-[var(--color-text-primary)]">
              {statusLabel}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)]">Group</dt>
            <dd className="font-medium text-[var(--color-text-primary)]">
              {character.group_id ? `Group #${character.group_id}` : "Ungrouped"}
            </dd>
          </div>
        </dl>
      </Card>
    </Stack>
  );
}
