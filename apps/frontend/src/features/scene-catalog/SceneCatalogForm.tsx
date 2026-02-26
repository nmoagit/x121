/**
 * Drawer form for creating/editing scene catalog entries (PRD-111).
 *
 * Includes name, slug (auto-generated on create, readonly on edit),
 * description, clothes-off transition toggle, track assignment checkboxes,
 * and sort order.
 */

import { useCallback, useState } from "react";

import { Drawer } from "@/components/composite/Drawer";
import { Stack } from "@/components/layout";
import { Button, Checkbox, Input, Toggle } from "@/components/primitives";

import {
  useCreateSceneCatalogEntry,
  useUpdateSceneCatalogEntry,
} from "./hooks/use-scene-catalog";
import { useTracks } from "./hooks/use-tracks";
import type { CreateSceneCatalogEntry, SceneCatalogEntry } from "./types";

/* --------------------------------------------------------------------------
   Slug generation
   -------------------------------------------------------------------------- */

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SceneCatalogFormProps {
  entry?: SceneCatalogEntry;
  open: boolean;
  onClose: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SceneCatalogForm({ entry, open, onClose }: SceneCatalogFormProps) {
  const isEdit = entry !== undefined;

  const [name, setName] = useState(entry?.name ?? "");
  const [slug, setSlug] = useState(entry?.slug ?? "");
  const [description, setDescription] = useState(entry?.description ?? "");
  const [hasClothesOff, setHasClothesOff] = useState(
    entry?.has_clothes_off_transition ?? false,
  );
  const [sortOrder, setSortOrder] = useState(
    entry?.sort_order?.toString() ?? "0",
  );
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(
    new Set(entry?.tracks.map((t) => t.id) ?? []),
  );

  const { data: tracks } = useTracks();
  const createMutation = useCreateSceneCatalogEntry();
  const updateMutation = useUpdateSceneCatalogEntry(entry?.id ?? 0);

  const isPending = createMutation.isPending || updateMutation.isPending;
  const isNameEmpty = name.trim() === "";

  const handleNameChange = useCallback(
    (value: string) => {
      setName(value);
      if (!isEdit) {
        setSlug(toSlug(value));
      }
    },
    [isEdit],
  );

  const handleTrackToggle = useCallback((trackId: number, checked: boolean) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(trackId);
      } else {
        next.delete(trackId);
      }
      return next;
    });
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (isNameEmpty) return;

      if (isEdit) {
        updateMutation.mutate(
          {
            name: name.trim(),
            description: description.trim() || null,
            has_clothes_off_transition: hasClothesOff,
            sort_order: Number.parseInt(sortOrder, 10) || 0,
            track_ids: Array.from(selectedTrackIds),
          },
          { onSuccess: () => onClose() },
        );
      } else {
        const data: CreateSceneCatalogEntry = {
          name: name.trim(),
          slug: slug.trim(),
          description: description.trim() || null,
          has_clothes_off_transition: hasClothesOff,
          sort_order: Number.parseInt(sortOrder, 10) || 0,
          track_ids: Array.from(selectedTrackIds),
        };

        createMutation.mutate(data, { onSuccess: () => onClose() });
      }
    },
    [
      isEdit,
      isNameEmpty,
      name,
      slug,
      description,
      hasClothesOff,
      sortOrder,
      selectedTrackIds,
      createMutation,
      updateMutation,
      onClose,
    ],
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit Scene" : "Add Scene"}
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <Stack gap={5}>
          <Input
            label="Name"
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Scene name"
            required
          />

          <Input
            label="Slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="auto-generated"
            disabled={isEdit}
          />

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="catalog-description"
              className="text-sm font-medium text-[var(--color-text-secondary)]"
            >
              Description
            </label>
            <textarea
              id="catalog-description"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] resize-y focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>

          <Toggle
            checked={hasClothesOff}
            onChange={setHasClothesOff}
            label="Has Clothes-Off Transition"
          />

          <Input
            label="Sort Order"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />

          {/* Track assignment */}
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              Tracks
            </span>
            {!tracks || tracks.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                No tracks available. Create tracks first.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {tracks.map((track) => (
                  <Checkbox
                    key={track.id}
                    checked={selectedTrackIds.has(track.id)}
                    onChange={(checked) => handleTrackToggle(track.id, checked)}
                    label={track.name}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={isNameEmpty}
              loading={isPending}
            >
              {isEdit ? "Save Changes" : "Create Scene"}
            </Button>
          </div>
        </Stack>
      </form>
    </Drawer>
  );
}
