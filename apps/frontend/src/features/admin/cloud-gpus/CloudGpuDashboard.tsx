/**
 * Cloud GPU Provider admin dashboard (PRD-114).
 *
 * Shows overview stats, provider list, and management controls.
 */

import { useState } from "react";

import { ConfirmModal } from "@/components/composite";
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
  useResumeProcessing,
} from "./hooks/use-cloud-providers";
import { CloudProviderList } from "./components/CloudProviderList";
import { CloudProviderDetail } from "./components/CloudProviderDetail";
import { DashboardStats } from "./components/DashboardStats";

export function CloudGpuDashboard() {
  useSetPageTitle("Cloud GPU Dashboard", "Manage cloud GPU providers, instances, and scaling rules.");

  const { data: stats, isLoading: statsLoading } = useCloudDashboard();
  const { data: providers, isLoading: providersLoading } = useCloudProviders();
  const emergencyStopAll = useEmergencyStopAll();
  const resumeProcessing = useResumeProcessing();

  const [selectedProviderId, setSelectedProviderId] = useState<number | null>(null);
  const [confirmStopAll, setConfirmStopAll] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);

  // Show resume button when any provider is disabled
  const hasDisabledProviders = providers?.some((p) => p.status_id === 2) ?? false;

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
        <div className="flex items-center justify-end gap-[var(--spacing-2)]">
          {hasDisabledProviders && (
            <Button
              onClick={() => setConfirmResume(true)}
              variant="primary"
              size="sm"
              loading={resumeProcessing.isPending}
            >
              Resume Processing
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={() => setConfirmStopAll(true)}
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

      <ConfirmModal
        open={confirmStopAll}
        onClose={() => setConfirmStopAll(false)}
        title="Emergency Stop All"
        confirmLabel="Stop All"
        confirmVariant="danger"
        onConfirm={() => {
          emergencyStopAll.mutate();
          setConfirmStopAll(false);
        }}
      >
        <p>This will:</p>
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li>Terminate ALL cloud instances</li>
          <li>Disable all providers and scaling rules</li>
          <li>Hold all pending jobs (preventing dispatch)</li>
        </ul>
        <p className="mt-2">Use "Resume Processing" to restart operations.</p>
      </ConfirmModal>

      <ConfirmModal
        open={confirmResume}
        onClose={() => setConfirmResume(false)}
        title="Resume Processing"
        confirmLabel="Resume"
        confirmVariant="primary"
        onConfirm={() => {
          resumeProcessing.mutate();
          setConfirmResume(false);
        }}
      >
        <p>This will:</p>
        <ul className="list-disc pl-5 mt-1 space-y-0.5">
          <li>Re-enable all disabled providers</li>
          <li>Re-enable all scaling rules</li>
          <li>Release held jobs back to the pending queue</li>
        </ul>
        <p className="mt-2">Auto-scaling will resume and jobs will be dispatched to available instances.</p>
      </ConfirmModal>
    </div>
  );
}
