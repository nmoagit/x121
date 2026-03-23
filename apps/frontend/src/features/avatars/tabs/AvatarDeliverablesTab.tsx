/**
 * Avatar deliverables tab — metadata, approved images, and video clips (PRD-112).
 *
 * Three sections in a uniform compact-row format:
 * 1. Metadata — summary card with download button
 * 2. Images — approved variants grouped by scene slot
 * 3. Scene Videos — clips grouped by scene slot
 *
 * Scene slots come from the avatar's effective scene settings (four-level merge).
 * Scenes/variants are matched to slots via (scene_type_id, track_id).
 */

import { EmptyState, TerminalSection } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, Checkbox, LoadingPane } from "@/components/primitives";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useSetToggle } from "@/hooks/useSetToggle";
import { cn } from "@/lib/cn";
import {
  ChevronDown,
  ChevronRight,
  Download,
  EyeOff,
  FileText,
  Image,
  ListFilter,
  Mic,
  Play,
  Video,
} from "@/tokens/icons";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { SequencePlayer } from "./SequencePlayer";

import {
  useAvatarMetadata,
  useAvatarSettings,
  useUpdateAvatarSettings,
} from "@/features/avatars/hooks/use-avatar-detail";
import { useSpeechCompleteness } from "@/features/avatars/hooks/use-avatar-speeches";
import type { CompletenessEntry } from "@/features/avatars/types";
import {
  isIgnored,
  useAddDeliverableIgnore,
  useDeliverableIgnores,
  useRemoveDeliverableIgnore,
} from "@/features/avatars/hooks/use-deliverable-ignores";
import type { DeliverableIgnore } from "@/features/avatars/hooks/use-deliverable-ignores";
import { generateAvatarJson } from "@/features/avatars/lib/avatar-json-transform";
import { SOURCE_KEYS } from "@/features/avatars/types";
import { useImageVariants } from "@/features/images/hooks/use-image-variants";
import { IMAGE_VARIANT_STATUS, PROVENANCE_LABEL } from "@/features/images/types";
import type { ImageVariant, Provenance } from "@/features/images/types";
import { variantImageUrl } from "@/features/images/utils";
import { useProject } from "@/features/projects/hooks/use-projects";
import { useAvatarSceneSettings } from "@/features/scene-catalogue/hooks/use-avatar-scene-settings";
import { useExpandedSettings } from "@/features/scene-catalogue/hooks/use-expanded-settings";
import type { ExpandedSceneSetting } from "@/features/scene-catalogue/types";
import { useAvatarScenes } from "@/features/scenes/hooks/useAvatarScenes";
import { useSceneVersions } from "@/features/scenes/hooks/useClipManagement";
import { type Scene, type SceneVideoVersion, isEmptyClip, pickFinalClip, slotLabel } from "@/features/scenes/types";
import { formatDuration } from "@/features/video-player/frame-utils";
import { CLOTHES_OFF_SUFFIX, getExtension } from "@/lib/file-types";
import { downloadJson } from "@/lib/file-utils";
import { formatBytes, generateSnakeSlug } from "@/lib/format";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SECTION_KEYS = ["metadata", "images", "scene-videos", "speech"] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_LABELS: Record<SectionKey, string> = {
  metadata: "Metadata",
  images: "Images",
  "scene-videos": "Scene Videos",
  speech: "Speech",
};

/** Maps blocking_deliverables keys from project config to SectionKey values. */
const BLOCKING_KEY_MAP: Record<string, SectionKey> = {
  metadata: "metadata",
  images: "images",
  scenes: "scene-videos",
  speech: "speech",
};

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/**
 * Compute the expected delivery filename for a seed image track.
 *
 * Mirrors the backend naming engine's `delivery_image` template:
 * `{variant_label}.{ext}` where variant_label is the track slug.
 */
function expectedImageFilename(trackSlug: string, ext = "png"): string {
  return `${trackSlug}.${ext}`;
}

/**
 * Compute the expected delivery filename for a scene video slot.
 *
 * Mirrors the backend naming engine's `delivery_video` template:
 * `{variant_prefix}{scene_type_slug}{clothes_off_suffix}{index_suffix}.mp4`
 *
 * - variant_prefix: "topless_" for topless track, empty for clothed
 * - scene_type_slug: scene type name lowercased, spaces → underscores
 * - clothes_off_suffix: "_clothes_off" when scene type has the transition flag
 * - index_suffix is omitted from expected names
 */
