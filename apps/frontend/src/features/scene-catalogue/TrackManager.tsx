/**
 * Admin panel for managing tracks (PRD-111).
 *
 * Lists tracks with inline editing for name and sort_order,
 * an add form, and deactivate toggle.
 */

import { useCallback, useState } from "react";

import { Stack } from "@/components/layout";
import { Button, Input, Toggle ,  ContextLoader } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { generateSnakeSlug } from "@/lib/format";
import {
  TERMINAL_BODY,
  TERMINAL_DIVIDER,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_PANEL,
  TERMINAL_ROW_HOVER,
  TERMINAL_STATUS_COLORS,
  TERMINAL_TH,
} from "@/lib/ui-classes";
import { usePipelineContextSafe } from "@/features/pipelines";
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
      <tr className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}>
        <td className="px-3 py-1.5">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="text-sm" />
        </td>
        <td className="px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)]">{track.slug}</td>
        <td className="px-3 py-1.5">
          <Input
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            className="w-20 text-sm"
          />
        </td>
        <td className="px-3 py-1.5">
          <span className={cn("font-mono text-xs", TERMINAL_STATUS_COLORS[track.is_active ? "active" : "pending"])}>
            {track.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td className="px-3 py-1.5">
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="xs"
              onClick={handleSave}
              loading={updateMutation.isPending}
              disabled={!name.trim()}
            >
              Save
            </Button>
            <Button variant="secondary" size="xs" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className={cn(TERMINAL_DIVIDER, TERMINAL_ROW_HOVER)}>
      <td className="px-3 py-1.5 font-mono text-xs text-cyan-400">
        {track.name}
      </td>
      <td className="px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)]">{track.slug}</td>
      <td className="px-3 py-1.5 font-mono text-xs text-[var(--color-text-muted)]">{track.sort_order}</td>
      <td className="px-3 py-1.5">
        <Toggle checked={track.is_active} onChange={handleToggleActive} size="sm" />
      </td>
      <td className="px-3 py-1.5">
        <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
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
  const pipelineCtx = usePipelineContextSafe();
  const { data: tracks, isLoading } = useTracks(true, pipelineCtx?.pipelineId);
  const [showAdd, setShowAdd] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <ContextLoader size={64} />
      </div>
    );
  }

  return (
    <Stack gap={4}>
      {showAdd && <AddTrackForm onClose={() => setShowAdd(false)} />}

      <div className={TERMINAL_PANEL}>
        <div className={cn(TERMINAL_HEADER, "flex items-center justify-between")}>
          <span className={TERMINAL_HEADER_TITLE}>Tracks</span>
          {!showAdd && (
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={14} />}
              onClick={() => setShowAdd(true)}
            >
              Add Track
            </Button>
          )}
        </div>
        <div className={TERMINAL_BODY}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className={TERMINAL_DIVIDER}>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Name</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Slug</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Order</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Active</th>
                  <th className={cn(TERMINAL_TH, "px-3 py-1.5")}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!tracks || tracks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center font-mono text-xs text-[var(--color-text-muted)]"
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
        </div>
      </div>
    </Stack>
  );
}
