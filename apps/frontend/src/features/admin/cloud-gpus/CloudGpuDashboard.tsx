/**
 * Cloud GPU Provider admin dashboard (PRD-114).
 *
 * Shows overview stats, provider list, and management controls.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";
import { Spinner } from "@/components/primitives";
import { EmptyState } from "@/components/domain";
import { Server } from "@/tokens/icons";

import {
  useCloudDashboard,
  useCloudProviders,
  useEmergencyStopAll,
} from "./hooks/use-cloud-providers";
import { CloudProviderList } from "./components/CloudProviderList";
import { CloudProviderDetail } from "./components/CloudProviderDetail";
import { DashboardStats } from "./components/DashboardStats";

const PAGE_TITLE = "Cloud GPU Providers";
const PAGE_DESCRIPTION = "Manage cloud GPU providers, instances, and scaling rules.";

function PageHeader({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">{PAGE_TITLE}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{PAGE_DESCRIPTION}</p>
      </div>
      {children}
    </div>
  );
}

export function CloudGpuDashboard() {
  const { data: stats, isLoading: statsLoading } = useCloudDashboard();
  const { data: providers, isLoading: providersLoading } = useCloudProviders();
  const emergencyStopAll = useEmergencyStopAll();

  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);

  const isLoading = statsLoading || providersLoading;

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="min-h-full">
        <Stack gap={6}>
          <PageHeader />
          <EmptyState
            icon={<Server />}
            title="No providers configured"
            description="Add a cloud GPU provider to start provisioning GPU instances."
          />
        </Stack>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader>
          <Button
            onClick={() => {
              if (window.confirm("This will terminate ALL cloud instances across ALL providers. Continue?")) {
                emergencyStopAll.mutate();
              }
            }}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            Emergency Stop All
          </Button>
        </PageHeader>

        {/* Dashboard Stats */}
        {stats && <DashboardStats stats={stats} />}

        {/* Provider List + Detail */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <CloudProviderList
              providers={providers}
              selectedId={selectedProviderId}
              onSelect={setSelectedProviderId}
            />
          </div>
          <div className="lg:col-span-2">
            {selectedProviderId ? (
              <CloudProviderDetail providerId={selectedProviderId} />
            ) : (
              <div className="flex h-64 items-center justify-center rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
                <p className="text-sm text-[var(--color-text-muted)]">
                  Select a provider to view details
                </p>
              </div>
            )}
          </div>
        </div>
      </Stack>
    </div>
  );
}
