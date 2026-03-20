/**
 * Infrastructure Control Panel — unified view of all cloud instances
 * across providers with bulk actions, orphan detection, and provisioning.
 */

import { useCallback, useMemo, useState } from "react";

import { Button, Input, Select, Toggle ,  WireframeLoader } from "@/components/primitives";
import { CollapsibleSection } from "@/components/composite";
import { PageHeader, Stack } from "@/components/layout";
import { EmptyState } from "@/components/domain";
import { ChevronDown, Plus, Server, Settings, Zap } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useQueryClient } from "@tanstack/react-query";

import { useAllInstances, infraKeys } from "./hooks/use-all-instances";
import { useInstanceSelection } from "./hooks/use-instance-selection";
import {
  useGpuTypes,
  useProvisionInstance,
  useUpdateProvider,
  type CloudProvider,
} from "@/features/admin/cloud-gpus/hooks/use-cloud-providers";
import { useToast } from "@/components/composite";
import type { EnrichedInstance } from "./types";

import { InstanceCard } from "./components/InstanceCard";
import { BulkActionToolbar } from "./components/BulkActionToolbar";
import { OrphanPanel } from "./components/OrphanPanel";
import { ProviderManagement } from "./components/ProviderManagement";
import { ProvisionWizard } from "./components/ProvisionWizard";

export function InfrastructureControlPanel() {
  const [showArchived, setShowArchived] = useState(false);
  const { instances, providers, isLoading, error } = useAllInstances(showArchived);
  const selection = useInstanceSelection();

  const [showProviderMgmt, setShowProviderMgmt] = useState(false);
  const [showProvisionWizard, setShowProvisionWizard] = useState(false);

  const groupedByProvider = useMemo(
    () => groupByProvider(instances, providers),
    [instances, providers],
  );

  if (isLoading) {
    return (
      <Stack gap={4}>
        <PageHeader
          title="Infrastructure Control Panel"
          description="Manage cloud GPU instances across all providers"
        />
        <div className="flex items-center justify-center py-16">
          <WireframeLoader size={64} />
        </div>
      </Stack>
    );
  }

  if (error) {
    return (
      <Stack gap={4}>
        <PageHeader title="Infrastructure Control Panel" />
        <EmptyState
          icon={<Server size={iconSizes.xl} />}
          title="Failed to load infrastructure"
          description={error.message}
        />
      </Stack>
    );
  }

  return (
    <Stack gap={4}>
      <PageHeader
        title="Infrastructure Control Panel"
        description="Manage cloud GPU instances across all providers"
        actions={
          <Stack direction="horizontal" gap={3} align="center">
            <Toggle
              checked={showArchived}
              onChange={setShowArchived}
              label="Show archived"
              size="sm"
            />
            <Button
              variant="secondary"
              size="sm"
              icon={<Settings size={iconSizes.sm} />}
              onClick={() => setShowProviderMgmt(true)}
            >
              Providers
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={iconSizes.sm} />}
              onClick={() => setShowProvisionWizard(true)}
            >
              Provision Instance
            </Button>
          </Stack>
        }
      />

      {/* Bulk action toolbar (sticky when items selected) */}
      <BulkActionToolbar
        selectedIds={selection.selectedIds}
        onDeselectAll={selection.deselectAll}
      />

      {/* Empty state — only when no providers are configured */}
      {providers.length === 0 && (
        <EmptyState
          icon={<Server size={iconSizes.xl} />}
          title="No providers configured"
          description="Add a cloud provider to start provisioning GPU instances."
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={iconSizes.sm} />}
              onClick={() => setShowProviderMgmt(true)}
            >
              Add Provider
            </Button>
          }
        />
      )}

      {/* Provider sections */}
      {groupedByProvider.map(({ providerName, providerId, provider, instances: providerInstances }) => (
        <ProviderSection
          key={providerId}
          providerName={providerName}
          providerId={providerId}
          provider={provider}
          instances={providerInstances}
          selection={selection}
        />
      ))}

      {/* Orphan detection */}
      <OrphanPanel />

      {/* Modals */}
      <ProviderManagement
        open={showProviderMgmt}
        onClose={() => setShowProviderMgmt(false)}
      />
      <ProvisionWizard
        open={showProvisionWizard}
        onClose={() => setShowProvisionWizard(false)}
      />
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Provider section
   -------------------------------------------------------------------------- */

