/**
 * Provider management: add, edit, test, and remove cloud providers.
 *
 * Renders as a modal dialog triggered from the control panel header.
 */

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Button, Input, Select } from "@/components/primitives";
import { Modal, ConfirmDeleteModal, useToast } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Plus, Trash2, Edit3, Shield, RefreshCw, Zap } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useCloudProviders,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  useTestConnection,
  useSyncGpuTypes,
  useGpuTypes,
  useProvisionInstance,
  type CloudProvider,
} from "@/features/admin/cloud-gpus/hooks/use-cloud-providers";
import { infraKeys } from "../hooks/use-all-instances";

/* --------------------------------------------------------------------------
   Provider type options
   -------------------------------------------------------------------------- */

const PROVIDER_TYPES = [
  { value: "runpod", label: "RunPod" },
  { value: "lambda", label: "Lambda Labs" },
  { value: "vast", label: "Vast.ai" },
  { value: "other", label: "Other" },
];

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface ProviderManagementProps {
  open: boolean;
  onClose: () => void;
}

export function ProviderManagement({ open, onClose }: ProviderManagementProps) {
  const { data: providers } = useCloudProviders();
  const [editingProvider, setEditingProvider] = useState<CloudProvider | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CloudProvider | null>(null);

  return (
    <>
      <Modal open={open} onClose={onClose} title="Cloud Providers" size="lg">
        <Stack gap={4}>
          {/* Provider list */}
          {providers?.map((provider) => (
            <ProviderRow
              key={provider.id}
              provider={provider}
              onEdit={() => setEditingProvider(provider)}
              onDelete={() => setDeleteTarget(provider)}
            />
          ))}

          {(!providers || providers.length === 0) && (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-4">
              No cloud providers configured yet.
            </p>
          )}

          {/* Add button / form */}
          {showAddForm ? (
            <ProviderForm onClose={() => setShowAddForm(false)} />
          ) : (
            <Button
              variant="secondary"
              size="sm"
              icon={<Plus size={iconSizes.sm} />}
              onClick={() => setShowAddForm(true)}
            >
              Add Provider
            </Button>
          )}
        </Stack>
      </Modal>

      {/* Edit modal */}
      {editingProvider && (
        <Modal
          open
          onClose={() => setEditingProvider(null)}
          title={`Edit ${editingProvider.name}`}
          size="md"
        >
          <ProviderForm
            provider={editingProvider}
            onClose={() => setEditingProvider(null)}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteProviderConfirm
          provider={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}

/* --------------------------------------------------------------------------
   Provider row
   -------------------------------------------------------------------------- */

function ProviderRow({
  provider,
  onEdit,
  onDelete,
}: {
  provider: CloudProvider;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const testConnection = useTestConnection(provider.id);
  const syncGpuTypes = useSyncGpuTypes(provider.id);
  const { data: gpuTypes } = useGpuTypes(provider.id);
  const provisionInstance = useProvisionInstance(provider.id);

  // Match the GPU type stored in provider settings (e.g. "NVIDIA RTX PRO 6000 Blackwell Server Edition")
  const preferredGpuId = provider.settings?.gpu_type_id as string | undefined;
  const defaultGpu =
    gpuTypes?.find((g) => g.gpu_id === preferredGpuId || g.name === preferredGpuId) ??
    gpuTypes?.[0] ??
    null;

  function handleQuickProvision() {
    if (!defaultGpu) {
      toast.addToast({ variant: "warning", message: "No GPU types available. Sync GPUs first." });
      return;
    }

    const settings = provider.settings ?? {};
    provisionInstance.mutate(
      {
        gpu_type_id: defaultGpu.id,
        template_id: (settings.template_id as string) ?? undefined,
        network_volume_id: (settings.network_volume_id as string) ?? undefined,
      },
      {
        onSuccess: () => {
          toast.addToast({ variant: "success", message: `Provisioning ${defaultGpu.name} instance...` });
          qc.invalidateQueries({ queryKey: infraKeys.allInstances() });
        },
        onError: (err) => {
          toast.addToast({ variant: "error", message: `Provision failed: ${err.message}` });
        },
      },
    );
  }

  function handleTest() {
    testConnection.mutate(undefined, {
      onSuccess: (data) => {
        if (data.healthy) {
          toast.addToast({ variant: "success", message: `Connection OK (${data.latency_ms}ms)` });
        } else {
          toast.addToast({ variant: "error", message: `Connection unhealthy: ${data.message ?? "unknown error"}` });
        }
      },
      onError: (err) => {
        toast.addToast({ variant: "error", message: `Connection test failed: ${err.message}` });
      },
    });
  }

  function handleSync() {
    syncGpuTypes.mutate(undefined, {
      onSuccess: (types) => {
        toast.addToast({ variant: "success", message: `Synced ${types.length} GPU type${types.length !== 1 ? "s" : ""}` });
      },
      onError: (err) => {
        toast.addToast({ variant: "error", message: `GPU sync failed: ${err.message}` });
      },
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border-default)] px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--color-text-primary)]">
          {provider.name}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {provider.provider_type}
          {provider.base_url && ` - ${provider.base_url}`}
        </div>
      </div>
      <Stack direction="horizontal" gap={1} className="shrink-0">
        <Button
          variant="primary"
          size="sm"
          icon={<Zap size={iconSizes.sm} />}
          onClick={handleQuickProvision}
          loading={provisionInstance.isPending}
          disabled={!defaultGpu}
          title={defaultGpu ? `Provision ${defaultGpu.name}` : "Sync GPUs first"}
        >
          Provision
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={iconSizes.sm} />}
          onClick={handleSync}
          loading={syncGpuTypes.isPending}
          title="Sync GPU types"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<Shield size={iconSizes.sm} />}
          onClick={handleTest}
          loading={testConnection.isPending}
          title="Test connection"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<Edit3 size={iconSizes.sm} />}
          onClick={onEdit}
          title="Edit provider"
        />
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={iconSizes.sm} />}
          onClick={onDelete}
          title="Remove provider"
        />
      </Stack>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Provider form (create / edit)
   -------------------------------------------------------------------------- */

interface ProviderFormProps {
  provider?: CloudProvider;
  onClose: () => void;
}

function ProviderForm({ provider, onClose }: ProviderFormProps) {
  const isEditing = !!provider;
  const settings = provider?.settings ?? {};

  const [name, setName] = useState(provider?.name ?? "");
  const [providerType, setProviderType] = useState(provider?.provider_type ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? "");

  // Provision defaults (stored in provider.settings)
  const [templateId, setTemplateId] = useState((settings.template_id as string) ?? "");
  const [networkVolumeId, setNetworkVolumeId] = useState((settings.network_volume_id as string) ?? "");
  const [volumeMountPath, setVolumeMountPath] = useState((settings.volume_mount_path as string) ?? "/workspace");
  const [dockerImage, setDockerImage] = useState((settings.docker_image as string) ?? "");
  const [containerDiskGb, setContainerDiskGb] = useState((settings.container_disk_gb as number) ?? 20);

  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider(provider?.id ?? 0);

  function buildSettings(): Record<string, unknown> {
    // Preserve any existing settings keys we don't manage
    const merged: Record<string, unknown> = { ...settings };
    if (templateId) merged.template_id = templateId; else delete merged.template_id;
    if (networkVolumeId) merged.network_volume_id = networkVolumeId; else delete merged.network_volume_id;
    if (volumeMountPath && volumeMountPath !== "/workspace") merged.volume_mount_path = volumeMountPath; else delete merged.volume_mount_path;
    if (dockerImage) merged.docker_image = dockerImage; else delete merged.docker_image;
    if (containerDiskGb && containerDiskGb !== 20) merged.container_disk_gb = containerDiskGb; else delete merged.container_disk_gb;
    return merged;
  }

  function handleSubmit() {
    const provisionSettings = buildSettings();

    if (isEditing) {
      updateProvider.mutate(
        {
          name: name || undefined,
          api_key: apiKey || undefined,
          base_url: baseUrl || undefined,
          settings: provisionSettings,
        },
        { onSuccess: onClose },
      );
    } else {
      createProvider.mutate(
        {
          name,
          provider_type: providerType,
          api_key: apiKey,
          base_url: baseUrl || undefined,
          settings: provisionSettings,
        },
        { onSuccess: onClose },
      );
    }
  }

  const isBusy = createProvider.isPending || updateProvider.isPending;

  return (
    <Stack gap={3}>
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My RunPod Account"
      />
      {!isEditing && (
        <Select
          label="Provider Type"
          options={PROVIDER_TYPES}
          value={providerType}
          onChange={setProviderType}
          placeholder="Select provider type"
        />
      )}
      <Input
        label="API Key"
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder={isEditing ? "(unchanged)" : "Enter API key"}
      />
      <Input
        label="Base URL (optional)"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder="https://api.runpod.io/v2"
      />

      {/* Provision defaults */}
      <div className="border-t border-[var(--color-border-default)] pt-3 mt-1">
        <p className="text-xs font-medium text-[var(--color-text-muted)] mb-2 uppercase tracking-wide">
          Provision Defaults
        </p>
        <Stack gap={2}>
          <Input
            label="Template ID"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder="e.g. cw3nka7d08"
          />
          <Input
            label="Network Volume ID"
            value={networkVolumeId}
            onChange={(e) => setNetworkVolumeId(e.target.value)}
            placeholder="e.g. 8hgv8pn6e6"
          />
          <Input
            label="Volume Mount Path"
            value={volumeMountPath}
            onChange={(e) => setVolumeMountPath(e.target.value)}
            placeholder="/workspace"
          />
          <Input
            label="Docker Image (optional, template overrides this)"
            value={dockerImage}
            onChange={(e) => setDockerImage(e.target.value)}
            placeholder="runpod/comfyui:latest"
          />
          <Input
            label="Container Disk (GB)"
            type="number"
            value={String(containerDiskGb)}
            onChange={(e) => setContainerDiskGb(Number(e.target.value) || 20)}
            placeholder="20"
          />
        </Stack>
      </div>

      <Stack direction="horizontal" gap={2} justify="end">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          loading={isBusy}
          disabled={!name || (!isEditing && !providerType) || (!isEditing && !apiKey)}
        >
          {isEditing ? "Save" : "Add Provider"}
        </Button>
      </Stack>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Delete confirm
   -------------------------------------------------------------------------- */

function DeleteProviderConfirm({
  provider,
  onClose,
}: {
  provider: CloudProvider;
  onClose: () => void;
}) {
  const deleteProvider = useDeleteProvider(provider.id);

  return (
    <ConfirmDeleteModal
      open
      onClose={onClose}
      title="Remove Provider"
      entityName={provider.name}
      warningText="All instances under this provider will also be removed. This cannot be undone."
      onConfirm={() => deleteProvider.mutate(undefined, { onSuccess: onClose })}
      loading={deleteProvider.isPending}
    />
  );
}
