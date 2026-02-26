/**
 * Admin panel for managing tracks (PRD-111).
 *
 * Lists tracks with inline editing for name and sort_order,
 * an add form, and deactivate toggle.
 */

import { useCallback, useState } from "react";

import { Card } from "@/components/composite/Card";
import { Stack } from "@/components/layout";
import { Badge, Button, Input, Spinner, Toggle } from "@/components/primitives";
import { generateSnakeSlug } from "@/lib/format";
import { Plus } from "@/tokens/icons";

import { useCreateTrack, useTracks, useUpdateTrack } from "./hooks/use-tracks";
import type { CreateTrack, Track } from "./types";

/* --------------------------------------------------------------------------
   Add track form
   -------------------------------------------------------------------------- */

interface AddTrackFormProps {
  onClose: () => void;
}

function AddTrackForm({ onClose }: AddTrackFormProps) {
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const createMutation = useCreateTrack();

  const handleCreate = useCallback(() => {
    if (!name.trim()) return;

    const data: CreateTrack = {
      name: name.trim(),
      slug: generateSnakeSlug(name.trim()),
      sort_order: Number.parseInt(sortOrder, 10) || 0,
    };

    createMutation.mutate(data, { onSuccess: () => onClose() });
  }, [name, sortOrder, createMutation, onClose]);

  return (
    <div className="flex items-end gap-3">
      <Input
        label="Track Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="e.g. Clothed"
      />
      <Input
        label="Sort Order"
        type="number"
        min={0}
        value={sortOrder}
        onChange={(e) => setSortOrder(e.target.value)}
        className="w-24"
      />
      <div className="flex gap-2 pb-0.5">
        <Button
          variant="primary"
          size="sm"
          onClick={handleCreate}
          disabled={!name.trim()}
          loading={createMutation.isPending}
        >
          Add
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Track row (inline edit)
   -------------------------------------------------------------------------- */

interface TrackRowProps {
  track: Track;
}

function TrackRow({ track }: TrackRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);
  const [sortOrder, setSortOrder] = useState(track.sort_order.toString());
  const updateMutation = useUpdateTrack(track.id);

  const handleSave = useCallback(() => {
    updateMutation.mutate(
      {
        name: name.trim() || undefined,
        sort_order: Number.parseInt(sortOrder, 10) || 0,
      },
      { onSuccess: () => setEditing(false) },
    );
  }, [name, sortOrder, updateMutation]);

  const handleToggleActive = useCallback(
    (checked: boolean) => {
      updateMutation.mutate({ is_active: checked });
    },
    [updateMutation],
  );

  if (editing) {
    return (
      <tr className="border-b border-[var(--color-border-default)]">
        <td className="px-4 py-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
        </td>
        <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">{track.slug}</td>
        <td className="px-4 py-3">
          <Input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-20 text-sm"
          />
        </td>
        <td className="px-4 py-3">
          <Badge variant={track.is_active ? "success" : "default"} size="sm">
            {track.is_active ? "Active" : "Inactive"}
          </Badge>
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              loading={updateMutation.isPending}
              disabled={!name.trim()}
            >
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-3 text-sm font-medium text-[var(--color-text-primary)]">
        {track.name}
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-muted)]">{track.slug}</td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{track.sort_order}</td>
      <td className="px-4 py-3">
        <Toggle checked={track.is_active} onChange={handleToggleActive} size="sm" />
      </td>
      <td className="px-4 py-3">
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function TrackManager() {
  const { data: tracks, isLoading } = useTracks(true);
  const [showAdd, setShowAdd] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <Stack gap={4}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Tracks</h2>
        {!showAdd && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Plus size={16} />}
            onClick={() => setShowAdd(true)}
          >
            Add Track
          </Button>
        )}
      </div>

      {showAdd && <AddTrackForm onClose={() => setShowAdd(false)} />}

      <Card elevation="sm" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Slug
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Order
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Active
                </th>
                <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {!tracks || tracks.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                  >
                    No tracks defined. Click "Add Track" to create one.
                  </td>
                </tr>
              ) : (
                tracks.map((track) => <TrackRow key={track.id} track={track} />)
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </Stack>
  );
}