interface ProviderSectionProps {
  providerName: string;
  providerId: number;
  provider: CloudProvider | null;
  instances: EnrichedInstance[];
  selection: ReturnType<typeof useInstanceSelection>;
}

function ProviderSection({
  providerName,
  providerId,
  provider,
  instances,
  selection,
}: ProviderSectionProps) {
  const toast = useToast();
  const qc = useQueryClient();
  const { data: gpuTypes } = useGpuTypes(providerId);
  const provisionInstance = useProvisionInstance(providerId);
  const updateProvider = useUpdateProvider(providerId);
  const [showConfig, setShowConfig] = useState(false);
  const settings = provider?.settings ?? {};
  const preferredGpuId = settings.gpu_type_id as string | undefined;
  const quickCount = (settings.quick_provision_count as number) ?? 1;

  const defaultGpu =
    gpuTypes?.find((g) => g.gpu_id === preferredGpuId || g.name === preferredGpuId) ??
    gpuTypes?.[0] ??
    null;

  function handleQuickProvision() {
    if (!defaultGpu) {
      toast.addToast({ variant: "warning", message: "No GPU types available. Sync GPUs first." });
      return;
    }

    const count = Math.max(1, Math.min(10, quickCount));
    const promises = Array.from({ length: count }, () =>
      provisionInstance.mutateAsync({
        gpu_type_id: defaultGpu.id,
        template_id: (settings.template_id as string) ?? undefined,
        network_volume_id: (settings.network_volume_id as string) ?? undefined,
      }),
    );

    Promise.all(promises)
      .then(() => {
        toast.addToast({
          variant: "success",
          message: `Provisioning ${count} x ${defaultGpu.name}...`,
        });
        qc.invalidateQueries({ queryKey: infraKeys.allInstances() });
      })
      .catch((err) => {
        toast.addToast({ variant: "error", message: `Provision failed: ${err.message}` });
      });
  }

  const saveSettings = useCallback(
    (patch: Record<string, unknown>) => {
      if (!provider) return;
      updateProvider.mutate({ settings: { ...provider.settings, ...patch } });
    },
    [provider, updateProvider],
  );

  const gpuOptions = useMemo(
    () => (gpuTypes ?? []).map((g) => ({ value: g.gpu_id, label: g.name })),
    [gpuTypes],
  );

  const buttonLabel = defaultGpu
    ? `Quick Provision${quickCount > 1 ? ` (${quickCount})` : ""}`
    : "Quick Provision";

  return (
    <CollapsibleSection
      title={`${providerName} (${instances.length} instance${instances.length !== 1 ? "s" : ""})`}
      defaultOpen
      card
      actions={
        <div className="relative flex items-stretch">
          {/* Main provision button */}
          <Button
            variant="secondary"
            size="sm"
            icon={<Zap size={iconSizes.sm} />}
            onClick={handleQuickProvision}
            loading={provisionInstance.isPending}
            disabled={!defaultGpu}
            title={defaultGpu ? `Provision ${defaultGpu.name}` : "Sync GPUs first"}
            className="rounded-r-none"
          >
            {buttonLabel}
          </Button>
          {/* Config dropdown toggle */}
          <button
            type="button"
            onClick={() => setShowConfig((p) => !p)}
            className="flex items-center justify-center px-1.5 rounded-r-[var(--radius-md)] bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-border-default)] border border-l-0 border-[var(--color-border-default)]"
            aria-label="Configure quick provision"
          >
            <ChevronDown size={14} />
          </button>

          {/* Config dropdown */}
          {showConfig && (
            <QuickProvisionConfig
              gpuOptions={gpuOptions}
              selectedGpuId={preferredGpuId ?? ""}
              count={quickCount}
              templateId={(settings.template_id as string) ?? ""}
              networkVolumeId={(settings.network_volume_id as string) ?? ""}
              onChangeGpu={(gpuId) => saveSettings({ gpu_type_id: gpuId })}
              onChangeCount={(c) => saveSettings({ quick_provision_count: c })}
              onChangeTemplateId={(id) => saveSettings({ template_id: id })}
              onChangeNetworkVolumeId={(id) => saveSettings({ network_volume_id: id })}
              onClose={() => setShowConfig(false)}
            />
          )}
        </div>
      }
    >
      {instances.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)] py-4 text-center">
          No instances running.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {instances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              selected={selection.isSelected(instance.id)}
              onToggleSelect={selection.toggle}
            />
          ))}
        </div>
      )}
    </CollapsibleSection>
  );
}

