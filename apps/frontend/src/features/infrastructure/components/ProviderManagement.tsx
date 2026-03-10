/**
 * Provider management: add, edit, test, and remove cloud providers.
 *
 * Renders as a modal dialog triggered from the control panel header.
 */

import { useState } from "react";

import { Button, Input, Select } from "@/components/primitives";
import { Modal, ConfirmDeleteModal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Plus, Trash2, Edit3, Shield } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useCloudProviders,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  useTestConnection,
  type CloudProvider,
} from "@/features/admin/cloud-gpus/hooks/use-cloud-providers";

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
  const testConnection = useTestConnection(provider.id);

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
      <Stack direction="horizontal" gap={1}>
        <Button
          variant="ghost"
          size="sm"
          icon={<Shield size={iconSizes.sm} />}
          onClick={() => testConnection.mutate()}
          loading={testConnection.isPending}
        >
          Test
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Edit3 size={iconSizes.sm} />}
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={iconSizes.sm} />}
          onClick={onDelete}
        >
          Remove
        </Button>
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

  const [name, setName] = useState(provider?.name ?? "");
  const [providerType, setProviderType] = useState(provider?.provider_type ?? "");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(provider?.base_url ?? "");

  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider(provider?.id ?? 0);

  function handleSubmit() {
    if (isEditing) {
      updateProvider.mutate(
        {
          name: name || undefined,
          api_key: apiKey || undefined,
          base_url: baseUrl || undefined,
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
