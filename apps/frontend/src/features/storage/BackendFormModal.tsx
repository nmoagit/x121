/**
 * Modal form for creating or editing a storage backend (PRD-48).
 *
 * Renders type-conditional config fields:
 * - Local → base_path
 * - S3 → bucket, region, access_key_id, secret_access_key, endpoint, path_prefix
 * - NFS → mount_path
 */

import { useEffect, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Checkbox, Input, Select } from "@/components/primitives";
import {
  TERMINAL_BODY,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_INPUT,
  TERMINAL_PANEL,
  TERMINAL_SELECT,
} from "@/lib/ui-classes";

import { useCreateBackend, useTestS3Connection, useUpdateBackend } from "./hooks/use-storage";
import type {
  CreateStorageBackend,
  StorageBackend,
  StorageBackendTypeId,
  StorageTier,
  UpdateStorageBackend,
} from "./types";
import { BACKEND_TYPE, BACKEND_TYPE_LABELS, TIER_LABELS } from "./types";
import { TYPO_DATA, TYPO_DATA_DANGER } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Constants (derived from shared label maps — never duplicate labels)
   -------------------------------------------------------------------------- */

const TYPE_OPTIONS = (Object.entries(BACKEND_TYPE_LABELS) as [string, string][]).map(
  ([value, label]) => ({ value, label }),
);