/* --------------------------------------------------------------------------
   Quick Provision Config dropdown
   -------------------------------------------------------------------------- */

interface QuickProvisionConfigProps {
  gpuOptions: { value: string; label: string }[];
  selectedGpuId: string;
  count: number;
  templateId: string;
  networkVolumeId: string;
  onChangeGpu: (gpuId: string) => void;
  onChangeCount: (count: number) => void;
  onChangeTemplateId: (id: string) => void;
  onChangeNetworkVolumeId: (id: string) => void;
  onClose: () => void;
}

function QuickProvisionConfig({
  gpuOptions,
  selectedGpuId,
  count,
  templateId,
  networkVolumeId,
  onChangeGpu,
  onChangeCount,
  onChangeTemplateId,
  onChangeNetworkVolumeId,
  onClose,
}: QuickProvisionConfigProps) {
  return (
    <>
      {/* Backdrop to close on outside click */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-50 w-72 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] shadow-lg p-3">
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            Quick Provision Settings
          </h4>

          {gpuOptions.length > 0 && (
            <Select
              label="GPU Type"
              options={gpuOptions}
              value={selectedGpuId}
              onChange={onChangeGpu}
              placeholder="Select GPU"
            />
          )}

          <Input
            label="Instance Count"
            type="number"
            min={1}
            max={10}
            value={String(count)}
            onChange={(e) => onChangeCount(Math.max(1, Math.min(10, Number(e.target.value))))}
          />

          <Input
            label="Template ID"
            value={templateId}
            onChange={(e) => onChangeTemplateId(e.target.value)}
            placeholder="e.g. cw3nka7d08"
          />

          <Input
            label="Network Volume ID"
            value={networkVolumeId}
            onChange={(e) => onChangeNetworkVolumeId(e.target.value)}
            placeholder="e.g. 8hgv8pn6e6"
          />

          <p className="text-xs text-[var(--color-text-muted)]">
            Settings are saved automatically.
          </p>
        </div>
      </div>
    </>
  );
}

/* --------------------------------------------------------------------------
   Grouping helper
   -------------------------------------------------------------------------- */

interface ProviderGroup {
  providerId: number;
  providerName: string;
  provider: CloudProvider | null;
  instances: EnrichedInstance[];
}

function groupByProvider(
  instances: EnrichedInstance[],
  providers: CloudProvider[],
): ProviderGroup[] {
  const map = new Map<number, ProviderGroup>();

  // Seed with all known providers so empty ones still appear.
  for (const p of providers) {
    map.set(p.id, {
      providerId: p.id,
      providerName: p.name,
      provider: p,
      instances: [],
    });
  }

  for (const inst of instances) {
    let group = map.get(inst.provider_id);
    if (!group) {
      group = {
        providerId: inst.provider_id,
        providerName: inst.provider_name,
        provider: null,
        instances: [],
      };
      map.set(inst.provider_id, group);
    }
    group.instances.push(inst);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.providerName.localeCompare(b.providerName),
  );
}
