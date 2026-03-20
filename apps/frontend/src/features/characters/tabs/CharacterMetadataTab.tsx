/**
 * Character metadata tab — sectioned form driven by metadata template.
 *
 * Supports:
 * - Structured sections (biographical, appearance, favorites, etc.)
 * - Bio.json + tov.json drag-and-drop upload with Generate button
 * - Advanced Mode toggle for raw JSON editing
 * - Required field indicators and completeness tracking
 * - Custom field addition in the optional section
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ConfirmDeleteModal, Modal } from "@/components/composite";
import { TerminalSection } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Input, LoadingPane, Toggle, Tooltip } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { readFileAsJson } from "@/lib/file-types";
import { formatDate } from "@/lib/format";
import { isValidJson } from "@/lib/validation";
import { ArrowLeft, ArrowRight, Check, Eye, Info, Plus, Sparkles, Trash2, X } from "@/tokens/icons";
import { ApprovalActions } from "@/components/domain/ApprovalActions";

import {
  useCharacterMetadata,
  useCharacterSettings,
  useMetadataTemplate,
  useUpdateCharacterMetadata,
  useUpdateCharacterSettings,
} from "../hooks/use-character-detail";
import {
  useActivateVersion,
  useApproveMetadataVersion,
  useCreateManualVersion,
  useDeleteVersion,
  useGenerateMetadata,
  useMarkOutdated,
  useMetadataVersions,
  useRejectMetadataApproval,
  useRejectVersion,
  useUnapproveMetadataVersion,
} from "../hooks/use-metadata-versions";
import {
  useApproveRefinement,
  useClearOutdated,
  useRejectRefinement,
  useRefinementJobs,
  useTriggerRefinement,
} from "../hooks/use-refinement";
import { flattenMetadata, unflattenMetadata } from "../lib/metadata-flatten";
import {
  METADATA_APPROVAL_LABEL,
  SETTING_KEY_VOICE,
  SOURCE_KEYS,
  SOURCE_KEY_BIO,
  SOURCE_KEY_TOV,
  groupFieldsIntoSections,
} from "../types";
import type { MetadataSection, MetadataTemplateField, MetadataVersion } from "../types";
import { GenerationReportCard } from "./GenerationReportCard";
import { MetadataFieldInput } from "./MetadataFieldInput";
import { MetadataJsonDropZone } from "./MetadataJsonDropZone";
import { RefinementJobCard } from "./RefinementJobCard";
import { RejectVersionModal } from "./RejectVersionModal";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CharacterMetadataTabProps {
  characterId: number;
  projectId: number;
}

export function CharacterMetadataTab({ characterId, projectId }: CharacterMetadataTabProps) {
  const { data: metadataResponse, isLoading: metaLoading } = useCharacterMetadata(characterId);
  const { data: templateResponse, isLoading: templateLoading } = useMetadataTemplate(characterId);
  const updateMetadata = useUpdateCharacterMetadata(characterId);
  const { data: settings } = useCharacterSettings(projectId, characterId);
  const updateSettings = useUpdateCharacterSettings(projectId, characterId);

  // Version hooks
  const { data: versions } = useMetadataVersions(characterId);
  const generateMetadataApi = useGenerateMetadata(characterId);
  const createVersion = useCreateManualVersion(characterId);
  const activateVersion = useActivateVersion(characterId);
  const rejectVersion = useRejectVersion(characterId);
  const deleteVersion = useDeleteVersion(characterId);
  const approveMetadata = useApproveMetadataVersion(characterId);
  const unapproveMetadata = useUnapproveMetadataVersion(characterId);
  const rejectMetadataApproval = useRejectMetadataApproval(characterId);

  // Refinement hooks (PRD-125)
  const { data: refinementJobs } = useRefinementJobs(characterId);
  const triggerRefinement = useTriggerRefinement(characterId);
  const approveRefinement = useApproveRefinement(characterId);
  const rejectRefinement = useRejectRefinement(characterId);
  const clearOutdated = useClearOutdated(characterId);
  const markOutdated = useMarkOutdated(characterId);

  // Version UI state
  const [rejectTarget, setRejectTarget] = useState<MetadataVersion | null>(null);
  const [rejectApprovalTarget, setRejectApprovalTarget] = useState<MetadataVersion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MetadataVersion | null>(null);
  const [lastGeneratedReport, setLastGeneratedReport] = useState<MetadataVersion | null>(null);
  const [previewVersion, setPreviewVersion] = useState<MetadataVersion | null>(null);
  const [pendingImport, setPendingImport] = useState<Record<string, unknown> | null>(null);

  // State
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [advancedMode, setAdvancedMode] = useState(false);
  const [advancedJson, setAdvancedJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [bioJson, setBioJsonState] = useState<Record<string, unknown> | null>(null);
  const [tovJson, setTovJsonState] = useState<Record<string, unknown> | null>(null);
  const [newKey, setNewKey] = useState("");
  const [metaDragOver, setMetaDragOver] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<"metadata" | "bio" | "tov" | "avatar" | null>(null);
  const advancedRef = useRef<HTMLTextAreaElement>(null);

  // Wrap bio/tov setters to persist source data in draft AND immediately save to DB.
  // When a new source file is uploaded, mark active versions as outdated (PRD-013 A.1).
  const setBioJson = useCallback((data: Record<string, unknown> | null) => {
    setBioJsonState(data);
    setDraft((prev) => {
      if (data) return { ...prev, [SOURCE_KEY_BIO]: data };
      const next = { ...prev };
      delete next[SOURCE_KEY_BIO];
      return next;
    });
    // Persist immediately — don't require manual Save
    updateMetadata.mutate(
      data ? { [SOURCE_KEY_BIO]: data } : { [SOURCE_KEY_BIO]: null },
    );
    // Flag active versions as outdated when a new bio file is uploaded
    if (data) {
      markOutdated.mutate("Bio source file updated");
    }
  }, [updateMetadata, markOutdated]);

  const setTovJson = useCallback((data: Record<string, unknown> | null) => {
    setTovJsonState(data);
    setDraft((prev) => {
      if (data) return { ...prev, [SOURCE_KEY_TOV]: data };
      const next = { ...prev };
      delete next[SOURCE_KEY_TOV];
      return next;
    });
    // Persist immediately — don't require manual Save
    updateMetadata.mutate(
      data ? { [SOURCE_KEY_TOV]: data } : { [SOURCE_KEY_TOV]: null },
    );
    // Flag active versions as outdated when a new tov file is uploaded
    if (data) {
      markOutdated.mutate("ToV source file updated");
    }
  }, [updateMetadata, markOutdated]);

  /** Handle metadata.json dropped anywhere on the tab — show confirmation first. */
  const handleMetadataDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes("Files")) return;
      e.preventDefault();
      setMetaDragOver(false);

      const file = e.dataTransfer.files[0];
      if (!file || !file.name.toLowerCase().endsWith(".json")) return;

      const parsed = await readFileAsJson(file);
      if (parsed) setPendingImport(parsed);
    },
    [],
  );

  const handleConfirmImport = useCallback(() => {
    if (!pendingImport) return;
    // Strip source keys so imported JSON never overwrites bio/tov source data
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(pendingImport)) {
      if (!SOURCE_KEYS.has(key)) sanitized[key] = value;
    }
    createVersion.mutate(
      { metadata: sanitized, source: "json_import", activate: true },
      { onSuccess: () => setPendingImport(null) },
    );
  }, [pendingImport, createVersion]);

  const handleMetadataDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setMetaDragOver(true);
  }, []);

  const handleMetadataDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setMetaDragOver(false);
  }, []);

  // Derive sections from template fields
  const sections: MetadataSection[] = useMemo(() => {
    if (!templateResponse?.fields?.length) return [];
    return groupFieldsIntoSections(templateResponse.fields);
  }, [templateResponse?.fields]);

  // Set of template field names for quick lookup
  const templateFieldNames = useMemo(() => {
    if (!templateResponse?.fields) return new Set<string>();
    return new Set(templateResponse.fields.map((f) => f.field_name));
  }, [templateResponse?.fields]);

  // Sync draft from API response + restore source JSONs
  useEffect(() => {
    if (metadataResponse) {
      const raw: Record<string, unknown> = {};
      if (metadataResponse.fields) {
        for (const f of metadataResponse.fields as Array<{ name: string; value: unknown }>) {
          if (f.value != null) raw[f.name] = f.value;
        }
      }

      // Extract source blobs BEFORE flattening (flattenMetadata would
      // break them into dot-notation keys, destroying the original objects).
      // Fall back to the active version's source_bio/source_tov columns —
      // after Generate, the metadata blob no longer has _source_bio/_source_tov
      // but the version record preserves them.
      const activeVer = versions?.find((v) => v.is_active);
      const storedBio = raw[SOURCE_KEY_BIO] ?? activeVer?.source_bio ?? null;
      const storedTov = raw[SOURCE_KEY_TOV] ?? activeVer?.source_tov ?? null;
      if (storedBio && typeof storedBio === "object") {
        setBioJsonState(storedBio as Record<string, unknown>);
      } else {
        setBioJsonState(null);
      }
      if (storedTov && typeof storedTov === "object") {
        setTovJsonState(storedTov as Record<string, unknown>);
      } else {
        setTovJsonState(null);
      }

      // Remove source keys before flattening so they don't get expanded
      // into dot-notation entries, then re-insert as whole objects
      delete raw[SOURCE_KEY_BIO];
      delete raw[SOURCE_KEY_TOV];
      const flat = flattenMetadata(raw);
      if (storedBio) flat[SOURCE_KEY_BIO] = storedBio;
      if (storedTov) flat[SOURCE_KEY_TOV] = storedTov;

      setDraft(flat);
      setIsDirty(false);
    }
  }, [metadataResponse, versions]);

  // Sync advanced JSON from draft
  useEffect(() => {
    if (advancedMode) {
      const nested = unflattenMetadata(draft);
      setAdvancedJson(JSON.stringify(nested, null, 2));
      setJsonError(null);
    }
  }, [advancedMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-resize advanced JSON textarea to fit content
  useEffect(() => {
    const el = advancedRef.current;
    if (!el || !advancedMode) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [advancedJson, advancedMode]);

  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setDraft((prev) => ({ ...prev, [fieldName]: value }));
    setIsDirty(true);
  }, []);

  const handleFieldDelete = useCallback((fieldName: string) => {
    setDraft((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
    setIsDirty(true);
  }, []);

  const handleAddField = useCallback(() => {
    const trimmed = newKey.trim();
    if (!trimmed || trimmed in draft) return;
    setDraft((prev) => ({ ...prev, [trimmed]: "" }));
    setNewKey("");
    setIsDirty(true);
  }, [newKey, draft]);

  const handleGenerate = useCallback(() => {
    generateMetadataApi.mutate(
      { bio_json: bioJson, tov_json: tovJson, activate: true },
      {
        onSuccess: (data) => {
          // The backend created + activated a new version AND synced to characters.metadata.
          // The query invalidation in the hook will refetch metadata & versions.
          setLastGeneratedReport(data);
          setIsDirty(false);
        },
      },
    );
  }, [bioJson, tovJson, generateMetadataApi]);

  const handleGenerateAvatarJson = useCallback(async () => {
    const { generateAvatarJson } = await import("../lib/avatar-json-transform");
    // Build metadata payload from current draft (exclude source keys)
    const payload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(draft)) {
      if (!SOURCE_KEYS.has(key) && value != null && value !== "") {
        payload[key] = value;
      }
    }
    const result = generateAvatarJson(payload, settings ?? {});
    updateSettings.mutate({ avatar_json: result });
  }, [draft, settings, updateSettings]);

  const handleConfirmClear = useCallback(() => {
    if (confirmTarget === "bio") {
      setBioJson(null);
    } else if (confirmTarget === "tov") {
      setTovJson(null);
    } else if (confirmTarget === "metadata") {
      // Keep source keys, clear everything else
      const preserved: Record<string, unknown> = {};
      if (draft[SOURCE_KEY_BIO]) preserved[SOURCE_KEY_BIO] = draft[SOURCE_KEY_BIO];
      if (draft[SOURCE_KEY_TOV]) preserved[SOURCE_KEY_TOV] = draft[SOURCE_KEY_TOV];
      setDraft(preserved);
      // Build payload that explicitly nulls all non-source keys so the
      // backend's merge overwrites them (sending only preserved keys
      // would leave old values intact due to merge semantics).
      const payload: Record<string, unknown> = {};
      for (const key of Object.keys(draft)) {
        if (SOURCE_KEYS.has(key)) {
          payload[key] = draft[key];
        } else {
          payload[key] = null;
        }
      }
      updateMetadata.mutate(payload, {
        onSuccess: () => setIsDirty(false),
      });
    } else if (confirmTarget === "avatar") {
      updateSettings.mutate({ avatar_json: null });
    }
    setConfirmTarget(null);
  }, [confirmTarget, draft, setBioJson, setTovJson, updateMetadata, updateSettings]);

  const confirmLabels: Record<"metadata" | "bio" | "tov" | "avatar", { title: string; entity: string; warning: string }> = {
    metadata: {
      title: "Clear Metadata",
      entity: "all metadata fields",
      warning: "This will remove all field values and save immediately.",
    },
    bio: {
      title: "Clear bio.json",
      entity: "bio.json source data",
      warning: "This will remove the uploaded bio.json and save immediately.",
    },
    tov: {
      title: "Clear tov.json",
      entity: "tov.json source data",
      warning: "This will remove the uploaded tov.json and save immediately.",
    },
    avatar: {
      title: "Clear AvatarJSON",
      entity: "the generated AvatarJSON",
      warning: "This will remove the AvatarJSON from settings and save immediately.",
    },
  };

  const handleToggleAdvanced = useCallback(
    (checked: boolean) => {
      if (checked) {
        // Form → JSON
        const nested = unflattenMetadata(draft);
        setAdvancedJson(JSON.stringify(nested, null, 2));
        setJsonError(null);
      } else {
        // JSON → Form
        if (isValidJson(advancedJson)) {
          const parsed = JSON.parse(advancedJson);
          setDraft(flattenMetadata(parsed));
          setJsonError(null);
        }
      }
      setAdvancedMode(checked);
    },
    [draft, advancedJson],
  );

  const handleAdvancedJsonChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setAdvancedJson(text);
    if (isValidJson(text)) {
      setJsonError(null);
      setIsDirty(true);
    } else {
      setJsonError("Invalid JSON");
    }
  }, []);

  const handleSave = useCallback(() => {
    let payload: Record<string, unknown>;
    if (advancedMode) {
      if (!isValidJson(advancedJson)) return;
      const parsed = JSON.parse(advancedJson);
      // Flatten so the backend can unflatten correctly
      payload = flattenMetadata(parsed);
    } else {
      payload = { ...draft };
    }

    updateMetadata.mutate(payload, {
      onSuccess: () => setIsDirty(false),
    });
  }, [draft, advancedMode, advancedJson, updateMetadata]);

  // --- Version preview & diff ---

  // Flatten the preview version's metadata for display
  const previewFlat = useMemo(() => {
    if (!previewVersion) return null;
    return flattenMetadata(previewVersion.metadata);
  }, [previewVersion]);

  // Find the active version for diff comparison
  const activeVersion = useMemo(
    () => versions?.find((v) => v.is_active) ?? null,
    [versions],
  );

  const activeFlat = useMemo(() => {
    if (!activeVersion) return null;
    return flattenMetadata(activeVersion.metadata);
  }, [activeVersion]);

  // Compute diff between preview version and active version
  const diffMap = useMemo(() => {
    if (!previewFlat || !activeFlat) return new Map<string, "added" | "removed" | "changed">();
    const map = new Map<string, "added" | "removed" | "changed">();

    const allKeys = new Set([
      ...Object.keys(previewFlat).filter((k) => !SOURCE_KEYS.has(k)),
      ...Object.keys(activeFlat).filter((k) => !SOURCE_KEYS.has(k)),
    ]);

    for (const key of allKeys) {
      const inPreview = key in previewFlat;
      const inActive = key in activeFlat;

      if (inPreview && !inActive) {
        map.set(key, "added");
      } else if (!inPreview && inActive) {
        map.set(key, "removed");
      } else if (inPreview && inActive) {
        const a = JSON.stringify(previewFlat[key]);
        const b = JSON.stringify(activeFlat[key]);
        if (a !== b) map.set(key, "changed");
      }
    }
    return map;
  }, [previewFlat, activeFlat]);

  // Navigation helpers for cycling through versions
  const sortedVersions = useMemo(
    () => versions ? [...versions].sort((a, b) => b.version_number - a.version_number) : [],
    [versions],
  );

  const previewIndex = previewVersion
    ? sortedVersions.findIndex((v) => v.id === previewVersion.id)
    : -1;

  const handlePrevVersion = useCallback(() => {
    if (previewIndex < sortedVersions.length - 1) {
      setPreviewVersion(sortedVersions[previewIndex + 1] ?? null);
    }
  }, [previewIndex, sortedVersions]);

  const handleNextVersion = useCallback(() => {
    if (previewIndex > 0) {
      setPreviewVersion(sortedVersions[previewIndex - 1] ?? null);
    }
  }, [previewIndex, sortedVersions]);

  // No-op handler for read-only preview fields
  const noopChange = useCallback(() => {}, []);

  if (metaLoading || templateLoading) {
    return <LoadingPane />;
  }

  // Completeness calculation
  const requiredFields = templateResponse?.fields?.filter((f) => f.is_required) ?? [];
  const totalRequired = requiredFields.length;
  const filledRequired = requiredFields.filter((f) => {
    const val = draft[f.field_name];
    return val != null && val !== "";
  }).length;
  const completePct = totalRequired > 0 ? Math.round((filledRequired / totalRequired) * 100) : 100;

  // The data source for display: preview version's metadata or live draft
  const displayData = previewFlat ?? draft;
  const isPreview = !!previewVersion;

  // Diff indicator class for a field
  const diffClass = (fieldName: string): string => {
    if (!isPreview || !activeVersion || previewVersion?.id === activeVersion.id) return "";
    const status = diffMap.get(fieldName);
    if (status === "added") return "ring-1 ring-[var(--color-action-success)] rounded-[var(--radius-md)]";
    if (status === "removed") return "ring-1 ring-[var(--color-action-danger)] rounded-[var(--radius-md)]";
    if (status === "changed") return "ring-1 ring-[var(--color-action-warning)] rounded-[var(--radius-md)]";
    return "";
  };

  // Active version value for diff subtitle
  const diffSubtitle = (fieldName: string): string | null => {
    if (!isPreview || !activeFlat || previewVersion?.id === activeVersion?.id) return null;
    const status = diffMap.get(fieldName);
    if (status === "changed") {
      const val = activeFlat[fieldName];
      const display = Array.isArray(val)
        ? val.join(", ")
        : val != null && typeof val === "object"
          ? JSON.stringify(val)
          : val != null
            ? String(val)
            : "";
      return `Active: ${display}`;
    }
    if (status === "added") return "Not in active version";
    if (status === "removed") return "Only in active version";
    return null;
  };

  // Custom fields for display (preview or draft)
  const displayCustomKeys = Object.keys(displayData).filter(
    (k) => !templateFieldNames.has(k) && !SOURCE_KEYS.has(k),
  );

  /** Render a grid of fields inside a terminal section. */
  function renderFieldGrid(fields: { field_name: string; field: MetadataTemplateField }[]) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(({ field_name, field }) => {
          const subtitle = diffSubtitle(field_name);
          return (
            <div key={field_name} className={cn("relative", diffClass(field_name))}>
              <MetadataFieldInput
                field={field}
                value={displayData[field_name] ?? null}
                onChange={isPreview ? noopChange : handleFieldChange}
                onDelete={!isPreview && !field.is_required ? handleFieldDelete : undefined}
              />
              {subtitle && (
                <span className="block mt-0.5 px-1 text-[10px] text-[var(--color-text-muted)] italic">
                  {subtitle}
                </span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <Stack gap={4}>
      {/* Completeness ticker + Advanced toggle */}
      <div className="flex items-center justify-between rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] px-[var(--spacing-3)] py-[var(--spacing-2)] font-mono text-xs">
        <div className="flex items-center gap-3">
          <span className="uppercase tracking-wide text-[var(--color-text-muted)]">completeness:</span>
          <span className={`font-semibold text-sm ${completePct >= 100 ? "text-green-400" : "text-cyan-400"}`}>
            {completePct}%
          </span>
          <span className="text-[var(--color-text-muted)] opacity-30">|</span>
          <span className="text-[var(--color-text-muted)]">
            {filledRequired}/{totalRequired} required
          </span>
          {activeVersion?.outdated_at && (
            <>
              <span className="text-[var(--color-text-muted)] opacity-30">|</span>
              <Tooltip content="Source bio or tov files changed since this version was created. Consider re-generating or refining.">
                <span className="text-orange-400 cursor-help">outdated</span>
              </Tooltip>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  if (activeVersion) clearOutdated.mutate(activeVersion.id);
                }}
                disabled={clearOutdated.isPending}
              >
                Mark Current
              </Button>
            </>
          )}
        </div>
        <Toggle
          label="Advanced Mode"
          size="sm"
          checked={advancedMode}
          onChange={handleToggleAdvanced}
        />
      </div>

      {/* JSON upload zones */}
      <div className="grid grid-cols-2 gap-[var(--spacing-3)]">
        <MetadataJsonDropZone label="bio.json" value={bioJson} onChange={setBioJson} hidePreview />
        <MetadataJsonDropZone label="tov.json" value={tovJson} onChange={setTovJson} hidePreview />
      </div>

      {/* Source protection notice */}
      <div className="flex items-center gap-[var(--spacing-2)] rounded-[var(--radius-md)] bg-[var(--color-action-primary)]/5 px-3 py-2">
        <Info size={14} className="shrink-0 text-[var(--color-action-primary)]" />
        <span className="text-xs text-[var(--color-text-secondary)]">
          Importing metadata creates a new version. Bio and ToV files are not affected.
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[var(--spacing-2)]">
          {(bioJson || tovJson) && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleGenerate}
              disabled={generateMetadataApi.isPending}
            >
              {generateMetadataApi.isPending ? "Generating..." : "Generate Metadata"}
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleGenerateAvatarJson}
            disabled={
              Object.keys(draft).filter((k) => !SOURCE_KEYS.has(k)).length === 0 ||
              !settings?.a2c4_model ||
              !settings?.[SETTING_KEY_VOICE] ||
              updateSettings.isPending
            }
            title={
              !settings?.a2c4_model || !settings?.[SETTING_KEY_VOICE]
                ? "Requires metadata, a2c4 model, and ElevenLabs voice in Pipeline Settings"
                : undefined
            }
          >
            {updateSettings.isPending ? "Generating..." : "Generate AvatarJSON"}
          </Button>
        </div>
        <div className="flex items-center gap-[var(--spacing-2)]">
          {bioJson && (
            <Button
              variant="ghost"
              size="xs"
              icon={<Trash2 size={12} />}
              onClick={() => setConfirmTarget("bio")}
              className="!text-red-400 hover:!text-red-300"
            >
              bio.json
            </Button>
          )}
          {tovJson && (
            <Button
              variant="ghost"
              size="xs"
              icon={<Trash2 size={12} />}
              onClick={() => setConfirmTarget("tov")}
              className="!text-red-400 hover:!text-red-300"
            >
              tov.json
            </Button>
          )}
          {Object.entries(draft).some(([k, v]) => !SOURCE_KEYS.has(k) && v != null && v !== "") && (
            <Button
              variant="ghost"
              size="xs"
              icon={<Trash2 size={12} />}
              onClick={() => setConfirmTarget("metadata")}
              className="!text-red-400 hover:!text-red-300"
            >
              Metadata
            </Button>
          )}
          {settings?.avatar_json != null && (
            <Button
              variant="ghost"
              size="xs"
              icon={<Trash2 size={12} />}
              onClick={() => setConfirmTarget("avatar")}
              className="!text-red-400 hover:!text-red-300"
            >
              AvatarJSON
            </Button>
          )}
        </div>
      </div>

      {/* Version preview banner */}
      {previewVersion && (
        <div className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-accent)] bg-[var(--color-surface-accent-subtle)] px-3 py-2">
          <div className="flex items-center gap-[var(--spacing-2)]">
            <Eye size={14} className="text-[var(--color-text-accent)]" />
            <span className="text-xs font-medium text-[var(--color-text-primary)]">
              Viewing v{previewVersion.version_number}
            </span>
            <span className="text-xs font-mono text-[var(--color-text-muted)]">{previewVersion.source}</span>
            {previewVersion.is_active && <span className="text-xs font-mono text-green-400">active</span>}
            {previewVersion.rejection_reason && (
              <span className="text-xs font-mono text-red-400">rejected</span>
            )}
            {diffMap.size > 0 && (
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {diffMap.size} field{diffMap.size !== 1 ? "s" : ""} differ from active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowLeft size={14} />}
              onClick={handlePrevVersion}
              disabled={previewIndex >= sortedVersions.length - 1}
              title="Previous version (older)"
            />
            <span className="text-[10px] text-[var(--color-text-muted)]">
              {previewIndex + 1}/{sortedVersions.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={<ArrowRight size={14} />}
              onClick={handleNextVersion}
              disabled={previewIndex <= 0}
              title="Next version (newer)"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<X size={14} />}
              onClick={() => setPreviewVersion(null)}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      {/* Main content: sectioned form or advanced JSON — also a drop zone for metadata.json */}
      <div
        className="relative"
        onDragOver={handleMetadataDragOver}
        onDragLeave={handleMetadataDragLeave}
        onDrop={handleMetadataDrop}
      >
        {advancedMode ? (
          <div className="flex flex-col gap-1">
            <textarea
              ref={advancedRef}
              value={advancedJson}
              onChange={handleAdvancedJsonChange}
              className="w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[#0d1117] p-3 font-mono text-xs text-cyan-400 focus:outline-2 focus:outline-[var(--color-border-focus)]"
              spellCheck={false}
            />
            {jsonError && (
              <span className="text-xs text-[var(--color-action-danger)]">{jsonError}</span>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-[var(--spacing-3)]">
            {sections.map((section) => (
              <TerminalSection key={section.key} title={`${section.label} (${section.fields.length})`}>
                {renderFieldGrid(section.fields.map((f) => ({ field_name: f.field_name, field: f })))}
              </TerminalSection>
            ))}

            {/* Custom fields */}
            {displayCustomKeys.length > 0 && (
              <TerminalSection title={`Custom Fields (${displayCustomKeys.length})`}>
                {renderFieldGrid(displayCustomKeys.map((key) => ({
                  field_name: key,
                  field: {
                    id: 0, template_id: 0, field_name: key, field_type: "string",
                    is_required: false, constraints: {}, description: null,
                    sort_order: 999, created_at: "", updated_at: "",
                  } satisfies MetadataTemplateField,
                })))}
              </TerminalSection>
            )}

            {/* Add custom field */}
            <div className="flex items-center gap-[var(--spacing-2)]">
              <Input
                value={newKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewKey(e.target.value)}
                placeholder="Add custom field..."
                className="flex-1"
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter") handleAddField();
                }}
              />
              <Button
                variant="secondary"
                size="xs"
                icon={<Plus size={12} />}
                onClick={handleAddField}
                disabled={!newKey.trim() || newKey.trim() in draft}
              >
                Add
              </Button>
            </div>
          </div>
        )}

        {/* Drag overlay for metadata.json */}
        {metaDragOver && (
          <div
            className={cn(
              "absolute inset-0 z-40 flex items-center justify-center",
              "rounded-[var(--radius-lg)] border-2 border-dashed",
              "border-[var(--color-border-accent)] bg-[var(--color-surface-overlay)]",
              "pointer-events-none",
            )}
          >
            <p className="text-sm font-medium text-[var(--color-text-primary)]">
              Drop .json file to import as new version
            </p>
          </div>
        )}
      </div>

      {/* Save bar (hidden in preview mode) */}
      {!isPreview && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || updateMetadata.isPending || (advancedMode && !!jsonError)}
          >
            {updateMetadata.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      )}

      {/* Clear confirmation modal */}
      {confirmTarget && (
        <ConfirmDeleteModal
          open
          onClose={() => setConfirmTarget(null)}
          title={confirmLabels[confirmTarget].title}
          entityName={confirmLabels[confirmTarget].entity}
          warningText={confirmLabels[confirmTarget].warning}
          onConfirm={handleConfirmClear}
        />
      )}

      {/* Import metadata confirmation modal */}
      {pendingImport && (
        <Modal open onClose={() => setPendingImport(null)} title="Import Metadata" size="md">
          <Stack gap={4}>
            <p className="text-xs font-mono text-[var(--color-text-secondary)]">
              Import <strong>{Object.keys(pendingImport).filter((k) => !SOURCE_KEYS.has(k)).length} fields</strong> as a new metadata
              version? This will activate it and replace the current metadata.
            </p>
            <p className="text-xs font-mono text-[var(--color-text-muted)]">
              Your Bio and ToV source files will not be affected.
            </p>
            <div className="flex gap-2 justify-end pt-1 border-t border-[var(--color-border-default)]">
              <Button variant="secondary" size="sm" onClick={() => setPendingImport(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmImport}
                loading={createVersion.isPending}
              >
                Import &amp; Activate
              </Button>
            </div>
          </Stack>
        </Modal>
      )}

      {/* Generation report (shown after a generate run or when previewing a generated version) */}
      {(previewVersion?.generation_report ?? lastGeneratedReport?.generation_report) && (
        <div className="border-t border-[var(--color-border-default)] pt-[var(--spacing-3)]">
          <GenerationReportCard
            report={(previewVersion?.generation_report ?? lastGeneratedReport?.generation_report)!}
          />
        </div>
      )}

      {/* Version history */}
      {versions && versions.length > 0 && (
        <TerminalSection title={`Version History (${versions.length})`}>
          <div className="flex flex-col gap-px">
            {versions.map((v) => (
              <div
                key={v.id}
                className={cn(
                  "flex items-center justify-between rounded-[var(--radius-md)] px-3 py-1.5 cursor-pointer transition-colors font-mono text-xs",
                  v.is_active && "bg-green-400/10",
                  previewVersion?.id === v.id && !v.is_active && "bg-cyan-400/10",
                )}
                onClick={() => setPreviewVersion(previewVersion?.id === v.id ? null : v)}
              >
                <div className="flex items-center gap-2">
                  {previewVersion?.id === v.id && (
                    <Eye size={12} className="text-cyan-400" />
                  )}
                  <span className="font-semibold text-cyan-400">v{v.version_number}</span>
                  <span className="text-[var(--color-text-muted)]">{v.source}</span>
                  {v.is_active && <span className="text-green-400">active</span>}
                  {v.rejection_reason && (
                    <span className="text-red-400" title={v.rejection_reason}>rejected</span>
                  )}
                  {v.is_active && (
                    <span className={v.approval_status === "approved" ? "text-green-400" : v.approval_status === "rejected" ? "text-red-400" : "text-[var(--color-text-muted)]"} title={v.approval_comment ?? undefined}>
                      {METADATA_APPROVAL_LABEL[v.approval_status].toLowerCase()}
                    </span>
                  )}
                  <span className="text-[var(--color-text-muted)] opacity-60">{formatDate(v.created_at)}</span>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {v.is_active && (v.approval_status === "pending" || v.approval_status === "approved" || v.approval_status === "rejected") && (
                    <ApprovalActions
                      canApprove={v.approval_status === "pending" || v.approval_status === "rejected"}
                      canUnapprove={v.approval_status === "approved" || v.approval_status === "rejected"}
                      onApprove={() => approveMetadata.mutate(v.id)}
                      onUnapprove={() => unapproveMetadata.mutate(v.id)}
                      onReject={() => setRejectApprovalTarget(v)}
                      isApproving={approveMetadata.isPending}
                      isUnapproving={unapproveMetadata.isPending}
                    />
                  )}
                  {!v.is_active && !v.rejection_reason && (
                    <Button variant="ghost" size="xs" icon={<Check size={12} />} onClick={() => activateVersion.mutate(v.id)} disabled={activateVersion.isPending} title="Activate" />
                  )}
                  {!v.rejection_reason && (
                    <Button variant="ghost" size="xs" icon={<X size={12} />} onClick={() => setRejectTarget(v)} title="Reject" />
                  )}
                  {!v.is_active && (
                    <Button variant="danger" size="xs" icon={<Trash2 size={12} />} onClick={() => setDeleteTarget(v)} title="Delete" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </TerminalSection>
      )}

      {/* Reject version modal */}
      {rejectTarget && (
        <RejectVersionModal
          open
          onClose={() => setRejectTarget(null)}
          versionNumber={rejectTarget.version_number}
          isPending={rejectVersion.isPending}
          onConfirm={(reason) => {
            rejectVersion.mutate(
              { versionId: rejectTarget.id, reason },
              { onSuccess: () => setRejectTarget(null) },
            );
          }}
        />
      )}

      {/* Reject metadata approval modal */}
      {rejectApprovalTarget && (
        <RejectVersionModal
          open
          onClose={() => setRejectApprovalTarget(null)}
          versionNumber={rejectApprovalTarget.version_number}
          isPending={rejectMetadataApproval.isPending}
          onConfirm={(comment) => {
            rejectMetadataApproval.mutate(
              { versionId: rejectApprovalTarget.id, comment },
              { onSuccess: () => setRejectApprovalTarget(null) },
            );
          }}
        />
      )}

      {/* Delete version confirmation */}
      {deleteTarget && (
        <ConfirmDeleteModal
          open
          onClose={() => setDeleteTarget(null)}
          title={`Delete Version ${deleteTarget.version_number}`}
          entityName={`metadata version ${deleteTarget.version_number}`}
          warningText="This will permanently remove this version from the history."
          onConfirm={() => {
            deleteVersion.mutate(deleteTarget.id, {
              onSuccess: () => setDeleteTarget(null),
            });
          }}
        />
      )}

      {/* LLM Refinement section (PRD-125) */}
      <TerminalSection
        title="AI Refinement"
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<Sparkles size={14} />}
            onClick={() => triggerRefinement.mutate(true)}
            disabled={triggerRefinement.isPending}
          >
            {triggerRefinement.isPending ? "Queuing..." : "Refine with AI"}
          </Button>
        }
      >
        {refinementJobs && refinementJobs.length > 0 && (
          <div className="flex flex-col gap-[var(--spacing-2)]">
            {refinementJobs.map((job) => (
              <RefinementJobCard
                key={job.id}
                job={job}
                currentMetadata={draft}
                onApprove={(selectedFields) =>
                  approveRefinement.mutate({ jobUuid: job.uuid, selectedFields })
                }
                onReject={(reason) =>
                  rejectRefinement.mutate({ jobUuid: job.uuid, reason })
                }
                onRetry={
                  job.status === "failed"
                    ? () => triggerRefinement.mutate(job.enrich)
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </TerminalSection>

      {/* Raw JSON source viewers */}
      {(bioJson || tovJson) && (
        <div className="grid grid-cols-1 gap-[var(--spacing-4)] lg:grid-cols-2">
          {bioJson && (
            <TerminalSection title="bio.json">
              <pre className="max-h-[400px] overflow-auto font-mono text-[10px] leading-relaxed text-cyan-400">
                {JSON.stringify(bioJson, null, 2)}
              </pre>
            </TerminalSection>
          )}
          {tovJson && (
            <TerminalSection title="tov.json">
              <pre className="max-h-[400px] overflow-auto font-mono text-[10px] leading-relaxed text-cyan-400">
                {JSON.stringify(tovJson, null, 2)}
              </pre>
            </TerminalSection>
          )}
        </div>
      )}
    </Stack>
  );
}
