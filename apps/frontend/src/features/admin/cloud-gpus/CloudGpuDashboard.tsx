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
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Server } from "@/tokens/icons";

import {
  useCloudDashboard,
  useCloudProviders,
  useEmergencyStopAll,
} from "./hooks/use-cloud-providers";
import { CloudProviderList } from "./components/CloudProviderList";
import { CloudProviderDetail } from "./components/CloudProviderDetail";
import { DashboardStats } from "./components/DashboardStats";

export function CloudGpuDashboard() {
  useSetPageTitle("Cloud GPU Dashboard", "Manage cloud GPU providers, instances, and scaling rules.");

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
        <div className="flex items-center justify-end">
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
        </div>

        {/* Dashboard Stats */}
        {stats && <DashboardStats stats={stats} />}

        {/* Provider selector (horizontal) */}
        <CloudProviderList
          providers={providers}
          selectedId={selectedProviderId}
          onSelect={setSelectedProviderId}
        />

        {/* Detail (full width) */}
        {selectedProviderId ? (
          <CloudProviderDetail providerId={selectedProviderId} />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]">
            <p className="text-sm text-[var(--color-text-muted)]">
              Select a provider to view details
            </p>
          </div>
        )}
      </Stack>
    </div>
  );
}
