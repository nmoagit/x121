/**
 * Infrastructure Control Panel — unified view of all cloud instances
 * across providers with bulk actions, orphan detection, and provisioning.
 */

import { useMemo, useState } from "react";

import { Button, Spinner } from "@/components/primitives";
import { CollapsibleSection } from "@/components/composite";
import { PageHeader, Stack } from "@/components/layout";
import { EmptyState } from "@/components/domain";
import { Plus, Server, Settings } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useAllInstances } from "./hooks/use-all-instances";
import { useInstanceSelection } from "./hooks/use-instance-selection";
import type { EnrichedInstance } from "./types";

import { InstanceCard } from "./components/InstanceCard";
import { BulkActionToolbar } from "./components/BulkActionToolbar";
import { OrphanPanel } from "./components/OrphanPanel";
import { ProviderManagement } from "./components/ProviderManagement";
import { ProvisionWizard } from "./components/ProvisionWizard";

export function InfrastructureControlPanel() {
  const { instances, isLoading, error } = useAllInstances();
  const selection = useInstanceSelection();

  const [showProviderMgmt, setShowProviderMgmt] = useState(false);
  const [showProvisionWizard, setShowProvisionWizard] = useState(false);

  const groupedByProvider = useMemo(() => groupByProvider(instances), [instances]);

  if (isLoading) {
    return (
      <Stack gap={4}>
        <PageHeader
          title="Infrastructure Control Panel"
          description="Manage cloud GPU instances across all providers"
        />
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
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
          <Stack direction="horizontal" gap={2}>
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

      {/* Empty state */}
      {instances.length === 0 && (
        <EmptyState
          icon={<Server size={iconSizes.xl} />}
          title="No instances"
          description="No cloud GPU instances found. Provision a new instance or add a cloud provider to get started."
          action={
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={iconSizes.sm} />}
              onClick={() => setShowProvisionWizard(true)}
            >
              Provision Instance
            </Button>
          }
        />
      )}

      {/* Provider sections */}
      {groupedByProvider.map(({ providerName, providerId, instances: providerInstances }) => (
        <ProviderSection
          key={providerId}
          providerName={providerName}
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
  instances: EnrichedInstance[];
  selection: ReturnType<typeof useInstanceSelection>;
}

function ProviderSection({
  providerName,
  instances,
  selection,
}: ProviderSectionProps) {
  return (
    <CollapsibleSection
      title={`${providerName} (${instances.length})`}
      defaultOpen
    >
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
    </CollapsibleSection>
  );
}

/* --------------------------------------------------------------------------
   Grouping helper
   -------------------------------------------------------------------------- */

interface ProviderGroup {
  providerId: number;
  providerName: string;
  instances: EnrichedInstance[];
}

function groupByProvider(instances: EnrichedInstance[]): ProviderGroup[] {
  const map = new Map<number, ProviderGroup>();

  for (const inst of instances) {
    let group = map.get(inst.provider_id);
    if (!group) {
      group = {
        providerId: inst.provider_id,
        providerName: inst.provider_name,
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
