/**
 * Modal showing a avatar's seed images and metadata JSONs,
 * with drop zones for uploading missing items.
 *
 * Smart drop validation:
 * - Single file on a slot: checks filename for slot mismatch and avatar name mismatch
 * - Multiple files / directory: auto-classifies images (clothed/topless) and
 *   JSONs (bio/tov) by filename, shows confirmation before uploading
 * - Supports dropping all 4 files (2 images + 2 JSONs) at once
 */

import { Fragment, useCallback, useState } from "react";

import { ConfirmDeleteModal, ConfirmModal, Modal } from "@/components/composite";
import { Button, Input ,  ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { useDeleteMediaVariant, useMediaVariants, useUploadMediaVariant } from "@/features/media/hooks/use-media-variants";
import { IMAGE_ACCEPT_STRING, MEDIA_VARIANT_STATUS_LABEL, type MediaVariant, type MediaVariantStatusId } from "@/features/media/types";
import { variantMediaUrl, variantThumbnailUrl } from "@/features/media/utils";
import { useUpdateAvatarMetadata, useUpdateAvatarSettings } from "@/features/avatars/hooks/use-avatar-detail";
import { useAvatarSpeeches, useImportSpeeches, useSpeechTypes } from "@/features/avatars/hooks/use-avatar-speeches";
import { useLanguages } from "@/features/avatars/hooks/use-languages";
import { useSpeechActions } from "@/features/avatars/hooks/use-speech-actions";
import { getVoiceId, SETTING_KEY_VOICE, SOURCE_KEY_BIO, SOURCE_KEY_TOV } from "@/features/avatars/types";
import type { AvatarSpeech } from "@/features/avatars/types";
import { FlagIcon  } from "@/components/primitives";
import { isImageFile, readFileAsJson, readFileText } from "@/lib/file-types";
import { cn } from "@/lib/cn";
import { ICON_ACTION_BTN, ICON_ACTION_BTN_DANGER, TERMINAL_BODY, TERMINAL_DIVIDER, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_INPUT, TERMINAL_LABEL, TERMINAL_PANEL, TERMINAL_ROW_HOVER, TERMINAL_STATUS_COLORS, TERMINAL_TEXTAREA, TERMINAL_TH } from "@/lib/ui-classes";
import { Select  } from "@/components/primitives";
import { AlertTriangle, Edit3, Eye, FileText, Image, MessageSquare, Mic, Plus, Settings, Trash2, Upload } from "@/tokens/icons";
import { hasVoiceId } from "@/features/avatars/types";
import type { Avatar, UpdateAvatar } from "@/features/projects/types";
import { CHARACTER_STATUS_ID_ACTIVE, STATUS_LABELS } from "@/features/projects/types";

import { SeedDataDropSlot } from "./SeedDataDropSlot";
import { TYPO_DATA, TYPO_DATA_CYAN, TYPO_DATA_MUTED, TYPO_DATA_WARNING } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface GroupOption {
  value: string;
  label: string;
}

/** A seed slot definition — can come from pipeline config or hardcoded defaults. */
interface VariantSlot {
  type: string;
  label: string;
}

/** Default variant slots when no pipeline seed slots are provided. */
const DEFAULT_variantSlots: VariantSlot[] = [
  { type: "clothed", label: "Clothed" },
  { type: "topless", label: "Topless" },
];

interface AvatarSeedDataModalProps {
  avatar: Avatar | null;
  projectId: number;
  onClose: () => void;
  /** Group select options for the avatar's project (includes "No group"). */
  groupOptions?: GroupOption[];
  /** Called when the user changes the avatar's group. `null` = ungroup. */
  onGroupChange?: (avatarId: number, groupId: number | null) => void;
  /** Called when the user creates a new group. Returns the new group ID. */
  onCreateGroup?: (name: string) => Promise<number>;
  /** Called when the user requests to delete the avatar. */
  onDelete?: (avatarId: number) => void;
  /** Called when the user updates name, status, or group via the management section. */
  onUpdate?: (avatarId: number, data: UpdateAvatar) => void;
  /** Whether an update mutation is in-flight. */
  updating?: boolean;
  /** Pipeline-defined seed slots. When provided, replaces the default clothed/topless slots. */
  seedSlots?: VariantSlot[];
}

/** Image with loading spinner placeholder. */
function SeedImage({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative h-48">
      {!loaded && (
        <div className="absolute inset-0 rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] flex items-center justify-center">
          <ContextLoader size={32} />
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={cn(
          "max-h-48 rounded-[var(--radius-md)] object-contain transition-opacity",
          loaded ? "opacity-100" : "opacity-0",
        )}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

type JsonSlot = "bio" | "tov";
type ImageSlot = string;

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

/** Build a regex that matches generic filenames (slot names + metadata types). */
function buildGenericFilenamePattern(slotNames: string[]): RegExp {
  const terms = ["bio", "tov", "metadata", ...slotNames.map((s) => s.toLowerCase())];
  const unique = [...new Set(terms)].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const joined = unique.join("|");
  return new RegExp(`^(${joined})\\.(json|png|jpg|jpeg|webp)$`, "i");
}

/** Build a regex for stripping known slot/metadata terms from filenames. */
function buildSlotStripPattern(slotNames: string[]): RegExp {
  const terms = ["bio", "tov", "metadata", ...slotNames.map((s) => s.toLowerCase())];
  const unique = [...new Set(terms)].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const joined = unique.join("|");
  return new RegExp(`[_-]?(${joined})$`, "i");
}

function buildSlotPrefixStripPattern(slotNames: string[]): RegExp {
  const terms = ["bio", "tov", "metadata", ...slotNames.map((s) => s.toLowerCase())];
  const unique = [...new Set(terms)].map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const joined = unique.join("|");
  return new RegExp(`^(${joined})[_-]?`, "i");
}

/** Check if a filename contains a avatar name that does NOT match. */
function detectNameMismatchInFilename(
  filename: string,
  avatarName: string,
  slotNames: string[] = [],
): string | null {
  const charNorm = normalizeName(avatarName);

  // Generic filenames with no name info — dynamic based on slot names
  const genericPattern = buildGenericFilenamePattern(slotNames);
  if (genericPattern.test(filename)) return null;

  // Strip known suffixes/prefixes to isolate the name portion
  const stem = filename
    .replace(/\.(json|txt|png|jpg|jpeg|webp)$/i, "")
    .replace(buildSlotStripPattern(slotNames), "")
    .replace(buildSlotPrefixStripPattern(slotNames), "");

  if (!stem || stem.length < 3) return null;

  const stemNorm = normalizeName(stem);
  if (stemNorm.includes(charNorm) || charNorm.includes(stemNorm)) return null;

  // Check individual name parts
  const charParts = avatarName.toLowerCase().split(/[\s_-]+/).filter((p) => p.length > 2);
  const stemParts = stem.toLowerCase().split(/[\s_-]+/).filter((p) => p.length > 2);
  const hasOverlap = charParts.some((cp) => stemParts.some((sp) => sp.includes(cp) || cp.includes(sp)));
  if (hasOverlap) return null;

  return `Filename "${filename}" doesn't match avatar "${avatarName}"`;
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

/** Detect if an image dropped on a specific slot is for a different slot. */
function detectImageSlotMismatch(filename: string, targetSlot: ImageSlot, slotNames: string[] = []): string | null {
  const lower = filename.toLowerCase();
  const allSlots = slotNames.length > 0 ? slotNames : ["clothed", "topless"];

  for (const slot of allSlots) {
    if (slot === targetSlot) continue;
    if (hasSegment(lower, slot)) {
      const targetLabel = targetSlot.charAt(0).toUpperCase() + targetSlot.slice(1);
      return `"${filename}" looks like a ${slot} image but was dropped on the ${targetLabel} slot`;
    }
  }
  return null;
}

/** Search JSON data for the avatar's name to detect a possible mismatch. */
function detectNameMismatchInData(
  data: Record<string, unknown>,
  avatarName: string,
): string | null {
  const charParts = avatarName.toLowerCase().split(/[\s_-]+/).filter((p) => p.length > 2);
  if (charParts.length === 0) return null;

  const allStrings: string[] = [];
  for (const val of Object.values(data)) {
    if (typeof val === "string") allStrings.push(val.replace(/\{bot_name\}/gi, avatarName));
    if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string") allStrings.push(item.replace(/\{bot_name\}/gi, avatarName));
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

  return `Avatar name "${avatarName}" not found in file data — verify this is the correct file`;
}

/** Classify a filename as bio or tov. */
function classifyJson(filename: string): JsonSlot | null {
  const lower = filename.toLowerCase();
  if (hasSegment(lower, "bio")) return "bio";
  if (hasSegment(lower, "tov")) return "tov";
  return null;
}

/** Classify a filename as an image slot based on known slot names. */
function classifyImage(filename: string, slotNames: string[] = []): ImageSlot | null {
  const lower = filename.toLowerCase();
  const allSlots = slotNames.length > 0 ? slotNames : ["clothed", "topless"];
  for (const slot of allSlots) {
    if (hasSegment(lower, slot)) return slot;
  }
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
   Speech file helpers
   -------------------------------------------------------------------------- */

/** Slugify for matching avatar names to JSON keys. */
function slugify(n: string): string {
  return n.toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

/**
 * Extract speech entries for a specific avatar from a multi-avatar speech file.
 * Returns entries in the per-avatar import format: `[{ speech_type, text, language }]`.
 */
function extractSpeechEntries(
  text: string,
  filename: string,
  avatarName: string,
): { format: "json"; data: string } | null {
  const charSlug = slugify(avatarName);

  // Try JSON (nested object format)
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      // Find the matching avatar key
      const matchKey = Object.keys(parsed).find((k) => slugify(k) === charSlug);
      if (!matchKey) return null;

      const charData = parsed[matchKey];
      if (typeof charData !== "object" || !charData) return null;

      const entries: { speech_type: string; text: string; language: string }[] = [];
      for (const [typeName, langsVal] of Object.entries(charData as Record<string, unknown>)) {
        if (typeof langsVal !== "object" || !langsVal || Array.isArray(langsVal)) continue;
        for (const [langName, textsVal] of Object.entries(langsVal as Record<string, unknown>)) {
          if (!Array.isArray(textsVal)) continue;
          for (const t of textsVal) {
            if (typeof t === "string" && t.trim()) {
              entries.push({ speech_type: typeName, text: t, language: langName });
            }
          }
        }
      }

      if (entries.length > 0) {
        return { format: "json", data: JSON.stringify(entries) };
      }
    }
  } catch {
    // Not JSON
  }

  // Try CSV (3-col or 4-col)
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;

  const header = lines[0]!.toLowerCase();
  const cols = header.split(",").map((c) => c.trim());
  const is4col = cols.length >= 4 && (cols[1] === "speech_type" || cols[1] === "type");
  const is3col = !is4col && cols.length >= 3 && (cols[0] === "avatar" || cols[0] === "slug" || cols[0] === "avatar_slug");
  if (!is4col && !is3col) return null;

  // Infer speech type from filename for 3-col
  const stem = filename.replace(/\.[^.]+$/, "").toLowerCase()
    .replace(/_entries$/, "").replace(/_summary$/, "").replace(/s$/, "");
  const defaultType = stem || "greeting";

  const entries: { speech_type: string; text: string; language: string }[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    if (is4col) {
      const parts = line.match(/^([^,]*),([^,]*),([^,]*),(.*)$/);
      if (!parts) continue;
      if (slugify(parts[1]!) !== charSlug) continue;
      let txt = parts[4]!.trim();
      if (txt.startsWith('"') && txt.endsWith('"')) txt = txt.slice(1, -1).replace(/""/g, '"');
      if (txt) entries.push({ speech_type: parts[2]!, text: txt, language: parts[3]! });
    } else {
      const parts = line.match(/^([^,]*),([^,]*),(.*)$/);
      if (!parts) continue;
      if (slugify(parts[1]!) !== charSlug) continue;
      let txt = parts[3]!.trim();
      if (txt.startsWith('"') && txt.endsWith('"')) txt = txt.slice(1, -1).replace(/""/g, '"');
      if (txt) entries.push({ speech_type: defaultType, text: txt, language: parts[2]! });
    }
  }

  if (entries.length > 0) {
    return { format: "json", data: JSON.stringify(entries) };
  }

  return null;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function AvatarSeedDataModal({ avatar, projectId, onClose, groupOptions, onGroupChange, onCreateGroup, onDelete, onUpdate, updating, seedSlots }: AvatarSeedDataModalProps) {
  const avatarId = avatar?.id ?? 0;
  const open = avatar !== null;
  const charName = avatar?.name ?? "";

  const { data: variants, isLoading: variantsLoading } = useMediaVariants(avatarId);
  const uploadVariant = useUploadMediaVariant(avatarId);
  const updateMetadata = useUpdateAvatarMetadata(avatarId);

  const importSpeeches = useImportSpeeches(avatarId);
  const { data: speeches } = useAvatarSpeeches(avatarId);
  const { data: speechTypes } = useSpeechTypes();
  const { data: languages } = useLanguages();

  /** Resolved variant slots — uses pipeline seed slots if provided, else hardcoded defaults. */
  const variantSlots: VariantSlot[] = seedSlots && seedSlots.length > 0
    ? seedSlots
    : DEFAULT_variantSlots;

  /** Slot names derived from variant slots for dynamic pattern matching. */
  const slotNames = variantSlots.map((s) => s.type);

  const metadata = avatar?.metadata ?? null;

  const [speechImportCount, setSpeechImportCount] = useState<number | null>(null);
  const [viewingJson, setViewingJson] = useState<{ label: string; data: unknown } | null>(null);
  const [jsonUploading, setJsonUploading] = useState<JsonSlot | "both" | null>(null);
  const [imageUploading, setImageUploading] = useState<ImageSlot | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingVoiceId, setPendingVoiceId] = useState<{ voiceId: string; source: string } | null>(null);
  const [voiceCsvError, setVoiceCsvError] = useState<string | null>(null);
  const [editingVoiceId, setEditingVoiceId] = useState(false);

  // Name / status editing
  const [editName, setEditName] = useState<string | null>(null);
  const [editStatusId, setEditStatusId] = useState<string | null>(null);
  const nameValue = editName ?? charName;
  const statusValue = editStatusId ?? String(avatar?.status_id ?? 1);
  const nameDirty = editName !== null && editName.trim() !== charName;
  const statusDirty = editStatusId !== null && editStatusId !== String(avatar?.status_id ?? 1);
  const editDirty = nameDirty || statusDirty;

  const voiceConfigured = hasVoiceId(avatar?.settings as Record<string, unknown> | null);
  const statusOptions = Object.entries(STATUS_LABELS).map(([id, label]) => ({
    value: id,
    label,
    disabled: id === String(CHARACTER_STATUS_ID_ACTIVE) && !voiceConfigured,
  }));

  function handleSaveEdits() {
    if (!onUpdate || !avatar || !editDirty) return;
    const data: UpdateAvatar = {};
    if (nameDirty) data.name = editName!.trim();
    if (statusDirty) data.status_id = Number(editStatusId);
    onUpdate(avatar.id, data);
    setEditName(null);
    setEditStatusId(null);
  }

  // CRUD state
  const deleteVariant = useDeleteMediaVariant(avatarId);
  const speechActions = useSpeechActions(avatarId);

  type DeleteTarget =
    | { kind: "variant"; id: number; label: string }
    | { kind: "meta"; slot: JsonSlot }
    | { kind: "speech"; speech: AvatarSpeech }
    | null;
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [replacingSlot, setReplacingSlot] = useState<ImageSlot | null>(null);
  const [expandedSpeechGroup, setExpandedSpeechGroup] = useState<string | null>(null);

  // Voice ID — localVoiceId tracks saves so UI updates immediately
  const updateSettings = useUpdateAvatarSettings(projectId, avatarId);
  const propVoiceId = getVoiceId(avatar?.settings as Record<string, unknown> | null) ?? "";
  const [localVoiceId, setLocalVoiceId] = useState<string | null>(null);
  const currentVoiceId = localVoiceId ?? propVoiceId;
  const [voiceIdDraft, setVoiceIdDraft] = useState<string | null>(null);
  const voiceIdValue = voiceIdDraft ?? currentVoiceId;
  const voiceIdDirty = voiceIdDraft !== null && voiceIdDraft !== currentVoiceId;

  function findVariant(variantType: string): MediaVariant | undefined {
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

  /* --- Speech file drop handler --- */

  async function handleSpeechFileDrop(file: File) {
    const text = await readFileText(file);
    const result = extractSpeechEntries(text, file.name, charName);
    if (!result) return;

    importSpeeches.mutate(
      { format: result.format, data: result.data },
      { onSuccess: (res) => setSpeechImportCount(res.imported) },
    );
  }

  /* --- Single-file handlers for targeted slot drops --- */

  async function handleSingleJsonDrop(slot: JsonSlot, file: File) {
    const parsed = await readFileAsJson(file);
    if (!parsed) return;

    const warnings: string[] = [];
    const slotWarn = detectJsonSlotMismatch(file.name, slot);
    if (slotWarn) warnings.push(slotWarn);
    const nameWarn = detectNameMismatchInFilename(file.name, charName, slotNames);
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
    const slotWarn = detectImageSlotMismatch(file.name, slot, slotNames);
    if (slotWarn) warnings.push(slotWarn);
    const nameWarn = detectNameMismatchInFilename(file.name, charName, slotNames);
    if (nameWarn) warnings.push(nameWarn);

    if (warnings.length > 0) {
      setPendingUpload({ jsonAssignments: [], imageAssignments: [{ kind: "image", slot, label, file }], warnings });
      return;
    }

    uploadVariant.mutate({ file, variant_type: slot, variant_label: label });
  }

  /* --- Replace image handler --- */

  async function handleReplaceImage(slot: ImageSlot, oldVariantId: number, file: File) {
    setReplacingSlot(slot);
    try {
      await deleteVariant.mutateAsync(oldVariantId);
      await uploadVariant.mutateAsync({ file, variant_type: slot, variant_label: slotLabel(slot) });
    } finally {
      setReplacingSlot(null);
    }
  }

  /* --- Confirm delete handler --- */

  function handleConfirmDelete() {
    if (!deleteTarget) return;
    switch (deleteTarget.kind) {
      case "variant":
        deleteVariant.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        break;
      case "meta": {
        const key = deleteTarget.slot === "bio" ? SOURCE_KEY_BIO : SOURCE_KEY_TOV;
        updateMetadata.mutate({ [key]: null }, { onSuccess: () => setDeleteTarget(null) });
        break;
      }
      case "speech":
        speechActions.deleteSpeech.mutate(deleteTarget.speech.id, { onSuccess: () => setDeleteTarget(null) });
        break;
    }
  }

  /* --- Voice ID handlers --- */

  function saveVoiceId() {
    if (!voiceIdDirty) return;
    const value = voiceIdDraft!.trim() || null;
    updateSettings.mutate(
      { [SETTING_KEY_VOICE]: value },
      {
        onSuccess: () => {
          setLocalVoiceId(value ?? "");
          setVoiceIdDraft(null);
        },
      },
    );
  }

  async function handleVoiceCsvDrop(file: File) {
    setVoiceCsvError(null);
    const text = await readFileText(file);
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      setVoiceCsvError("CSV file is empty or has no data rows");
      return;
    }

    const header = lines[0]!.toLowerCase().split(",").map((c) => c.trim());
    const nameCol = header.findIndex((h) => ["avatar", "avatar_slug", "slug", "name", "model", "avatar"].includes(h));
    const voiceCol = header.findIndex((h) => ["voice_id", "voiceid", "elevenlabs_voice", "voice"].includes(h));
    if (nameCol < 0 || voiceCol < 0) {
      setVoiceCsvError(`Missing required columns. Expected: avatar/name + voice_id. Found: ${header.join(", ")}`);
      return;
    }

    const charSlug = slugify(charName);
    for (const line of lines.slice(1)) {
      if (!line.trim()) continue;
      const cols = line.split(",").map((c) => c.trim());
      if (slugify(cols[nameCol] ?? "") === charSlug) {
        const vid = cols[voiceCol]?.replace(/^"|"$/g, "").trim();
        if (vid) {
          setPendingVoiceId({ voiceId: vid, source: file.name });
          return;
        }
      }
    }

    setVoiceCsvError(`No matching entry for "${charName}" found in ${file.name}`);
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
      const slot = classifyImage(file.name, slotNames) ?? slotNames[0] ?? "clothed";
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
          const nameWarn = detectNameMismatchInFilename(file.name, charName, slotNames);
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
      const slot = classifyImage(file.name, slotNames);
      if (slot) {
        const nameWarn = detectNameMismatchInFilename(file.name, charName, slotNames);
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
      const slotList = slotNames.join(", ") || "clothed, topless";
      warnings.push(`No files could be classified as bio, tov, ${slotList}`);
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
    <Modal open={open} onClose={onClose} size="2xl" loading={isLoading}>
      {/* Title row — name + delete aligned with modal close X */}
      <div className="flex items-center gap-2 pr-8 mb-[var(--spacing-3)]">
        <h2 className="text-xs font-medium text-[var(--color-text-primary)] font-mono uppercase tracking-wide truncate">
          {avatar?.name ?? ""}
        </h2>
        {onDelete && (
          <button
            type="button"
            className="shrink-0 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-data-red)] transition-colors"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Delete ${charName}`}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {/* Modal-level drop zone catches multi-file / directory / mixed drops */}
      <div
        className="min-h-[420px]"
        onDragOver={(e) => { e.preventDefault(); }}
        onDrop={handleUnifiedDrop}
      >
        <Stack gap={4}>
          {/* Seed Images — side by side */}
          <div>
            <h3 className={cn("flex items-center gap-2 mb-2", TERMINAL_HEADER_TITLE)}>
              <Image size={14} aria-hidden />
              Seed Images
              <span className="font-normal text-[10px] opacity-50">— PNG, JPG, or WebP — name files with "clothed" or "topless" to auto-classify</span>
            </h3>
            <div className="grid grid-cols-2 gap-[var(--spacing-4)]">
            {variantSlots.map(({ type, label }) => {
              const variant = isLoading ? undefined : findVariant(type);
              const isUploading = (uploadVariant.isPending && uploadVariant.variables?.variant_type === type)
                || imageUploading === type;

              if (isLoading) {
                return (
                  <div key={type} className="space-y-[var(--spacing-1)]">
                    <span className={TERMINAL_LABEL}>{label}</span>
                    <div className="h-48 rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] flex items-center justify-center">
                      <ContextLoader size={32} />
                    </div>
                  </div>
                );
              }

              if (variant) {
                const isReplacing = replacingSlot === type;
                return (
                  <div key={type} className="space-y-[var(--spacing-1)]">
                    <span className={TERMINAL_LABEL}>{label}</span>
                    {isReplacing ? (
                      <div className="h-48 rounded-[var(--radius-md)] bg-[var(--color-surface-secondary)] flex items-center justify-center">
                        <ContextLoader size={32} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setLightboxUrl(variantMediaUrl(variant.file_path))}
                        className="cursor-pointer hover:opacity-80 transition-opacity"
                      >
                        <SeedImage
                          src={variantThumbnailUrl(variant.id, 512)}
                          alt={`${label} seed image`}
                        />
                      </button>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-[var(--spacing-2)]">
                        <span className={cn("font-mono text-[10px] uppercase", TERMINAL_STATUS_COLORS[MEDIA_VARIANT_STATUS_LABEL[variant.status_id as MediaVariantStatusId]?.toLowerCase() ?? ""] ?? "text-[var(--color-text-muted)]")}>
                          {MEDIA_VARIANT_STATUS_LABEL[variant.status_id as MediaVariantStatusId] ?? "Unknown"}
                        </span>
                        {variant.is_hero && <span className="font-mono text-[10px] uppercase text-[var(--color-data-cyan)]">Hero</span>}
                      </div>
                      <div className="flex items-center gap-[var(--spacing-1)]">
                        <label className={cn(ICON_ACTION_BTN, "cursor-pointer")}>
                          <Upload size={14} />
                          <input
                            type="file"
                            accept={IMAGE_ACCEPT_STRING}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleReplaceImage(type, variant.id, file);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        <button
                          type="button"
                          className={ICON_ACTION_BTN_DANGER}
                          onClick={() => setDeleteTarget({ kind: "variant", id: variant.id, label: `${label} image` })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={type} className="space-y-[var(--spacing-1)]">
                  <span className={TERMINAL_LABEL}>{label}</span>
                  <SeedDataDropSlot
                    accept={IMAGE_ACCEPT_STRING}
                    label={`${label} image`}
                    loading={isUploading}
                    onFile={(file) => handleSingleImageDrop(type, label, file)}
                  />
                </div>
              );
            })}
            </div>
          </div>

          {/* Metadata Files — side by side */}
          <div>
            <h3 className={cn("flex items-center gap-2 mb-2", TERMINAL_HEADER_TITLE)}>
              <FileText size={14} aria-hidden />
              Metadata
              <span className="font-normal text-[10px] opacity-50">— JSON files — name with "bio" or "tov" to auto-classify</span>
            </h3>
            <div className="grid grid-cols-2 gap-[var(--spacing-4)]">
              {([
                { slot: "bio" as const, label: "Bio", data: bioData, has: hasBio },
                { slot: "tov" as const, label: "ToV (Tone of Voice)", data: tovData, has: hasTov },
              ]).map(({ slot, label, data, has }) => (
                <div key={slot} className="space-y-[var(--spacing-1)]">
                  <span className={TERMINAL_LABEL}>{label}</span>
                  {has && data ? (
                    <div className="space-y-[var(--spacing-1)]">
                      <button
                        type="button"
                        onClick={() => setViewingJson({ label: `${label} — ${slot}.json`, data })}
                        className={cn(
                          "w-full text-left rounded-[var(--radius-md)] border border-[var(--color-border-default)]/30",
                          "bg-[var(--color-surface-secondary)] px-[var(--spacing-2)] py-[var(--spacing-1)]",
                          "cursor-pointer hover:border-[var(--color-border-default)] transition-colors",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className={TYPO_DATA_CYAN}>{slot}.json</span>
                          <Eye size={12} className="text-[var(--color-text-muted)]" />
                        </div>
                      </button>
                      <div className="flex items-center justify-end gap-[var(--spacing-1)]">
                        <SeedDataDropSlot
                          accept=".json,application/json"
                          label="Replace"
                          loading={jsonUploading === slot || jsonUploading === "both"}
                          onFile={(file) => handleSingleJsonDrop(slot, file)}
                          compact
                        />
                        <button
                          type="button"
                          className={ICON_ACTION_BTN_DANGER}
                          onClick={() => setDeleteTarget({ kind: "meta", slot })}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
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
            </div>
          </div>

          {/* Speech */}
          <div>
            <h3 className={cn("flex items-center gap-2 mb-2", TERMINAL_HEADER_TITLE)}>
              <MessageSquare size={14} aria-hidden />
              Speech
              {speeches && speeches.length > 0 && <span className="font-mono text-[10px] text-[var(--color-data-cyan)]">[{speeches.length}]</span>}
              <span className="font-normal text-[8px] opacity-40 hidden sm:inline">{"— JSON ({ avatar: { type: { lang: [texts] } } }) or CSV (avatar, speech_type, language, text)"}</span>
            </h3>
            {speeches && speeches.length > 0 ? (() => {
              // Group by type+language, storing full speech objects
              const typeMap = new Map(speechTypes?.map((t) => [t.id, t.name]) ?? []);
              const langMap = new Map(languages?.map((l) => [l.id, { name: l.name, code: l.code, flag_code: l.flag_code }]) ?? []);

              const groups = new Map<string, { typeName: string; langCode: string; flagCode: string; entries: AvatarSpeech[] }>();
              for (const s of speeches) {
                const key = `${s.speech_type_id}-${s.language_id}`;
                const existing = groups.get(key);
                if (existing) {
                  existing.entries.push(s);
                } else {
                  const lang = langMap.get(s.language_id);
                  groups.set(key, {
                    typeName: typeMap.get(s.speech_type_id) ?? `type_${s.speech_type_id}`,
                    langCode: lang?.code ?? "en",
                    flagCode: lang?.flag_code ?? "gb",
                    entries: [s],
                  });
                }
              }

              return (
                <Stack gap={2}>
                  <div className={cn(TERMINAL_PANEL, "max-h-72 overflow-y-auto")}>
                    <table className="w-full text-xs font-mono">
                      <thead className="sticky top-0 bg-[var(--color-surface-secondary)]">
                        <tr>
                          <th className={cn(TERMINAL_TH, "px-2 py-1.5")}>Type</th>
                          <th className={cn(TERMINAL_TH, "px-2 py-1.5")}>Lang</th>
                          <th className={cn(TERMINAL_TH, "px-2 py-1.5 text-right")}>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...groups.entries()].map(([groupKey, g]) => {
                          const isExpanded = expandedSpeechGroup === groupKey;
                          return (
                            <Fragment key={groupKey}>
                              <tr
                                className={cn(
                                  TERMINAL_DIVIDER,
                                  TERMINAL_ROW_HOVER,
                                  "cursor-pointer",
                                )}
                                onClick={() => setExpandedSpeechGroup(isExpanded ? null : groupKey)}
                              >
                                <td className="px-2 py-1 text-[var(--color-data-cyan)]">
                                  <span className="inline-flex items-center gap-1">
                                    <span className={cn("transition-transform text-[10px]", isExpanded && "rotate-90")}>▶</span>
                                    {g.typeName}
                                  </span>
                                </td>
                                <td className="px-2 py-1">
                                  <span className="inline-flex items-center gap-1">
                                    <FlagIcon flagCode={g.flagCode} size={10} />
                                    <span className="text-[var(--color-text-muted)] uppercase text-[10px]">{g.langCode}</span>
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-right text-[var(--color-text-primary)]">{g.entries.length}</td>
                              </tr>
                              {isExpanded && g.entries.map((speech) => (
                                <tr key={speech.id} className="bg-[var(--color-surface-secondary)]/50">
                                  <td colSpan={3} className="px-3 py-1.5">
                                    {speechActions.editingId === speech.id ? (
                                      <div className="space-y-[var(--spacing-1)]">
                                        <textarea
                                          className={cn(TERMINAL_TEXTAREA, "min-h-[60px]")}
                                          value={speechActions.editText}
                                          onChange={(e) => speechActions.setEditText(e.target.value)}
                                          autoFocus
                                        />
                                        <div className="flex gap-[var(--spacing-1)] justify-end">
                                          <Button size="xs" variant="primary" onClick={speechActions.saveEdit} loading={speechActions.updateSpeech.isPending}>
                                            Save
                                          </Button>
                                          <Button size="xs" variant="secondary" onClick={speechActions.cancelEdit}>
                                            Cancel
                                          </Button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex items-start justify-between gap-[var(--spacing-2)]">
                                        <span className={`${TYPO_DATA_MUTED} break-words flex-1`}>{speech.text}</span>
                                        <div className="flex items-center gap-[var(--spacing-1)] shrink-0">
                                          <button type="button" className={ICON_ACTION_BTN} onClick={() => speechActions.startEdit(speech)}>
                                            <Edit3 size={12} />
                                          </button>
                                          <button type="button" className={ICON_ACTION_BTN_DANGER} onClick={() => setDeleteTarget({ kind: "speech", speech })}>
                                            <Trash2 size={12} />
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <SeedDataDropSlot
                    accept=".json,.csv"
                    label="Drop speech file to import more"
                    loading={importSpeeches.isPending}
                    onFile={handleSpeechFileDrop}
                  />
                  {speechImportCount !== null && (
                    <span className="font-mono text-[10px] text-[var(--color-data-green)]">{speechImportCount} imported</span>
                  )}
                </Stack>
              );
            })() : (
              <div>
                <SeedDataDropSlot
                  accept=".json,.csv"
                  label="Speech file (JSON or CSV)"
                  loading={importSpeeches.isPending}
                  onFile={handleSpeechFileDrop}
                />
                {speechImportCount !== null && (
                  <div className="mt-[var(--spacing-1)]">
                    <span className="font-mono text-[10px] text-[var(--color-data-green)]">{speechImportCount} imported</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Voice ID */}
          <div>
            <h3 className={cn("flex items-center gap-2 mb-2", TERMINAL_HEADER_TITLE)}>
              <Mic size={14} aria-hidden />
              Voice ID
              <span className="font-normal text-[10px] opacity-50">— CSV with avatar + voice_id columns, or paste directly</span>
            </h3>
            <div className="space-y-[var(--spacing-2)]">
              {currentVoiceId && !editingVoiceId ? (
                /* Configured — show value with edit action */
                <div className="flex items-center gap-[var(--spacing-2)]">
                  <span className="font-mono text-[10px] uppercase text-[var(--color-data-green)]">Configured</span>
                  <span className={`${TYPO_DATA_MUTED} truncate flex-1`}>{currentVoiceId}</span>
                  <Button size="xs" variant="ghost" onClick={() => { setVoiceIdDraft(currentVoiceId); setEditingVoiceId(true); }}>
                    Edit
                  </Button>
                </div>
              ) : (
                /* Empty or editing — show input + drop slot */
                <>
                  <div className="flex items-end gap-[var(--spacing-2)]">
                    <div className="flex-1">
                      <Input
                        placeholder="Paste voice ID here"
                        size="sm"
                        className={TERMINAL_INPUT}
                        value={voiceIdValue}
                        onChange={(e) => setVoiceIdDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { saveVoiceId(); setEditingVoiceId(false); } }}
                      />
                    </div>
                    <div className="flex gap-[var(--spacing-1)] pb-[1px]">
                      <Button size="xs" variant="primary" onClick={() => { saveVoiceId(); setEditingVoiceId(false); }} loading={updateSettings.isPending} disabled={!voiceIdDirty}>
                        Save
                      </Button>
                      {(currentVoiceId || voiceIdDraft) && (
                        <Button size="xs" variant="secondary" onClick={() => { setVoiceIdDraft(null); setEditingVoiceId(false); }}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <SeedDataDropSlot
                    accept=".csv,text/csv"
                    label="Voice ID CSV"
                    loading={false}
                    onFile={(file) => { setVoiceCsvError(null); if (file.name.toLowerCase().endsWith(".csv")) handleVoiceCsvDrop(file); }}
                    compact
                  />
                </>
              )}
              {voiceCsvError && (
                <div className="flex items-start gap-[var(--spacing-2)] text-xs text-[var(--color-action-danger)]">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{voiceCsvError}</span>
                </div>
              )}
            </div>
          </div>

          {/* Avatar management */}
          {(groupOptions || onUpdate) && (
            <div className="space-y-2">
              <h3 className={cn("flex items-center gap-2", TERMINAL_HEADER_TITLE)}>
                <Settings size={14} aria-hidden />
                Management
              </h3>

              {/* Name + Status + Group row — grid so Name and Group share the same column width */}
              {onUpdate && (
                <div className="grid grid-cols-[1fr_8rem] items-end gap-[var(--spacing-3)]">
                  <Input
                    label="Name"
                    size="sm"
                    className={TERMINAL_INPUT}
                    value={nameValue}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                  <Select
                    label="Status"
                    size="sm"
                    options={statusOptions}
                    value={statusValue}
                    onChange={(val) => setEditStatusId(val)}
                  />
                  {editDirty && (
                    <div className="col-span-2 flex gap-[var(--spacing-1)] justify-end">
                      <Button size="xs" variant="primary" onClick={handleSaveEdits} loading={updating}>
                        Save
                      </Button>
                      <Button size="xs" variant="secondary" onClick={() => { setEditName(null); setEditStatusId(null); }}>
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
              )}
              {onUpdate && !voiceConfigured && statusValue === String(CHARACTER_STATUS_ID_ACTIVE) && (
                <div className="flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-[var(--color-status-warning)] shrink-0" />
                  <span className="text-xs text-[var(--color-text-muted)]">
                    VoiceID must be configured before activating
                  </span>
                </div>
              )}

              {/* Group selector */}
              {groupOptions && onGroupChange && (
                <div className="grid grid-cols-[1fr_8rem] items-end gap-[var(--spacing-3)]">
                  <div>
                    {creatingGroup ? (
                      <div className="space-y-[var(--spacing-2)]">
                        <div className="flex gap-[var(--spacing-2)] items-end">
                          <div className="flex-1">
                            <Input
                              label="New Group"
                              size="sm"
                              className={TERMINAL_INPUT}
                              value={newGroupName}
                              onChange={(e) => setNewGroupName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && newGroupName.trim() && onCreateGroup) {
                                  onCreateGroup(newGroupName.trim()).then((id) => {
                                    onGroupChange(avatarId, id);
                                    setCreatingGroup(false);
                                    setNewGroupName("");
                                  });
                                }
                              }}
                              placeholder="Group name"
                              autoFocus
                            />
                          </div>
                          <Button
                            size="xs"
                            variant="primary"
                            icon={<Plus size={14} />}
                            disabled={!newGroupName.trim() || !onCreateGroup}
                            onClick={() => {
                              if (!newGroupName.trim() || !onCreateGroup) return;
                              onCreateGroup(newGroupName.trim()).then((id) => {
                                onGroupChange(avatarId, id);
                                setCreatingGroup(false);
                                setNewGroupName("");
                              });
                            }}
                          >
                            Create
                          </Button>
                          <Button
                            size="xs"
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
                        size="sm"
                        options={[
                          ...groupOptions,
                          ...(onCreateGroup ? [{ value: "__new__", label: "+ New group" }] : []),
                        ]}
                        value={avatar?.group_id ? String(avatar.group_id) : ""}
                        onChange={(val) => {
                          if (val === "__new__") {
                            setCreatingGroup(true);
                            setNewGroupName("");
                          } else {
                            onGroupChange(avatarId, val ? Number(val) : null);
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Stack>
      </div>

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
              <div key={i} className={`${TYPO_DATA_WARNING} flex items-start gap-[var(--spacing-2)]`}>
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{w}</span>
              </div>
            ))}

            {totalAssignments > 0 && (
              <div className={cn(TERMINAL_PANEL)}>
                <div className={TERMINAL_HEADER}>
                  <span className={TERMINAL_HEADER_TITLE}>Files to upload</span>
                </div>
                <div className={cn(TERMINAL_BODY, "space-y-[var(--spacing-1)]")}>
                  {pendingUpload.imageAssignments.map(({ slot, file }) => (
                    <div key={`img-${slot}`} className={cn(`flex items-center justify-between ${TYPO_DATA}`, TERMINAL_DIVIDER, "pb-1")}>
                      <span className="text-[var(--color-text-primary)] truncate">{file.name}</span>
                      <span className="text-[var(--color-data-cyan)] text-[10px] uppercase">{slotLabel(slot)} image</span>
                    </div>
                  ))}
                  {pendingUpload.jsonAssignments.map(({ slot, file }) => (
                    <div key={`json-${slot}`} className={cn(`flex items-center justify-between ${TYPO_DATA}`, TERMINAL_DIVIDER, "pb-1")}>
                      <span className="text-[var(--color-text-primary)] truncate">{file.name}</span>
                      <span className="text-[var(--color-text-muted)] text-[10px] uppercase">{slotLabel(slot)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-[var(--spacing-2)]">
              <Button variant="secondary" size="xs" onClick={() => setPendingUpload(null)}>
                Cancel
              </Button>
              {totalAssignments > 0 && (
                <Button
                  variant="primary"
                  size="xs"
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
          <pre className={`${TYPO_DATA_CYAN} max-h-[70vh] overflow-auto rounded-[var(--radius-md)] bg-[var(--color-surface-primary)] p-[var(--spacing-4)]`}>
            {JSON.stringify(viewingJson.data, null, 2)}
          </pre>
        )}
      </Modal>

      {/* Confirm delete modal (shared for variants, metadata, speech) */}
      <ConfirmDeleteModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={
          deleteTarget?.kind === "variant" ? "Delete Image"
            : deleteTarget?.kind === "meta" ? "Clear Metadata"
            : "Delete Speech Entry"
        }
        entityName={
          deleteTarget?.kind === "variant" ? deleteTarget.label
            : deleteTarget?.kind === "meta" ? `${slotLabel(deleteTarget.slot)} metadata`
            : deleteTarget?.kind === "speech" ? (deleteTarget.speech.text.length > 60 ? deleteTarget.speech.text.slice(0, 60) + "…" : deleteTarget.speech.text)
            : ""
        }
        warningText={deleteTarget?.kind === "meta" ? "The slot will become empty." : undefined}
        onConfirm={handleConfirmDelete}
        loading={deleteVariant.isPending || updateMetadata.isPending || speechActions.deleteSpeech.isPending}
      />

      {/* Confirm avatar delete */}
      <ConfirmDeleteModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete Avatar"
        entityName={charName}
        onConfirm={() => { if (onDelete) { onDelete(avatarId); onClose(); } }}
      />

      {/* Voice ID confirmation modal */}
      <ConfirmModal
        open={pendingVoiceId !== null}
        onClose={() => setPendingVoiceId(null)}
        title="Set Voice ID"
        confirmLabel="Apply"
        confirmVariant="primary"
        loading={updateSettings.isPending}
        onConfirm={() => {
          if (!pendingVoiceId) return;
          updateSettings.mutate(
            { [SETTING_KEY_VOICE]: pendingVoiceId.voiceId },
            {
              onSuccess: () => {
                setLocalVoiceId(pendingVoiceId.voiceId);
                setVoiceIdDraft(null);
                setPendingVoiceId(null);
              },
            },
          );
        }}
      >
        {pendingVoiceId && (
          <Stack gap={2}>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Found voice ID for <strong>{charName}</strong> in <span className={TYPO_DATA}>{pendingVoiceId.source}</span>:
            </p>
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-primary)] border border-[var(--color-border-default)]/30 p-[var(--spacing-3)]">
              <span className={`${TYPO_DATA_CYAN} break-all`}>{pendingVoiceId.voiceId}</span>
            </div>
            {currentVoiceId && currentVoiceId !== pendingVoiceId.voiceId && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Current: <span className="font-mono">{currentVoiceId}</span> (will be replaced)
              </p>
            )}
          </Stack>
        )}
      </ConfirmModal>

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
