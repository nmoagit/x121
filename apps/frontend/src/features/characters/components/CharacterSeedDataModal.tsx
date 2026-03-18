/**
 * Modal showing a character's seed images and metadata JSONs,
 * with drop zones for uploading missing items.
 *
 * Smart drop validation:
 * - Single file on a slot: checks filename for slot mismatch and character name mismatch
 * - Multiple files / directory: auto-classifies images (clothed/topless) and
 *   JSONs (bio/tov) by filename, shows confirmation before uploading
 * - Supports dropping all 4 files (2 images + 2 JSONs) at once
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite";
import { Badge, Button, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useImageVariants, useUploadImageVariant } from "@/features/images/hooks/use-image-variants";
import { IMAGE_ACCEPT_STRING, IMAGE_VARIANT_STATUS_LABEL, statusBadgeVariant, type ImageVariant, type ImageVariantStatusId } from "@/features/images/types";
import { variantImageUrl, variantThumbnailUrl } from "@/features/images/utils";
import { useUpdateCharacterMetadata } from "@/features/characters/hooks/use-character-detail";
import { SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/characters/types";
import { isImageFile, readFileAsJson } from "@/lib/file-types";
import { cn } from "@/lib/cn";
import { Select } from "@/components/primitives";
import { AlertTriangle, Eye, Plus, Trash2 } from "@/tokens/icons";
import type { Character } from "@/features/projects/types";

import { SeedDataDropSlot } from "./SeedDataDropSlot";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface GroupOption {
  value: string;
  label: string;
}

interface CharacterSeedDataModalProps {
  character: Character | null;
  projectId: number;
  onClose: () => void;
  /** Group select options for the character's project (includes "No group"). */
  groupOptions?: GroupOption[];
  /** Called when the user changes the character's group. `null` = ungroup. */
  onGroupChange?: (characterId: number, groupId: number | null) => void;
  /** Called when the user creates a new group. Returns the new group ID. */
  onCreateGroup?: (name: string) => Promise<number>;
  /** Called when the user requests to delete the character. */
  onDelete?: (characterId: number) => void;
}

const VARIANT_SLOTS = [
  { type: "clothed", label: "Clothed" },
  { type: "topless", label: "Topless" },
] as const;

type JsonSlot = "bio" | "tov";
type ImageSlot = "clothed" | "topless";

/** A JSON file assignment pending confirmation. */
interface JsonAssignment { kind: "json"; slot: JsonSlot; file: File; parsed: Record<string, unknown> }
/** An image file assignment pending confirmation. */
interface ImageAssignment { kind: "image"; slot: ImageSlot; label: string; file: File }

/** Pending upload awaiting user confirmation. */
interface PendingUpload {
  jsonAssignments: JsonAssignment[];
  imageAssignments: ImageAssignment[];
  warnings: string[];
}

/* --------------------------------------------------------------------------
   Validation / classification helpers
   -------------------------------------------------------------------------- */

/** Normalize a name for fuzzy comparison. */
function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[_\-\s.]+/g, "");
}

/** Check if a word appears as a distinct segment in text (separated by _-. or boundaries). */
function hasSegment(text: string, word: string): boolean {
  return new RegExp(`(^|[_\\-.\\s])${word}([_\\-.\\s]|$)`).test(text.toLowerCase());
}

/** Check if a filename contains a character name that does NOT match. */
function detectNameMismatchInFilename(filename: string, characterName: string): string | null {
  const charNorm = normalizeName(characterName);

  // Generic filenames with no name info
  if (/^(bio|tov|metadata|clothed|topless)\.(json|png|jpg|jpeg|webp)$/i.test(filename)) return null;

  // Strip known suffixes/prefixes to isolate the name portion
  const stem = filename
    .replace(/\.(json|txt|png|jpg|jpeg|webp)$/i, "")
    .replace(/[_-]?(bio|tov|metadata|clothed|topless)$/i, "")
    .replace(/^(bio|tov|metadata|clothed|topless)[_-]?/i, "");

  if (!stem || stem.length < 3) return null;

  const stemNorm = normalizeName(stem);
  if (stemNorm.includes(charNorm) || charNorm.includes(stemNorm)) return null;

  // Check individual name parts
  const charParts = characterName.toLowerCase().split(/[\s_-]+/).filter((p) => p.length > 2);
  const stemParts = stem.toLowerCase().split(/[\s_-]+/).filter((p) => p.length > 2);
  const hasOverlap = charParts.some((cp) => stemParts.some((sp) => sp.includes(cp) || cp.includes(sp)));
  if (hasOverlap) return null;

  return `Filename "${filename}" doesn't match character "${characterName}"`;
}