function expectedVideoFilename(slot: ExpandedSceneSetting): string {
  const sceneSlug = slot.name.toLowerCase().replace(/\s+/g, "_");
  const prefix = slot.track_slug === "topless" ? "topless_" : "";
  const clothesOff = slot.has_clothes_off_transition ? CLOTHES_OFF_SUFFIX : "";
  return `${prefix}${sceneSlug}${clothesOff}.mp4`;
}

/* --------------------------------------------------------------------------
   Section filter dropdown
   -------------------------------------------------------------------------- */

function SectionFilter({
  visible,
  onToggle,
  blockingKeys,
}: {
  visible: Set<SectionKey>;
  onToggle: (key: SectionKey) => void;
  blockingKeys: Set<SectionKey>;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useClickOutside(containerRef, close, open);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Button
        variant="secondary"
        size="xs"
        icon={<ListFilter size={12} />}
        onClick={() => setOpen((p) => !p)}
      >
        Sections ({visible.size}/{SECTION_KEYS.length})
      </Button>
      {open && (
        <div className="absolute top-full right-0 mt-1 z-50 min-w-[180px] bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] shadow-[var(--shadow-md)] py-2 px-3">
          <Stack gap={2}>
            {SECTION_KEYS.map((key) => (
              <Checkbox
                key={key}
                checked={visible.has(key)}
                onChange={() => onToggle(key)}
                label={`${SECTION_LABELS[key]}${!blockingKeys.has(key) ? " (optional)" : ""}`}
              />
            ))}
          </Stack>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Row components
   -------------------------------------------------------------------------- */

/** Grid-based row layout: icon | title | filename | badges/meta | actions.
 *  Fixed column widths for icon, title, and filename ensure vertical alignment. */
const ROW_GRID_COLS = "grid-cols-[16px_minmax(100px,160px)_minmax(120px,200px)_1fr_auto]";
const ROW_CLASS = `grid items-center px-[var(--spacing-3)] py-[var(--spacing-2)] font-mono text-xs ${ROW_GRID_COLS} gap-x-[var(--spacing-3)]`;
const PLACEHOLDER_CLASS = `grid items-center px-[var(--spacing-3)] py-[var(--spacing-2)] font-mono text-xs text-[var(--color-text-muted)] opacity-50 ${ROW_GRID_COLS} gap-x-[var(--spacing-3)]`;

const ROW_ICON_CLASS = "shrink-0 text-[var(--color-text-muted)]";
const ROW_TITLE_CLASS = "min-w-0 truncate font-medium text-[var(--color-text-muted)] uppercase tracking-wide";
const ROW_TITLE_MUTED_CLASS = "min-w-0 truncate font-medium text-[var(--color-text-muted)] uppercase tracking-wide";
const ROW_FILENAME_CLASS = "min-w-0 truncate text-cyan-400";
const ROW_META_CLASS = "flex items-center gap-2 min-w-0 flex-wrap text-[var(--color-text-muted)]";

function ImageRow({
  title,
  expectedFilename,
  variant,
}: { title: string; expectedFilename: string; variant: ImageVariant }) {
  return (
    <div className={ROW_CLASS}>
      <Image size={14} className={ROW_ICON_CLASS} />
      <span className={ROW_TITLE_CLASS}>{title}</span>
      <span className={ROW_FILENAME_CLASS}>{expectedFilename}</span>
      <div className={ROW_META_CLASS}>
        <span>v{variant.version}</span>
        <span className="opacity-30">|</span>
        <span>{variant.provenance === "manual_upload" ? "imported" : (PROVENANCE_LABEL[variant.provenance as Provenance] ?? variant.provenance).toLowerCase()}</span>
        {variant.format && (
          <><span className="opacity-30">|</span><span>{variant.format.toUpperCase()}</span></>
        )}
        {variant.width != null && variant.height != null && (
          <><span className="opacity-30">|</span><span>{variant.width}x{variant.height}</span></>
        )}
        {variant.file_size_bytes != null && (
          <><span className="opacity-30">|</span><span>{formatBytes(variant.file_size_bytes)}</span></>
        )}
      </div>
      <div className="shrink-0 justify-self-end">
        <Button
          variant="ghost"
          size="xs"
          icon={<Download size={12} />}
          onClick={() => window.open(variantImageUrl(variant.file_path), "_blank")}
        >
          Download
        </Button>
      </div>
    </div>
  );
}

function VideoRow({
  title,
  expectedFilename,
  clip,
}: { title: string; expectedFilename: string; clip: SceneVideoVersion }) {
  const ext = getExtension(clip.file_path);

  return (
    <div className={ROW_CLASS}>
      <Video size={14} className={ROW_ICON_CLASS} />
      <span className={ROW_TITLE_CLASS}>{title}</span>
      <span className={ROW_FILENAME_CLASS}>{expectedFilename}</span>
      <div className={ROW_META_CLASS}>
        <span>v{clip.version_number}</span>
        <span className="opacity-30">|</span>
        <span>{clip.source === "generated" ? "generated" : "imported"}</span>
        {clip.width != null && clip.height != null && (
          <><span className="opacity-30">|</span><span>{clip.width}x{clip.height}</span></>
        )}
        {clip.duration_secs != null && (
          <><span className="opacity-30">|</span><span>{formatDuration(clip.duration_secs)}</span></>
        )}
        {clip.frame_rate != null && (
          <><span className="opacity-30">|</span><span>{clip.frame_rate}fps</span></>
        )}
        {clip.video_codec && (
          <><span className="opacity-30">|</span><span className="uppercase">{clip.video_codec}</span></>
        )}
        {ext && <><span className="opacity-30">|</span><span>{ext}</span></>}
        {clip.file_size_bytes != null && (
          <><span className="opacity-30">|</span><span>{formatBytes(clip.file_size_bytes)}</span></>
        )}
        {clip.is_final && <><span className="opacity-30">|</span><span className="text-green-400">final</span></>}
        {isEmptyClip(clip) && <><span className="opacity-30">|</span><span className="text-orange-400">empty</span></>}
      </div>
      <div className="shrink-0 justify-self-end">
        {clip.file_path && (
          <Button
            variant="ghost"
            size="xs"
            icon={<Download size={12} />}
            onClick={() => window.open(clip.file_path, "_blank")}
          >
            Download
          </Button>
        )}
      </div>
    </div>
  );
}

function PlaceholderRow({
  icon,
  title,
  text,
  ignored,
  onToggleIgnore,
}: {
  icon?: ReactNode;
  title?: string;
  text: string;
  ignored?: DeliverableIgnore;
  onToggleIgnore?: () => void;
}) {
  return (
    <div className={cn(PLACEHOLDER_CLASS, ignored && "opacity-50")}>
      <span className={ROW_ICON_CLASS}>{icon}</span>
      <span className={ROW_TITLE_MUTED_CLASS}>{title ?? ""}</span>
      <span className={cn(ROW_FILENAME_CLASS, ignored && "line-through")}>{text}</span>
      <div className={ROW_META_CLASS}>
        {ignored && <span className="text-orange-400">ignored</span>}
      </div>
      <div className="shrink-0 justify-self-end">
        {onToggleIgnore && (
          <Button variant="ghost" size="xs" icon={<EyeOff size={12} />} onClick={onToggleIgnore}>
            {ignored ? "Un-ignore" : "Ignore"}
          </Button>
        )}
      </div>
    </div>
  );
}

const SPEECH_STATUS_COLOR: Record<string, string> = {
  complete: "text-green-400",
  partial: "text-orange-400",
  not_started: "text-red-400",
  missing: "text-red-400",
};

function SpeechRow({ entry }: { entry: CompletenessEntry }) {
  return (
    <div className={ROW_CLASS}>
      <Mic size={14} className={ROW_ICON_CLASS} />
      <span className={ROW_TITLE_CLASS}>{entry.speech_type_name}</span>
      <span className={ROW_FILENAME_CLASS}>{entry.language_code}</span>
      <div className={ROW_META_CLASS}>
        <span>{entry.approved}/{entry.required}</span>
        <span className="opacity-30">|</span>
        <span className={SPEECH_STATUS_COLOR[entry.status] ?? "text-[var(--color-text-muted)]"}>
          {entry.status.replace("_", " ")}
        </span>
      </div>
      <span />
    </div>
  );
}

/* --------------------------------------------------------------------------
   Scene-slot grouped sections
   -------------------------------------------------------------------------- */

function SeedImageSlot({
  label,
  trackSlug,
  variants,
}: {
  label: string;
  trackSlug: string;
  variants: ImageVariant[];
}) {
  // Match variants by track slug. Include hero, approved, or generated variants
  // (uploaded images arrive as Generated, not Approved).
  const matched = variants.filter(
    (v) =>
      v.variant_type?.toLowerCase() === trackSlug.toLowerCase() &&
      (v.is_hero ||
        v.status_id === IMAGE_VARIANT_STATUS.APPROVED ||
        v.status_id === IMAGE_VARIANT_STATUS.GENERATED),
  );

  const expectedName = expectedImageFilename(trackSlug);

  if (matched.length === 0) {
    return (
      <PlaceholderRow
        icon={<Image size={14} className={ROW_ICON_CLASS} />}
        title={label}
        text={expectedName}
      />
    );
  }

  return (
    <>
      {matched.map((v) => (
        <ImageRow key={v.id} title={label} expectedFilename={expectedName} variant={v} />
      ))}
    </>
  );
}

function VideoSlot({
  slot,
  scenes,
  ignored,
  onToggleIgnore,
}: {
  slot: ExpandedSceneSetting;
  scenes: Scene[];
  ignored?: DeliverableIgnore;
  onToggleIgnore?: () => void;
}) {
  const title = slotLabel(slot);
  const expectedName = expectedVideoFilename(slot);
  const matched = scenes.filter(
    (s) => s.scene_type_id === slot.scene_type_id && s.track_id === (slot.track_id ?? null),
  );

  if (matched.length === 0) {
    return (
      <PlaceholderRow
        icon={<Video size={14} className={ROW_ICON_CLASS} />}
        title={title}
        text={expectedName}
        ignored={ignored}
        onToggleIgnore={onToggleIgnore}
      />
    );
  }

  // Pick the most recent scene (highest id = latest import).
  const latestScene = matched.reduce((a, b) => (b.id > a.id ? b : a));

  // Deliverables show only the single best clip from the latest scene.
  return <BestClipRow title={title} expectedFilename={expectedName} sceneId={latestScene.id} />;
}

/**
 * Fetch versions for a scene and display only the single best clip.
 * Priority: latest final clip > latest non-final clip.
 */
function BestClipRow({
  title,
  expectedFilename,
  sceneId,
}: { title: string; expectedFilename: string; sceneId: number }) {
  const { data: clips, isLoading } = useSceneVersions(sceneId);

  if (isLoading) {
    return (
      <PlaceholderRow
        icon={<Video size={14} className={ROW_ICON_CLASS} />}
        title={title}
        text="Loading clips..."
      />
    );
  }

  const list = clips ?? [];
  if (list.length === 0) {
    return (
      <PlaceholderRow
        icon={<Video size={14} className={ROW_ICON_CLASS} />}
        title={title}
        text="No clips"
      />
    );
  }

  // Pick the best clip: prefer final, then latest by version_number.
  const best =
    pickFinalClip(list) ?? list.reduce((a, b) => (b.version_number > a.version_number ? b : a));

  return <VideoRow title={title} expectedFilename={expectedFilename} clip={best} />;
}

/* --------------------------------------------------------------------------
   Metadata section
   -------------------------------------------------------------------------- */

function MetadataSection({
  avatarId,
  projectId,
  avatarName,
  projectName,
  optional,
}: {
  avatarId: number;
  projectId: number;
  avatarName: string;
  projectName: string;
  optional?: boolean;
}) {
  const { data: metadata, isLoading: metaLoading } = useAvatarMetadata(avatarId);
  const { data: settings, isLoading: settingsLoading } = useAvatarSettings(
    projectId,
    avatarId,
  );
  const updateSettings = useUpdateAvatarSettings(projectId, avatarId);

  const [avatarExpanded, setAvatarExpanded] = useState(false);

  // Extract actual field values from the template-driven API response.
  // The response shape is { avatar_id, avatar_name, fields: [{ name, value, ... }], completeness }.
  const fields = (metadata as Record<string, unknown> | undefined)?.fields as
    | Array<{ name: string; value: unknown }>
    | undefined;

  // Build a plain object for download (field name → value, excluding source keys).
  // Must be called before the early return to satisfy the Rules of Hooks.
  const downloadPayload = useMemo(() => {
    if (!fields) return null;
    const obj: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.value != null) obj[f.name] = f.value;
    }
    return Object.keys(obj).length > 0 ? obj : null;
  }, [fields]);

  const isLoading = metaLoading || settingsLoading;
  if (isLoading) return <LoadingPane />;

  const fieldEntries = (fields ?? []).filter(
    (f) => f.value != null && f.value !== "" && !SOURCE_KEYS.has(f.name),
  );
  const sourceEntries = (fields ?? []).filter((f) => f.value != null && SOURCE_KEYS.has(f.name));
  const hasBioSource = sourceEntries.some((f) => f.name === "_source_bio");
  const hasTovSource = sourceEntries.some((f) => f.name === "_source_tov");
  const hasMetadata = fieldEntries.length > 0;

  const avatarJson = settings?.avatar_json as Record<string, unknown> | undefined;
  const hasAvatarJson = avatarJson != null;
  const expectedFilenameAvatar = `${generateSnakeSlug(projectName)}_${generateSnakeSlug(avatarName)}.json`;

  function handleGenerate() {
    if (!downloadPayload) return;
    const result = generateAvatarJson(downloadPayload, settings ?? {});
    updateSettings.mutate({ avatar_json: result });
  }

  function handleDownloadAvatar() {
    if (!avatarJson) return;
    downloadJson(avatarJson, expectedFilenameAvatar);
  }

  return (
    <TerminalSection title="Metadata" actions={optional ? <Badge size="sm" variant="default">optional</Badge> : undefined}>
      <Stack gap={1}>
        {/* Cleaned Metadata row */}
        {!hasMetadata ? (
          <PlaceholderRow
            icon={<FileText size={14} />}
            title="Cleaned Metadata"
            text="No metadata yet"
          />
        ) : (
          <div className={ROW_CLASS}>
            <FileText size={14} className={ROW_ICON_CLASS} />
            <span className={ROW_TITLE_CLASS}>Cleaned Metadata</span>
            <span className={ROW_FILENAME_CLASS}>metadata.json</span>
            <div className={ROW_META_CLASS}>
              <span>{fieldEntries.length} fields</span>
              {hasBioSource && <><span className="opacity-30">|</span><span>bio source</span></>}
              {hasTovSource && <><span className="opacity-30">|</span><span>tov source</span></>}
            </div>
            <div className="shrink-0 justify-self-end">
              <Button
                variant="ghost"
                size="xs"
                icon={<Download size={12} />}
                onClick={() =>
                  downloadPayload &&
                  downloadJson(downloadPayload, `avatar-${avatarId}-metadata.json`)
                }
              >
                Download
              </Button>
            </div>
          </div>
        )}

        {/* Avatar JSON row */}
        {!hasAvatarJson ? (
          <div className={PLACEHOLDER_CLASS}>
            <span className={ROW_ICON_CLASS}>
              <FileText size={14} />
            </span>
            <span className={ROW_TITLE_MUTED_CLASS}>Avatar JSON</span>
            <span className={ROW_FILENAME_CLASS}>Not generated</span>
            <span />
            <div className="shrink-0 justify-self-end">
              {hasMetadata && (
                <Button variant="secondary" size="xs" disabled={!downloadPayload || updateSettings.isPending} onClick={handleGenerate}>
                  Generate
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className={ROW_CLASS}>
            <FileText size={14} className={ROW_ICON_CLASS} />
            <span className={ROW_TITLE_CLASS}>Avatar JSON</span>
            <span className={ROW_FILENAME_CLASS}>{expectedFilenameAvatar}</span>
            <div className={ROW_META_CLASS}>
              <span className="text-green-400">generated</span>
            </div>
            <div className="shrink-0 justify-self-end flex items-center gap-1">
              <Button variant="secondary" size="xs" disabled={!downloadPayload || updateSettings.isPending} onClick={handleGenerate}>
                Regenerate
              </Button>
              <Button variant="ghost" size="xs" icon={<Download size={12} />} onClick={handleDownloadAvatar}>
                Download
              </Button>
              <Button
                variant="ghost"
                size="xs"
                icon={avatarExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                onClick={() => setAvatarExpanded((p) => !p)}
                aria-label={avatarExpanded ? "Collapse" : "Expand"}
              />
            </div>
          </div>
        )}

        {/* Collapsible raw JSON preview */}
        {hasAvatarJson && avatarExpanded && (
          <pre className="text-[10px] font-mono bg-[#161b22] rounded-[var(--radius-md)] p-[var(--spacing-3)] overflow-auto max-h-80 text-cyan-400">
            {JSON.stringify(avatarJson, null, 2)}
          </pre>
        )}
      </Stack>
    </TerminalSection>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface AvatarDeliverablesTabProps {
  avatarId: number;
  projectId: number;
  avatarName: string;
  projectName: string;
}

export function AvatarDeliverablesTab({
  avatarId,
  projectId,
  avatarName,
  projectName,
}: AvatarDeliverablesTabProps) {
  const { data: variants, isLoading: variantsLoading } = useImageVariants(avatarId);
  const { data: scenes, isLoading: scenesLoading } = useAvatarScenes(avatarId);
  const { data: settings, isLoading: settingsLoading } = useAvatarSceneSettings(avatarId);
  const { data: ignores } = useDeliverableIgnores(avatarId);
  const addIgnore = useAddDeliverableIgnore(avatarId);
  const removeIgnore = useRemoveDeliverableIgnore(avatarId);
  const { data: speechData, isLoading: speechLoading } = useSpeechCompleteness(avatarId);
  const { data: project } = useProject(projectId);

  const [showIgnored, setShowIgnored] = useState(true);
  const [sequenceOpen, setSequenceOpen] = useState(false);

  const slots = useExpandedSettings(settings);
  const enabledSlots = slots.filter((s) => s.is_enabled);

  /** Unique seed-image tracks (e.g. "Clothed", "Topless") derived from enabled slots. */
  const seedTracks = useMemo(() => {
    const seen = new Map<string, string>(); // slug → display name
    for (const slot of enabledSlots) {
      const slug = slot.track_slug ?? "default";
      if (!seen.has(slug)) {
        seen.set(slug, slot.track_name ?? "Default");
      }
    }
    return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
  }, [enabledSlots]);

  // Derive initial visible sections from project blocking_deliverables
  const { initialSections, blockingKeys } = useMemo(() => {
    const bd = project?.blocking_deliverables;
    if (!bd || bd.length === 0) {
      const allKeys = new Set<SectionKey>(SECTION_KEYS);
      return { initialSections: SECTION_KEYS as Iterable<SectionKey>, blockingKeys: allKeys };
    }
    const mapped = bd
      .map((k) => BLOCKING_KEY_MAP[k])
      .filter((k): k is SectionKey => k != null);
    const bKeys = new Set<SectionKey>(mapped);
    // Only blocking sections are initially visible; non-blocking start deselected
    return { initialSections: mapped, blockingKeys: bKeys };
  }, [project?.blocking_deliverables]);

  // Section filter state — only blocking sections visible by default
  const [visibleSections, toggleSection] = useSetToggle<SectionKey>(initialSections);

  function toggleIgnore(sceneTypeId: number, trackId: number | null) {
    const existing = isIgnored(ignores, sceneTypeId, trackId);
    if (existing) {
      removeIgnore.mutate(existing.uuid);
    } else {
      addIgnore.mutate({ scene_type_id: sceneTypeId, track_id: trackId });
    }
  }

  /** Slots filtered by ignore visibility toggle. */
  const visibleSlots = showIgnored
    ? enabledSlots
    : enabledSlots.filter((s) => !isIgnored(ignores, s.scene_type_id, s.track_id ?? null));

  const isLoading = variantsLoading || scenesLoading || settingsLoading;

  if (isLoading) return <LoadingPane />;

  return (
    <Stack gap={6}>
      {/* Section filter */}
      <div className="flex items-center justify-end gap-[var(--spacing-2)]">
        <Button
          variant="secondary"
          size="xs"
          icon={<EyeOff size={12} />}
          onClick={() => setShowIgnored((p) => !p)}
        >
          {showIgnored ? "Hide Ignored" : "Show Ignored"}
        </Button>
        <SectionFilter visible={visibleSections} onToggle={toggleSection} blockingKeys={blockingKeys} />
      </div>

      {/* Section 1: Metadata */}
      {visibleSections.has("metadata") && (
        <div className={cn(!blockingKeys.has("metadata") && "opacity-70")}>
          <MetadataSection
            avatarId={avatarId}
            projectId={projectId}
            avatarName={avatarName}
            projectName={projectName}
            optional={!blockingKeys.has("metadata")}
          />
        </div>
      )}

      {/* Section 2: Images (seed images only — one per track) */}
      {visibleSections.has("images") && (
        <div className={cn(!blockingKeys.has("images") && "opacity-70")}>
          <TerminalSection
            title="Images"
            actions={!blockingKeys.has("images") ? <Badge size="sm" variant="default">optional</Badge> : undefined}
          >
            {seedTracks.length === 0 ? (
              <EmptyState
                icon={<Image size={32} />}
                title="No scene slots"
                description="Enable scene settings to see expected image deliverables."
              />
            ) : (
              <Stack gap={0}>
                {seedTracks.map((track) => (
                  <SeedImageSlot
                    key={track.slug}
                    label={track.name}
                    trackSlug={track.slug}
                    variants={variants ?? []}
                  />
                ))}
              </Stack>
            )}
          </TerminalSection>
        </div>
      )}

      {/* Section 3: Scene Videos */}
      {visibleSections.has("scene-videos") && (
        <div className={cn(!blockingKeys.has("scene-videos") && "opacity-70")}>
          <TerminalSection
            title="Scene Videos"
            actions={
              <div className="flex items-center gap-2">
                {!blockingKeys.has("scene-videos") && <Badge size="sm" variant="default">optional</Badge>}
                {enabledSlots.length > 0 && (
                  <Button variant="secondary" size="xs" icon={<Play size={12} />} onClick={() => setSequenceOpen(true)}>
                    Play Sequence
                  </Button>
                )}
              </div>
            }
          >
            {visibleSlots.length === 0 ? (
              <EmptyState
                icon={<Video size={32} />}
                title="No scene slots"
                description={
                  enabledSlots.length > 0
                    ? "All slots are ignored."
                    : "Enable scene settings to see expected video deliverables."
                }
              />
            ) : (
              <Stack gap={0}>
                {visibleSlots.map((slot) => {
                  const ig = isIgnored(ignores, slot.scene_type_id, slot.track_id ?? null);
                  return (
                    <VideoSlot
                      key={`${slot.scene_type_id}-${slot.track_id ?? "none"}`}
                      slot={slot}
                      scenes={scenes ?? []}
                      ignored={ig}
                      onToggleIgnore={() => toggleIgnore(slot.scene_type_id, slot.track_id ?? null)}
                    />
                  );
                })}
              </Stack>
            )}
          </TerminalSection>
        </div>
      )}

      {/* Section 4: Speech */}
      {visibleSections.has("speech") && (
        <div className={cn(!blockingKeys.has("speech") && "opacity-70")}>
          <TerminalSection
            title={`Speech (${speechData?.filled_slots ?? 0}/${speechData?.total_slots ?? 0})`}
            actions={!blockingKeys.has("speech") ? <Badge size="sm" variant="default">optional</Badge> : undefined}
          >
            {speechLoading ? (
              <LoadingPane />
            ) : !speechData?.breakdown?.length ? (
              <EmptyState
                icon={<Mic size={32} />}
                title="No speech slots"
                description="Configure speech types and languages in project settings to see expected speech deliverables."
              />
            ) : (
              <Stack gap={0}>
                {speechData.breakdown.map((entry) => (
                  <SpeechRow
                    key={`${entry.speech_type_id}-${entry.language_id}`}
                    entry={entry}
                  />
                ))}
              </Stack>
            )}
          </TerminalSection>
        </div>
      )}

      {/* Sequence Player overlay */}
      {sequenceOpen && (
        <SequencePlayer
          slots={enabledSlots}
          scenes={scenes ?? []}
          onClose={() => setSequenceOpen(false)}
        />
      )}
    </Stack>
  );
}
