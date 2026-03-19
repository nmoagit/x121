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
import { Badge, Button } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Film } from "@/tokens/icons";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Resolution</th>
                  <th className="py-2 pr-3">Codec</th>
                  <th className="py-2 pr-3">Container</th>
                  <th className="py-2 pr-3">Bitrate</th>
                  <th className="py-2 pr-3">Framerate</th>
                  <th className="py-2 pr-3">Default</th>
                  <th className="py-2 text-right">Actions</th>
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
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="py-2 pr-3 font-medium text-[var(--color-text-primary)]">
        {profile.name}
      </td>
      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{profile.resolution}</td>
      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{profile.codec}</td>
      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">{profile.container}</td>
      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
        {profile.bitrate_kbps ? `${profile.bitrate_kbps} kbps` : "--"}
      </td>
      <td className="py-2 pr-3 text-[var(--color-text-secondary)]">
        {profile.framerate ? `${profile.framerate} fps` : "--"}
      </td>
      <td className="py-2 pr-3">
        {profile.is_default ? (
          <Badge variant="info" size="sm">Default</Badge>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSetDefault}
            disabled={isSettingDefault}
          >
            Set as Default
          </Button>
        )}
      </td>
      <td className="py-2 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            Edit
          </Button>
          {isConfirming ? (
            <>
              <Button variant="primary" size="sm" onClick={onDelete}>
                Confirm
              </Button>
              <Button variant="ghost" size="sm" onClick={onCancelDelete}>
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={onConfirmDelete}>
              Delete
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