/** Detect if a JSON file dropped on a specific slot is for the other slot. */
function detectJsonSlotMismatch(filename: string, targetSlot: JsonSlot): string | null {
  const lower = filename.toLowerCase();
  const isTov = hasSegment(lower, "tov");
  const isBio = hasSegment(lower, "bio");
  if (targetSlot === "bio" && isTov && !isBio) {
    return `"${filename}" looks like a ToV file but was dropped on the Bio slot`;
  }
  if (targetSlot === "tov" && isBio && !isTov) {
    return `"${filename}" looks like a Bio file but was dropped on the ToV slot`;
  }
  return null;
}

/** Detect if an image dropped on a specific slot is for the other slot. */
function detectImageSlotMismatch(filename: string, targetSlot: ImageSlot): string | null {
  const lower = filename.toLowerCase();
  const isClothed = hasSegment(lower, "clothed");
  const isTopless = hasSegment(lower, "topless");
  if (targetSlot === "clothed" && isTopless && !isClothed) {
    return `"${filename}" looks like a topless image but was dropped on the Clothed slot`;
  }
  if (targetSlot === "topless" && isClothed && !isTopless) {
    return `"${filename}" looks like a clothed image but was dropped on the Topless slot`;
  }
  return null;
}

/** Search JSON data for the character's name to detect a possible mismatch. */
function detectNameMismatchInData(
  data: Record<string, unknown>,
  characterName: string,
): string | null {
  const charParts = characterName.toLowerCase().split(/[\s_-]+/).filter((p) => p.length > 2);
  if (charParts.length === 0) return null;

  const allStrings: string[] = [];
  for (const val of Object.values(data)) {
    if (typeof val === "string") allStrings.push(val.replace(/\{bot_name\}/gi, characterName));
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") allStrings.push(item.replace(/\{bot_name\}/gi, characterName));
      }
    }
  }
  for (const key of Object.keys(data)) {
    allStrings.push(key.replace(/_/g, " "));
  }

  const blob = allStrings.join(" ").toLowerCase();
  if (charParts.every((part) => blob.includes(part))) return null;
  if (charParts.some((part) => blob.includes(part))) return null;
  if (allStrings.length < 3) return null;

  return `Character name "${characterName}" not found in file data — verify this is the correct file`;
}

/** Classify a filename as bio or tov. */
function classifyJson(filename: string): JsonSlot | null {
  const lower = filename.toLowerCase();
  if (hasSegment(lower, "bio")) return "bio";
  if (hasSegment(lower, "tov")) return "tov";
  return null;
}

/** Classify a filename as clothed or topless image. */
function classifyImage(filename: string): ImageSlot | null {
  const lower = filename.toLowerCase();
  if (hasSegment(lower, "clothed")) return "clothed";
  if (hasSegment(lower, "topless")) return "topless";
  return null;
}

/** Read all file entries from a directory. */
async function readDirFiles(dirEntry: FileSystemDirectoryEntry): Promise<File[]> {
  const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const reader = dirEntry.createReader();
    function readBatch() {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else { all.push(...batch); readBatch(); }
      }, reject);
    }
    readBatch();
  });
  const files: File[] = [];
  for (const entry of entries) {
    if (entry.isFile) {
      files.push(await new Promise<File>((resolve, reject) => {
        (entry as FileSystemFileEntry).file(resolve, reject);
      }));
    }
  }
  return files;
}

