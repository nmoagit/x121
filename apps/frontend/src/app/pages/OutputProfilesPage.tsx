/**
 * Admin page for managing output format profiles (PRD-137).
 *
 * Lists all profiles in a table, supports CRUD operations and
 * setting a platform-wide default profile.
 *
 * Reuses ProfileForm from the delivery feature to avoid duplicating
 * the create/edit form (DRY-audit PRD-137).
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Film } from "@/tokens/icons";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_TH, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER, GHOST_DANGER_BTN } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";

import {
  ProfileForm,
  useOutputFormatProfiles,
  useCreateProfile,
  useDeleteProfile,
  useSetProfileDefault,
} from "@/features/delivery";
import type {
  CreateOutputFormatProfile,
  OutputFormatProfile,
} from "@/features/delivery";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OutputProfilesPage() {
  useSetPageTitle("Output Profiles");

  const { data: profiles = [], isLoading } = useOutputFormatProfiles();
  const createProfile = useCreateProfile();
  const deleteProfile = useDeleteProfile();
  const setDefault = useSetProfileDefault();

  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<OutputFormatProfile | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function handleCreate(data: CreateOutputFormatProfile) {
    createProfile.mutate(data, {
      onSuccess: () => setShowForm(false),
    });
  }

  function handleEdit(profile: OutputFormatProfile) {
    setEditingProfile(profile);
    setShowForm(true);
  }

  function handleDelete(id: number) {
    deleteProfile.mutate(id, {
      onSuccess: () => setConfirmDeleteId(null),
    });
  }

  function handleCancel() {
    setShowForm(false);
    setEditingProfile(null);
  }

  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Output Profiles"
          description="Manage output format profiles used for delivery exports."
          actions={
            !showForm ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setEditingProfile(null);
                  setShowForm(true);
                }}
              >
                Add Profile
              </Button>
            ) : undefined
          }
        />

        {showForm && (
          <ProfileForm
            profile={editingProfile}
            onSave={handleCreate}
            onCancel={handleCancel}
            isSubmitting={createProfile.isPending}
          />
        )}

        {isLoading && (
          <p className="text-sm text-[var(--color-text-muted)]">Loading profiles...</p>
        )}

        {!isLoading && sorted.length === 0 && !showForm && (
          <EmptyState
            icon={<Film size={24} />}
            title="No output profiles"
            description="Create an output format profile to configure delivery exports."
          />
        )}

        {sorted.length > 0 && (
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_HEADER}>
              <span className={TERMINAL_HEADER_TITLE}>Profiles</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full font-mono text-xs">
                <thead>
                  <tr className={TERMINAL_DIVIDER}>
                    <th className={cn(TERMINAL_TH, "py-2 px-3")}>Name</th>
                    <th className={cn(TERMINAL_TH, "py-2 px-3")}>Resolution</th>
                    <th className={cn(TERMINAL_TH, "py-2 px-3")}>Codec</th>
                    <th className={cn(TERMINAL_TH, "py-2 px-3")}>Container</th>
                    <th className={cn(TERMINAL_TH, "py-2 px-3")}>Bitrate</th>
                    <th className={cn(TERMINAL_TH, "py-2 px-3")}>Framerate</th>
                    <th className={cn(TERMINAL_TH, "py-2 px-3")}>Default</th>
                    <th className={cn(TERMINAL_TH, "py-2 px-3 text-right")}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((profile) => (
                    <ProfileRow
                      key={profile.id}
                      profile={profile}
                      confirmDeleteId={confirmDeleteId}
                      onEdit={() => handleEdit(profile)}
                      onDelete={() => handleDelete(profile.id)}
                      onConfirmDelete={() => setConfirmDeleteId(profile.id)}
                      onCancelDelete={() => setConfirmDeleteId(null)}
                      onSetDefault={() => setDefault.mutate(profile.id)}
                      isSettingDefault={setDefault.isPending}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Profile table row
   -------------------------------------------------------------------------- */

interface ProfileRowProps {
  profile: OutputFormatProfile;
  confirmDeleteId: number | null;
  onEdit: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onSetDefault: () => void;
  isSettingDefault: boolean;
}

function ProfileRow({
  profile,
  confirmDeleteId,
  onEdit,
  onDelete,
  onConfirmDelete,
  onCancelDelete,
  onSetDefault,
  isSettingDefault,
}: ProfileRowProps) {
  const isConfirming = confirmDeleteId === profile.id;

  return (
    <tr className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}>
      <td className="py-2 px-3 text-cyan-400">
        {profile.name}
      </td>
      <td className="py-2 px-3 text-[var(--color-text-secondary)]">{profile.resolution}</td>
      <td className="py-2 px-3 text-[var(--color-text-secondary)]">{profile.codec}</td>
      <td className="py-2 px-3 text-[var(--color-text-secondary)]">{profile.container}</td>
      <td className="py-2 px-3 text-[var(--color-text-secondary)]">
        {profile.bitrate_kbps ? `${profile.bitrate_kbps} kbps` : "--"}
      </td>
      <td className="py-2 px-3 text-[var(--color-text-secondary)]">
        {profile.framerate ? `${profile.framerate} fps` : "--"}
      </td>
      <td className="py-2 px-3">
        {profile.is_default ? (
          <span className="text-green-400">Default</span>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={onSetDefault}
            disabled={isSettingDefault}
          >
            Set as Default
          </Button>
        )}
      </td>
      <td className="py-2 px-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="xs" onClick={onEdit}>
            Edit
          </Button>
          {isConfirming ? (
            <>
              <Button variant="primary" size="xs" onClick={onDelete}>
                Confirm
              </Button>
              <Button variant="ghost" size="xs" onClick={onCancelDelete}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="xs" className={GHOST_DANGER_BTN} onClick={onConfirmDelete}>
              Delete
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
