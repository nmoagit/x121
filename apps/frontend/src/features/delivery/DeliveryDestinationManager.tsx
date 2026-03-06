/**
 * Delivery destination manager component (PRD-039 Amendment A.1).
 *
 * Lists configured delivery destinations with add/edit/delete, plus
 * an auto-deliver toggle for the project (A.2).
 */

import { useState } from "react";

import { Badge, Button, Checkbox, Input, Select } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { cn } from "@/lib/cn";
import { SECTION_HEADING } from "@/lib/ui-classes";

import {
  useCreateDestination,
  useDeleteDestination,
  useDeliveryDestinations,
  useUpdateDestination,
} from "./hooks/use-delivery-destinations";
import type {
  CreateDeliveryDestination,
  DeliveryDestination,
  UpdateDeliveryDestination,
} from "./types";
import { DESTINATION_TYPE_LABELS } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DESTINATION_TYPE_OPTIONS = Object.entries(DESTINATION_TYPE_LABELS).map(
  ([id, label]) => ({ value: id, label }),
);

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface DeliveryDestinationManagerProps {
  projectId: number;
  autoDeliverOnFinal: boolean;
  onToggleAutoDeliver: (enabled: boolean) => void;
}

export function DeliveryDestinationManager({
  projectId,
  autoDeliverOnFinal,
  onToggleAutoDeliver,
}: DeliveryDestinationManagerProps) {
  const { data: destinations = [], isLoading } = useDeliveryDestinations(projectId);
  const createDest = useCreateDestination(projectId);
  const deleteDest = useDeleteDestination(projectId);

  const [showForm, setShowForm] = useState(false);
  const [editingDest, setEditingDest] = useState<DeliveryDestination | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function handleCreate(data: CreateDeliveryDestination) {
    createDest.mutate(data, {
      onSuccess: () => setShowForm(false),
    });
  }

  function handleEdit(dest: DeliveryDestination) {
    setEditingDest(dest);
    setShowForm(true);
  }

  function handleDelete(id: number) {
    deleteDest.mutate(id, {
      onSuccess: () => setConfirmDeleteId(null),
    });
  }

  function handleCancel() {
    setShowForm(false);
    setEditingDest(null);
  }

  if (isLoading) {
    return (
      <div className="text-sm text-[var(--color-text-muted)]">
        Loading destinations...
      </div>
    );
  }

  return (
    <Stack gap={4}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className={SECTION_HEADING}>
          Delivery Destinations
        </h3>
        {!showForm && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setEditingDest(null);
              setShowForm(true);
            }}
          >
            Add Destination
          </Button>
        )}
      </div>

      {/* Auto-deliver toggle (PRD-039 A.2) */}
      <div
        className={cn(
          "rounded-[var(--radius-md)] p-3",
          "bg-[var(--color-surface-secondary)]",
          "border border-[var(--color-border-default)]",
        )}
      >
        <Checkbox
          checked={autoDeliverOnFinal}
          onChange={onToggleAutoDeliver}
          label="Auto-deliver on final approval"
        />
        <p className="mt-1 ml-7 text-xs text-[var(--color-text-muted)]">
          Automatically deliver to all enabled destinations when a scene video receives final approval.
        </p>
      </div>

      {/* Form */}
      {showForm && (
        <DestinationForm
          destination={editingDest}
          projectId={projectId}
          onSave={handleCreate}
          onCancel={handleCancel}
          isSubmitting={createDest.isPending}
        />
      )}

      {/* Empty state */}
      {destinations.length === 0 && !showForm && (
        <p className="text-sm text-[var(--color-text-muted)]">
          No delivery destinations configured yet.
        </p>
      )}

      {/* List */}
      {destinations.length > 0 && (
        <ul className="space-y-2">
          {destinations.map((dest) => (
            <li
              key={dest.id}
              className={cn(
                "flex items-center justify-between",
                "rounded-[var(--radius-md)] p-3",
                "bg-[var(--color-surface-secondary)]",
                "border border-[var(--color-border-default)]",
              )}
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">
                  {dest.label || "(Unnamed)"}
                </span>
                <Badge variant="info" size="sm">
                  {DESTINATION_TYPE_LABELS[dest.destination_type_id] ?? "Unknown"}
                </Badge>
                <Badge variant={dest.is_enabled ? "success" : "default"} size="sm">
                  {dest.is_enabled ? "Enabled" : "Disabled"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleEdit(dest)}>
                  Edit
                </Button>
                {confirmDeleteId === dest.id ? (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleDelete(dest.id)}
                  >
                    Confirm
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmDeleteId(dest.id)}
                  >
                    Delete
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Destination Form (internal)
   -------------------------------------------------------------------------- */

interface DestinationFormProps {
  destination?: DeliveryDestination | null;
  projectId: number;
  onSave: (data: CreateDeliveryDestination) => void;
  onCancel: () => void;
  isSubmitting: boolean;
}

function DestinationForm({
  destination,
  projectId,
  onSave,
  onCancel,
  isSubmitting,
}: DestinationFormProps) {
  const [label, setLabel] = useState(destination?.label ?? "");
  const [typeId, setTypeId] = useState(String(destination?.destination_type_id ?? 1));
  const [isEnabled, setIsEnabled] = useState(destination?.is_enabled ?? true);

  // Config fields by type
  const config = (destination?.config ?? {}) as Record<string, string>;
  const [localPath, setLocalPath] = useState((config.path as string) ?? "");
  const [s3Bucket, setS3Bucket] = useState((config.bucket as string) ?? "");
  const [s3Prefix, setS3Prefix] = useState((config.prefix as string) ?? "");
  const [s3Region, setS3Region] = useState((config.region as string) ?? "");
  const [gdriveFolder, setGdriveFolder] = useState((config.folder_id as string) ?? "");
  const [gdriveSharedDrive, setGdriveSharedDrive] = useState(
    (config.shared_drive_id as string) ?? "",
  );

  const editingId = destination?.id;
  const updateDest = useUpdateDestination(projectId);

  function buildConfig(): Record<string, unknown> {
    const numTypeId = Number(typeId);
    if (numTypeId === 1) return { path: localPath };
    if (numTypeId === 2) return { bucket: s3Bucket, prefix: s3Prefix, region: s3Region };
    if (numTypeId === 3) {
      const cfg: Record<string, unknown> = { folder_id: gdriveFolder };
      if (gdriveSharedDrive) cfg.shared_drive_id = gdriveSharedDrive;
      return cfg;
    }
    return {};
  }

  function handleSubmit() {
    const configData = buildConfig();

    if (editingId) {
      const data: UpdateDeliveryDestination = {
        label,
        destination_type_id: Number(typeId),
        config: configData,
        is_enabled: isEnabled,
      };
      updateDest.mutate(
        { id: editingId, data },
        { onSuccess: onCancel },
      );
    } else {
      onSave({
        destination_type_id: Number(typeId),
        label,
        config: configData,
        is_enabled: isEnabled,
      });
    }
  }

  const numTypeId = Number(typeId);

  return (
    <div
      className={cn(
        "rounded-[var(--radius-lg)] p-4",
        "bg-[var(--color-surface-primary)]",
        "border border-[var(--color-border-default)]",
        "space-y-3",
      )}
    >
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <Select
          label="Type"
          options={DESTINATION_TYPE_OPTIONS}
          value={typeId}
          onChange={setTypeId}
        />
      </div>

      {/* Type-specific config fields */}
      {numTypeId === 1 && (
        <Input
          label="Local Path"
          value={localPath}
          onChange={(e) => setLocalPath(e.target.value)}
        />
      )}

      {numTypeId === 2 && (
        <div className="grid grid-cols-3 gap-3">
          <Input label="Bucket" value={s3Bucket} onChange={(e) => setS3Bucket(e.target.value)} />
          <Input label="Prefix" value={s3Prefix} onChange={(e) => setS3Prefix(e.target.value)} />
          <Input label="Region" value={s3Region} onChange={(e) => setS3Region(e.target.value)} />
        </div>
      )}

      {numTypeId === 3 && (
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Folder ID"
            value={gdriveFolder}
            onChange={(e) => setGdriveFolder(e.target.value)}
          />
          <Input
            label="Shared Drive ID (optional)"
            value={gdriveSharedDrive}
            onChange={(e) => setGdriveSharedDrive(e.target.value)}
          />
        </div>
      )}

      <Checkbox
        checked={isEnabled}
        onChange={setIsEnabled}
        label="Enabled"
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!label || isSubmitting}
        >
          {editingId ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}