/** Collect all files from a drop event (handles directories). */
async function collectDroppedFiles(e: React.DragEvent): Promise<File[]> {
  const files: File[] = [];
  const items = e.dataTransfer.items;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || item.kind !== "file") continue;

    const entry = item.webkitGetAsEntry?.();
    if (entry?.isDirectory) {
      const dirFiles = await readDirFiles(entry as FileSystemDirectoryEntry);
      files.push(...dirFiles);
    } else {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  return files;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CharacterSeedDataModal({ character, projectId: _projectId, onClose, groupOptions, onGroupChange, onCreateGroup, onDelete }: CharacterSeedDataModalProps) {
  const characterId = character?.id ?? 0;
  const open = character !== null;

  const { data: variants, isLoading: variantsLoading } = useImageVariants(characterId);
  const uploadVariant = useUploadImageVariant(characterId);
  const updateMetadata = useUpdateCharacterMetadata(characterId);

  const metadata = character?.metadata ?? null;

  const [viewingJson, setViewingJson] = useState<{ label: string; data: unknown } | null>(null);
  const [jsonUploading, setJsonUploading] = useState<JsonSlot | "both" | null>(null);
  const [imageUploading, setImageUploading] = useState<ImageSlot | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function findVariant(variantType: string): ImageVariant | undefined {
    if (!variants) return undefined;
    const matching = variants.filter(
      (v) => v.variant_type?.toLowerCase() === variantType.toLowerCase() && !v.deleted_at,
    );
    if (matching.length === 0) return undefined;
    return matching.sort((a, b) => {
      if (a.is_hero !== b.is_hero) return a.is_hero ? -1 : 1;
      if (a.status_id !== b.status_id) {
        if (a.status_id === 2) return -1;
        if (b.status_id === 2) return 1;
      }
      return b.version - a.version;
    })[0];
  }

  const bioData = metadata?.[SOURCE_KEY_BIO] ?? null;
  const tovData = metadata?.[SOURCE_KEY_TOV] ?? null;
  const hasBio = bioData != null;
  const hasTov = tovData != null;
  const charName = character?.name ?? "";

  const slotLabel = (slot: string) => {
    const labels: Record<string, string> = { bio: "Bio", tov: "ToV", clothed: "Clothed", topless: "Topless" };
    return labels[slot] ?? slot;
  };

  /* --- Execute confirmed uploads --- */

  const executePendingUpload = useCallback(async (pending: PendingUpload) => {
    setPendingUpload(null);

    // Upload images
    for (const img of pending.imageAssignments) {
      setImageUploading(img.slot);
      try {
        await uploadVariant.mutateAsync({ file: img.file, variant_type: img.slot, variant_label: img.label });
      } finally {
        setImageUploading(null);
      }
    }

    // Upload JSONs
    const jsons = pending.jsonAssignments;
    if (jsons.length > 0) {
      setJsonUploading(jsons.length > 1 ? "both" : jsons[0]!.slot);
      try {
        const update: Record<string, unknown> = {};
        for (const j of jsons) {
          update[j.slot === "bio" ? SOURCE_KEY_BIO : SOURCE_KEY_TOV] = j.parsed;
        }
        await updateMetadata.mutateAsync(update);
      } finally {
        setJsonUploading(null);
      }
    }
  }, [uploadVariant, updateMetadata]);

  /* --- Single-file handlers for targeted slot drops --- */

  async function handleSingleJsonDrop(slot: JsonSlot, file: File) {
    const parsed = await readFileAsJson(file);
    if (!parsed) return;

    const warnings: string[] = [];
    const slotWarn = detectJsonSlotMismatch(file.name, slot);
    if (slotWarn) warnings.push(slotWarn);
    const nameWarn = detectNameMismatchInFilename(file.name, charName);
    if (nameWarn) warnings.push(nameWarn);
    if (!nameWarn) {
      const dataWarn = detectNameMismatchInData(parsed, charName);
      if (dataWarn) warnings.push(dataWarn);
    }

    if (warnings.length > 0) {
      setPendingUpload({ jsonAssignments: [{ kind: "json", slot, file, parsed }], imageAssignments: [], warnings });
      return;
    }

    setJsonUploading(slot);
    try {
      await updateMetadata.mutateAsync({ [slot === "bio" ? SOURCE_KEY_BIO : SOURCE_KEY_TOV]: parsed });
    } finally {
      setJsonUploading(null);
    }
  }

  function handleSingleImageDrop(slot: ImageSlot, label: string, file: File) {
    const warnings: string[] = [];
    const slotWarn = detectImageSlotMismatch(file.name, slot);
    if (slotWarn) warnings.push(slotWarn);
    const nameWarn = detectNameMismatchInFilename(file.name, charName);
    if (nameWarn) warnings.push(nameWarn);

    if (warnings.length > 0) {
      setPendingUpload({ jsonAssignments: [], imageAssignments: [{ kind: "image", slot, label, file }], warnings });
      return;
    }

    uploadVariant.mutate({ file, variant_type: slot, variant_label: label });
  }

  /* --- Unified multi-file / directory handler (modal-level) --- */

  const handleUnifiedDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const allFiles = await collectDroppedFiles(e);
    if (allFiles.length === 0) return;

    const jsonFiles: File[] = [];
    const imgFiles: File[] = [];
    const ignored: string[] = [];

    for (const f of allFiles) {
      const lower = f.name.toLowerCase();
      if (lower.endsWith(".json")) jsonFiles.push(f);
      else if (isImageFile(f.name)) imgFiles.push(f);
      else ignored.push(f.name);
    }

    // Single JSON, no images → delegate to slot handler
    if (jsonFiles.length === 1 && imgFiles.length === 0) {
      const file = jsonFiles[0]!;
      const guessedSlot = classifyJson(file.name) ?? "bio";
      handleSingleJsonDrop(guessedSlot, file);
      return;
    }

    // Single image, no JSONs → delegate to slot handler
    if (imgFiles.length === 1 && jsonFiles.length === 0) {
      const file = imgFiles[0]!;
      const slot = classifyImage(file.name) ?? "clothed";
      const label = slotLabel(slot);
      handleSingleImageDrop(slot, label, file);
      return;
    }

    // Multiple files — classify everything
    const warnings: string[] = [];
    const jsonAssignments: JsonAssignment[] = [];
    const imageAssignments: ImageAssignment[] = [];
    const unclassified: string[] = [];

    // Classify JSONs
    for (const file of jsonFiles) {
      const slot = classifyJson(file.name);
      if (slot) {
        const parsed = await readFileAsJson(file);
        if (parsed) {
          const nameWarn = detectNameMismatchInFilename(file.name, charName);
          if (nameWarn) warnings.push(nameWarn);
          else {
            const dataWarn = detectNameMismatchInData(parsed, charName);
            if (dataWarn) warnings.push(dataWarn);
          }
          jsonAssignments.push({ kind: "json", slot, file, parsed });
        }
      } else {
        unclassified.push(file.name);
      }
    }

    // Classify images
    for (const file of imgFiles) {
      const slot = classifyImage(file.name);
      if (slot) {
        const nameWarn = detectNameMismatchInFilename(file.name, charName);
        if (nameWarn) warnings.push(nameWarn);
        imageAssignments.push({ kind: "image", slot, label: slotLabel(slot), file });
      } else {
        unclassified.push(file.name);
      }
    }

    if (unclassified.length > 0) {
      warnings.push(`Could not classify: ${unclassified.join(", ")}`);
    }
    if (ignored.length > 0) {
      warnings.push(`Ignored unsupported files: ${ignored.join(", ")}`);
    }

    if (jsonAssignments.length === 0 && imageAssignments.length === 0) {
      warnings.push("No files could be classified as bio, tov, clothed, or topless");
      setPendingUpload({ jsonAssignments: [], imageAssignments: [], warnings });
      return;
    }

    // Deduplicate slots (keep first per slot)
    const seenJson = new Set<JsonSlot>();
    const dedupedJson: JsonAssignment[] = [];
    for (const a of jsonAssignments) {
      if (seenJson.has(a.slot)) {
        warnings.push(`Multiple files classified as ${slotLabel(a.slot)} — using "${dedupedJson.find((d) => d.slot === a.slot)?.file.name}"`);
      } else {
        seenJson.add(a.slot);
        dedupedJson.push(a);
      }
    }

    const seenImg = new Set<ImageSlot>();
    const dedupedImg: ImageAssignment[] = [];
    for (const a of imageAssignments) {
      if (seenImg.has(a.slot)) {
        warnings.push(`Multiple files classified as ${slotLabel(a.slot)} — using "${dedupedImg.find((d) => d.slot === a.slot)?.file.name}"`);
      } else {
        seenImg.add(a.slot);
        dedupedImg.push(a);
      }
    }

    // Always confirm multi-file drops
    setPendingUpload({ jsonAssignments: dedupedJson, imageAssignments: dedupedImg, warnings });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charName, updateMetadata, uploadVariant]);

  const isLoading = variantsLoading;
  const totalAssignments = (pendingUpload?.jsonAssignments.length ?? 0) + (pendingUpload?.imageAssignments.length ?? 0);

  return (
    <Modal open={open} onClose={onClose} title={character?.name ?? ""} size="2xl">
      {isLoading ? (
        <div className="flex items-center justify-center py-[var(--spacing-8)]">
          <Spinner size="md" />
        </div>
      ) : (
        /* Modal-level drop zone catches multi-file / directory / mixed drops */
        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={handleUnifiedDrop}
        >
          <div className="grid grid-cols-1 gap-[var(--spacing-6)] sm:grid-cols-2">
            {/* Left column: Seed Images */}
            <Stack gap={4}>
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                Seed Images
              </h3>
              {VARIANT_SLOTS.map(({ type, label }) => {
                const variant = findVariant(type);
                const isUploading = (uploadVariant.isPending && uploadVariant.variables?.variant_type === type)
                  || imageUploading === type;

                if (variant) {
                  return (
                    <div key={type} className="space-y-[var(--spacing-1)]">
                      <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(variantImageUrl(variant.file_path))}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <img
                          src={variantThumbnailUrl(variant.id, 512)}
                          alt={`${label} seed image`}
                          className="max-h-48 rounded-[var(--radius-md)] object-contain"
                        />
                      </button>
                      <div className="flex items-center gap-[var(--spacing-2)]">
                        <Badge variant={statusBadgeVariant(variant.status_id as ImageVariantStatusId)}>
                          {IMAGE_VARIANT_STATUS_LABEL[variant.status_id as ImageVariantStatusId] ?? "Unknown"}
                        </Badge>
                        {variant.is_hero && <Badge variant="info">Hero</Badge>}
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={type} className="space-y-[var(--spacing-1)]">
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
                    <SeedDataDropSlot
                      accept={IMAGE_ACCEPT_STRING}
                      label={`${label} image`}
                      loading={isUploading}
                      onFile={(file) => handleSingleImageDrop(type, label, file)}
                    />
                  </div>
                );
              })}
            </Stack>

            {/* Right column: Metadata Files */}
            <Stack gap={4}>
              <h3 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
                Metadata Files
              </h3>
              {([
                { slot: "bio" as const, label: "Bio", data: bioData, has: hasBio },
                { slot: "tov" as const, label: "ToV (Tone of Voice)", data: tovData, has: hasTov },
              ]).map(({ slot, label, data, has }) => (
                <div key={slot} className="space-y-[var(--spacing-1)]">
                  <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
                  {has && data ? (
                    <button
                      type="button"
                      onClick={() => setViewingJson({ label: `${label} — ${slot}.json`, data })}
                      className={cn(
                        "w-full text-left rounded-[var(--radius-md)] border border-[var(--color-border-secondary)]",
                        "bg-[var(--color-surface-tertiary)] p-[var(--spacing-3)]",
                        "cursor-pointer hover:border-[var(--color-text-muted)] transition-colors",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-[var(--color-text-primary)]">{slot}.json</span>
                        <Eye size={14} className="text-[var(--color-text-muted)]" />
                      </div>
                    </button>
                  ) : (
                    <SeedDataDropSlot
                      accept=".json,application/json"
                      label={`${label} JSON`}
                      loading={jsonUploading === slot || jsonUploading === "both"}
                      onFile={(file) => handleSingleJsonDrop(slot, file)}
                    />
                  )}
                </div>
              ))}
            </Stack>
          </div>

          {/* Hint */}
          <p className="mt-[var(--spacing-4)] text-xs text-[var(--color-text-muted)] text-center">
            Tip: drop a folder or multiple files anywhere to auto-assign images &amp; metadata
          </p>

          {/* Character management: group assignment + delete */}
          {(groupOptions || onDelete) && (
            <div className="mt-[var(--spacing-4)] pt-[var(--spacing-4)] border-t border-[var(--color-border-secondary)]">
              <div className="flex items-end gap-[var(--spacing-3)]">
                {/* Group selector */}
                {groupOptions && onGroupChange && (
                  <div className="flex-1">
                    {creatingGroup ? (
                      <div className="space-y-[var(--spacing-2)]">
                        <label className="text-xs font-medium text-[var(--color-text-muted)]">New Group</label>
                        <div className="flex gap-[var(--spacing-2)]">
                          <input
                            type="text"
                            value={newGroupName}
                            onChange={(e) => setNewGroupName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && newGroupName.trim() && onCreateGroup) {
                                onCreateGroup(newGroupName.trim()).then((id) => {
                                  onGroupChange(characterId, id);
                                  setCreatingGroup(false);
                                  setNewGroupName("");
                                });
                              }
                            }}
                            placeholder="Group name"
                            autoFocus
                            className={cn(
                              "flex-1 rounded-[var(--radius-sm)] border border-[var(--color-border-default)]",
                              "bg-[var(--color-surface-primary)] px-[var(--spacing-2)] py-[var(--spacing-1)]",
                              "text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
                              "focus:outline-none focus:border-[var(--color-border-accent)]",
                            )}
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<Plus size={14} />}
                            disabled={!newGroupName.trim() || !onCreateGroup}
                            onClick={() => {
                              if (!newGroupName.trim() || !onCreateGroup) return;
                              onCreateGroup(newGroupName.trim()).then((id) => {
                                onGroupChange(characterId, id);
                                setCreatingGroup(false);
                                setNewGroupName("");
                              });
                            }}
                          >
                            Create
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => { setCreatingGroup(false); setNewGroupName(""); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Select
                        label="Group"
                        options={[
                          ...groupOptions,
                          ...(onCreateGroup ? [{ value: "__new__", label: "+ New group" }] : []),
                        ]}
                        value={character?.group_id ? String(character.group_id) : ""}
                        onChange={(val) => {
                          if (val === "__new__") {
                            setCreatingGroup(true);
                            setNewGroupName("");
                          } else {
                            onGroupChange(characterId, val ? Number(val) : null);
                          }
                        }}
                      />
                    )}
                  </div>
                )}

                {/* Delete button */}
                {onDelete && !confirmDelete && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-[var(--color-action-danger)] hover:text-[var(--color-action-danger-hover)] shrink-0"
                    icon={<Trash2 size={14} />}
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete
                  </Button>
                )}
                {onDelete && confirmDelete && (
                  <div className="flex items-center gap-[var(--spacing-2)] shrink-0">
                    <span className="text-xs text-[var(--color-action-danger)]">Delete this character?</span>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => { onDelete(characterId); onClose(); }}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setConfirmDelete(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation modal */}
      <Modal
        open={pendingUpload !== null}
        onClose={() => setPendingUpload(null)}
        title="Confirm Upload"
        size="md"
      >
        {pendingUpload && (
          <Stack gap={4}>
            {pendingUpload.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-[var(--spacing-2)] text-sm text-[var(--color-text-warning)]">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}

            {totalAssignments > 0 && (
              <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] p-[var(--spacing-3)] space-y-[var(--spacing-1)]">
                <p className="text-xs font-medium text-[var(--color-text-muted)] mb-[var(--spacing-2)]">
                  Files to upload:
                </p>
                {pendingUpload.imageAssignments.map(({ slot, file }) => (
                  <div key={`img-${slot}`} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-primary)] truncate">{file.name}</span>
                    <Badge variant="info" size="sm">{slotLabel(slot)} image</Badge>
                  </div>
                ))}
                {pendingUpload.jsonAssignments.map(({ slot, file }) => (
                  <div key={`json-${slot}`} className="flex items-center justify-between text-sm">
                    <span className="text-[var(--color-text-primary)] truncate">{file.name}</span>
                    <Badge variant="default" size="sm">{slotLabel(slot)}</Badge>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-[var(--spacing-2)]">
              <Button variant="secondary" size="sm" onClick={() => setPendingUpload(null)}>
                Cancel
              </Button>
              {totalAssignments > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => executePendingUpload(pendingUpload)}
                >
                  Upload{pendingUpload.warnings.length > 0 ? " Anyway" : ""}
                </Button>
              )}
            </div>
          </Stack>
        )}
      </Modal>

      {/* JSON viewer modal */}
      <Modal
        open={viewingJson !== null}
        onClose={() => setViewingJson(null)}
        title={viewingJson?.label ?? ""}
        size="lg"
      >
        {viewingJson && (
          <pre className="max-h-[70vh] overflow-auto rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] p-[var(--spacing-4)] text-xs text-[var(--color-text-secondary)] font-mono">
            {JSON.stringify(viewingJson.data, null, 2)}
          </pre>
        )}
      </Modal>

      {/* Full-size image lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 cursor-pointer"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={(e) => e.key === "Escape" && setLightboxUrl(null)}
          role="button"
          tabIndex={0}
        >
          <img
            src={lightboxUrl}
            alt="Full size"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-[var(--radius-md)]"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </Modal>
  );
}
