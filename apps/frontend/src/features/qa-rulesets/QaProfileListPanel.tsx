/**
 * QaProfileListPanel — lists all QA profiles with a create button (PRD-91).
 *
 * Renders a ProfileCard for each profile and provides a callback hook
 * for creating new profiles.
 */

import { Button ,  ContextLoader } from "@/components/primitives";

import { useQaProfiles } from "./hooks/use-qa-rulesets";
import { ProfileCard } from "./ProfileCard";
import { SECTION_HEADING_CLASSES } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface QaProfileListPanelProps {
  onCreate?: () => void;
  onEdit?: (profileId: number) => void;
  onDelete?: (profileId: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function QaProfileListPanel({
  onCreate,
  onEdit,
  onDelete,
}: QaProfileListPanelProps) {
  const { data: profiles, isPending, isError } = useQaProfiles();

  if (isPending) {
    return (
      <div data-testid="profile-list-loading" className="flex justify-center py-8">
        <ContextLoader size={48} />
      </div>
    );
  }

  if (isError) {
    return (
      <p
        data-testid="profile-list-error"
        className="text-sm text-[var(--color-action-danger)] py-4"
      >
        Failed to load QA profiles.
      </p>
    );
  }

  return (
    <div data-testid="profile-list-panel" className="space-y-4">
      {/* Header with create action */}
      <div className="flex items-center justify-between">
        <h3 className={SECTION_HEADING_CLASSES}>
          QA Profiles
        </h3>
        {onCreate && (
          <Button
            data-testid="profile-create-btn"
            size="sm"
            onClick={onCreate}
          >
            Create Profile
          </Button>
        )}
      </div>

      {/* Profile list or empty state */}
      {profiles && profiles.length > 0 ? (
        <div className="space-y-2">
          {profiles.map((profile) => (
            <ProfileCard
              key={profile.id}
              profile={profile}
              onEdit={onEdit ? () => onEdit(profile.id) : undefined}
              onDelete={onDelete ? () => onDelete(profile.id) : undefined}
            />
          ))}
        </div>
      ) : (
        <p
          data-testid="profile-list-empty"
          className="text-sm text-[var(--color-text-muted)] py-4"
        >
          No QA profiles yet. Create one to get started.
        </p>
      )}
    </div>
  );
}