const TIER_OPTIONS = (Object.entries(TIER_LABELS) as [string, string][]).map(
  ([value, label]) => ({ value, label }),
);

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface BackendFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Existing backend to edit, or `null` to create a new one. */
  backend?: StorageBackend | null;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BackendFormModal({ open, onClose, backend }: BackendFormModalProps) {
  const isEditing = !!backend;

  // Common fields
  const [name, setName] = useState("");
  const [typeId, setTypeId] = useState(String(BACKEND_TYPE.LOCAL));
  const [tier, setTier] = useState<StorageTier>("hot");
  const [isDefault, setIsDefault] = useState(false);

  // Local config
  const [basePath, setBasePath] = useState("");

  // S3 config
  const [bucket, setBucket] = useState("");
  const [region, setRegion] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [pathPrefix, setPathPrefix] = useState("");

  // NFS config
  const [mountPath, setMountPath] = useState("");

  // Mutations
  const createBackend = useCreateBackend();
  const updateBackend = useUpdateBackend(backend?.id ?? 0);
  const testConnection = useTestS3Connection();

  // Sync local state when modal opens
  useEffect(() => {
    if (!open) return;

    if (backend) {
      setName(backend.name);
      setTypeId(String(backend.backend_type_id));
      setTier(backend.tier);
      setIsDefault(backend.is_default);

      const cfg = backend.config;
      setBasePath((cfg.base_path as string) ?? "");
      setBucket((cfg.bucket as string) ?? "");
      setRegion((cfg.region as string) ?? "");
      setAccessKeyId((cfg.access_key_id as string) ?? "");
      setSecretAccessKey((cfg.secret_access_key as string) ?? "");
      setEndpoint((cfg.endpoint as string) ?? "");
      setPathPrefix((cfg.path_prefix as string) ?? "");
      setMountPath((cfg.mount_path as string) ?? "");
    } else {
      setName("");
      setTypeId(String(BACKEND_TYPE.LOCAL));
      setTier("hot");
      setIsDefault(false);
      setBasePath("");
      setBucket("");
      setRegion("");
      setAccessKeyId("");
      setSecretAccessKey("");
      setEndpoint("");
      setPathPrefix("");
      setMountPath("");
    }
  }, [open, backend]);

  const selectedType = Number(typeId) as StorageBackendTypeId;

  function buildConfig(): Record<string, unknown> {
    switch (selectedType) {
      case BACKEND_TYPE.LOCAL:
        return { base_path: basePath };
      case BACKEND_TYPE.S3: {
        const cfg: Record<string, unknown> = {
          bucket,
          region,
          access_key_id: accessKeyId,
          secret_access_key: secretAccessKey,
        };
        if (endpoint) cfg.endpoint = endpoint;
        if (pathPrefix) cfg.path_prefix = pathPrefix;
        return cfg;
      }
      case BACKEND_TYPE.NFS:
        return { mount_path: mountPath };
      default:
        return {};
    }
  }

  function handleSave() {
    if (!name.trim()) return;

    const config = buildConfig();

    if (isEditing) {
      const payload: UpdateStorageBackend = {
        name: name.trim(),
        tier,
        config,
        is_default: isDefault,
      };
      updateBackend.mutate(payload, { onSuccess: onClose });
    } else {
      const payload: CreateStorageBackend = {
        name: name.trim(),
        backend_type_id: selectedType,
        tier,
        config,
        is_default: isDefault,
      };
      createBackend.mutate(payload, { onSuccess: onClose });
    }
  }

  function handleTestConnection() {
    if (!bucket || !region || !accessKeyId || !secretAccessKey) return;
    testConnection.mutate({
      bucket,
      region,
      access_key_id: accessKeyId,
      secret_access_key: secretAccessKey,
      endpoint: endpoint || undefined,
    });
  }

  const saving = createBackend.isPending || updateBackend.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? "Edit Storage Backend" : "Add Storage Backend"}
      size="md"
    >
      <Stack gap={4}>
        {/* General section */}
        <div className={TERMINAL_PANEL}>
          <div className={TERMINAL_HEADER}>
            <span className={TERMINAL_HEADER_TITLE}>General</span>
          </div>
          <div className={`${TERMINAL_BODY} space-y-3`}>
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Primary Local Storage"
              className={TERMINAL_INPUT}
            />

            <Select
              label="Type"
              options={TYPE_OPTIONS}
              value={typeId}
              onChange={setTypeId}
              disabled={isEditing}
              className={TERMINAL_SELECT}
            />

            <Select
              label="Tier"
              options={TIER_OPTIONS}
              value={tier}
              onChange={(v) => setTier(v as StorageTier)}
              className={TERMINAL_SELECT}
            />

            <Checkbox label="Set as default backend" checked={isDefault} onChange={setIsDefault} />
          </div>
        </div>

        {/* Local config */}
        {selectedType === BACKEND_TYPE.LOCAL && (
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_HEADER}>
              <span className={TERMINAL_HEADER_TITLE}>Local Configuration</span>
            </div>
            <div className={`${TERMINAL_BODY} space-y-3`}>
              <Input
                label="Base Path"
                value={basePath}
                onChange={(e) => setBasePath(e.target.value)}
                placeholder="/mnt/storage"
                className={TERMINAL_INPUT}
              />
            </div>
          </div>
        )}

        {/* S3 config */}
        {selectedType === BACKEND_TYPE.S3 && (
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_HEADER}>
              <span className={TERMINAL_HEADER_TITLE}>S3 Configuration</span>
            </div>
            <div className={`${TERMINAL_BODY} space-y-3`}>
              <Input
                label="Bucket"
                value={bucket}
                onChange={(e) => setBucket(e.target.value)}
                placeholder="my-bucket"
                className={TERMINAL_INPUT}
              />
              <Input
                label="Region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
                className={TERMINAL_INPUT}
              />
              <Input
                label="Access Key ID"
                value={accessKeyId}
                onChange={(e) => setAccessKeyId(e.target.value)}
                className={TERMINAL_INPUT}
              />
              <Input
                label="Secret Access Key"
                type="password"
                value={secretAccessKey}
                onChange={(e) => setSecretAccessKey(e.target.value)}
                className={TERMINAL_INPUT}
              />
              <Input
                label="Endpoint (optional)"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://s3.custom-endpoint.com"
                className={TERMINAL_INPUT}
              />
              <Input
                label="Path Prefix (optional)"
                value={pathPrefix}
                onChange={(e) => setPathPrefix(e.target.value)}
                placeholder="uploads/"
                className={TERMINAL_INPUT}
              />

              <Button
                variant="secondary"
                size="xs"
                onClick={handleTestConnection}
                loading={testConnection.isPending}
                disabled={!bucket || !region || !accessKeyId || !secretAccessKey}
              >
                Test Connection
              </Button>

              {testConnection.isSuccess && (
                <p
                  className={`${TYPO_DATA} ${
                    testConnection.data.success
                      ? "text-[var(--color-data-green)]"
                      : "text-[var(--color-data-red)]"
                  }`}
                >
                  {testConnection.data.message}
                  {testConnection.data.latency_ms != null &&
                    ` (${testConnection.data.latency_ms}ms)`}
                </p>
              )}

              {testConnection.isError && (
                <p className={TYPO_DATA_DANGER}>Connection test failed.</p>
              )}
            </div>
          </div>
        )}

        {/* NFS config */}
        {selectedType === BACKEND_TYPE.NFS && (
          <div className={TERMINAL_PANEL}>
            <div className={TERMINAL_HEADER}>
              <span className={TERMINAL_HEADER_TITLE}>NFS Configuration</span>
            </div>
            <div className={`${TERMINAL_BODY} space-y-3`}>
              <Input
                label="Mount Path"
                value={mountPath}
                onChange={(e) => setMountPath(e.target.value)}
                placeholder="/mnt/nfs-share"
                className={TERMINAL_INPUT}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-[var(--spacing-2)]">
          <Button variant="secondary" size="xs" onClick={onClose}>
            Cancel
          </Button>
          <Button size="xs" onClick={handleSave} loading={saving} disabled={!name.trim()}>
            {isEditing ? "Save Changes" : "Create Backend"}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
