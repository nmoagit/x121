/**
 * Output format profile manager component (PRD-39).
 *
 * Lists profiles, provides create/edit form, and delete with confirmation.
 */

import { useState } from "react";

import { Badge, Button, Input } from "@/components";
import { cn } from "@/lib/cn";

import {
  useCreateProfile,
  useDeleteProfile,
  useOutputFormatProfiles,
  useUpdateProfile,
} from "./hooks/use-delivery";
import type { CreateOutputFormatProfile, OutputFormatProfile } from "./types";

export function FormatProfileManager() {
  const { data: profiles = [], isLoading } = useOutputFormatProfiles();
  const createProfile = useCreateProfile();
  const deleteProfile = useDeleteProfile();

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

  if (isLoading) {
    return (
      <div data-testid="format-profile-manager" className="text-sm text-[var(--color-text-muted)]">
        Loading profiles...
      </div>
    );
  }

  return (
    <div data-testid="format-profile-manager" className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Output Format Profiles
        </h3>
        {!showForm && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingProfile(null);
              setShowForm(true);
            }}
            data-testid="add-profile-button"
          >
            Add Profile
          </Button>
        )}
      </div>

      {showForm && (
        <ProfileForm
          profile={editingProfile}
          onSave={handleCreate}
          onCancel={handleCancel}
          isSubmitting={createProfile.isPending}
        />
      )}

      {profiles.length === 0 && !showForm && (
        <p className="text-sm text-[var(--color-text-muted)]">No profiles defined yet.</p>
      )}

      {profiles.length > 0 && (
        <ul className="space-y-2" data-testid="profile-list">
          {profiles.map((profile) => (
            <li
              key={profile.id}
              className={cn(
                "flex items-center justify-between",
                "rounded-[var(--radius-md)] p-3",
                "bg-[var(--color-surface-secondary)]",
                "border border-[var(--color-border-default)]",
              )}
              data-testid="profile-item"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {profile.name}
                </span>
                <Badge variant="default" size="sm">{profile.resolution}</Badge>
                <Badge variant="info" size="sm">{profile.codec}</Badge>
                {profile.bitrate_kbps && (
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {profile.bitrate_kbps} kbps
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleEdit(profile)}>
                  Edit
                </Button>
                {confirmDeleteId === profile.id ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleDelete(profile.id)}
                    data-testid="confirm-delete-button"
                  >
                    Confirm
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDeleteId(profile.id)}
                    data-testid="delete-profile-button"
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Profile Form (internal)
   -------------------------------------------------------------------------- */

interface ProfileFormProps {
  profile?: OutputFormatProfile | null;
  onSave: (data: CreateOutputFormatProfile) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function ProfileForm({ profile, onSave, onCancel, isSubmitting }: ProfileFormProps) {
  const [name, setName] = useState(profile?.name ?? "");
  const [resolution, setResolution] = useState(profile?.resolution ?? "1920x1080");
  const [codec, setCodec] = useState(profile?.codec ?? "h264");
  const [container, setContainer] = useState(profile?.container ?? "mp4");
  const [bitrateStr, setBitrateStr] = useState(
    profile?.bitrate_kbps != null ? String(profile.bitrate_kbps) : "",
  );
  const [framerateStr, setFramerateStr] = useState(
    profile?.framerate != null ? String(profile.framerate) : "",
  );

  const editingId = profile?.id;
  const updateProfile = useUpdateProfile(editingId ?? 0);

  function handleSubmit() {
    const data: CreateOutputFormatProfile = {
      name,
      resolution,
      codec,
      container,
      bitrate_kbps: bitrateStr ? Number(bitrateStr) : undefined,
      framerate: framerateStr ? Number(framerateStr) : undefined,
    };

    if (editingId) {
      updateProfile.mutate(data, { onSuccess: onCancel });
    } else {
      onSave(data);
    }
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-4",
        "bg-[var(--color-surface-primary)]",
        "border border-[var(--color-border-default)]",
        "space-y-3",
      )}
      data-testid="profile-form"
    >
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        data-testid="profile-name-input"
      />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} />
        <Input label="Codec" value={codec} onChange={(e) => setCodec(e.target.value)} />
        <Input label="Container" value={container} onChange={(e) => setContainer(e.target.value)} />
        <Input label="Bitrate (kbps)" value={bitrateStr} onChange={(e) => setBitrateStr(e.target.value)} />
        <Input label="Framerate" value={framerateStr} onChange={(e) => setFramerateStr(e.target.value)} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!name || !resolution || !codec || !container || isSubmitting}
          data-testid="save-profile-button"
        >
          {editingId ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}
