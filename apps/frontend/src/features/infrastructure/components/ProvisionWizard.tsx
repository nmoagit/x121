/**
 * Multi-step modal wizard for provisioning new cloud instances.
 *
 * Steps:
 * 1. Select provider
 * 2. Select GPU type (with VRAM, cost/hr info)
 * 3. Specify count (1-10)
 * 4. Review and confirm
 */

import { useState, useMemo } from "react";

import { Button, Input, Select, Badge ,  WireframeLoader } from "@/components/primitives";
import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Cpu, DollarSign, HardDrive, RefreshCw } from "@/tokens/icons";
import { formatCents, formatBytes } from "@/lib/format";

import {
  useCloudProviders,
  useGpuTypes,
  useSyncGpuTypes,
  useProvisionInstance,
  type CloudGpuType,
} from "@/features/admin/cloud-gpus/hooks/use-cloud-providers";

/* --------------------------------------------------------------------------
   Wizard steps
   -------------------------------------------------------------------------- */

type WizardStep = "provider" | "gpu" | "count" | "review";

const STEP_ORDER: WizardStep[] = ["provider", "gpu", "count", "review"];
const STEP_LABELS: Record<WizardStep, string> = {
  provider: "Select Provider",
  gpu: "Select GPU Type",
  count: "Instance Count",
  review: "Review & Confirm",
};

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface ProvisionWizardProps {
  open: boolean;
  onClose: () => void;
}

export function ProvisionWizard({ open, onClose }: ProvisionWizardProps) {
  const [step, setStep] = useState<WizardStep>("provider");
  const [providerId, setProviderId] = useState<number | null>(null);
  const [selectedGpu, setSelectedGpu] = useState<CloudGpuType | null>(null);
  const [count, setCount] = useState(1);

  const { data: providers } = useCloudProviders();
  const { data: gpuTypes, isLoading: gpuLoading } = useGpuTypes(providerId);
  const provisionInstance = useProvisionInstance(providerId ?? 0);

  const stepIndex = STEP_ORDER.indexOf(step);

  function goNext() {
    const next = STEP_ORDER[stepIndex + 1];
    if (next) setStep(next);
  }

  function goBack() {
    const prev = STEP_ORDER[stepIndex - 1];
    if (prev) setStep(prev);
  }

  function handleProvision() {
    if (!providerId || !selectedGpu) return;

    const promises = Array.from({ length: count }, () =>
      provisionInstance.mutateAsync({ gpu_type_id: selectedGpu.id }),
    );

    Promise.all(promises).then(() => {
      handleReset();
      onClose();
    });
  }

  function handleReset() {
    setStep("provider");
    setProviderId(null);
    setSelectedGpu(null);
    setCount(1);
  }

  function handleClose() {
    handleReset();
    onClose();
  }

  const selectedProvider = providers?.find((p) => p.id === providerId);

  const providerOptions = useMemo(
    () =>
      (providers ?? []).map((p) => ({
        value: String(p.id),
        label: p.name,
      })),
    [providers],
  );

  const canNext =
    (step === "provider" && providerId !== null) ||
    (step === "gpu" && selectedGpu !== null) ||
    (step === "count" && count >= 1 && count <= 10);

  return (
    <Modal open={open} onClose={handleClose} title="Provision Instance" size="xl">
      <Stack gap={4}>
        {/* Step indicator */}
        <StepIndicator current={step} />

        {/* Step content */}
        {step === "provider" && (
          <Select
            label="Cloud Provider"
            options={providerOptions}
            value={providerId != null ? String(providerId) : ""}
            onChange={(v) => {
              setProviderId(Number(v));
              setSelectedGpu(null);
            }}
            placeholder="Choose a provider"
          />
        )}

        {step === "gpu" && providerId != null && (
          <GpuSelector
            providerId={providerId}
            gpuTypes={gpuTypes ?? []}
            loading={gpuLoading}
            selected={selectedGpu}
            onSelect={setSelectedGpu}
          />
        )}

        {step === "count" && (
          <Input
            label="Number of Instances"
            type="number"
            min={1}
            max={10}
            value={String(count)}
            onChange={(e) => setCount(Math.max(1, Math.min(10, Number(e.target.value))))}
            helperText="Between 1 and 10 instances"
          />
        )}

        {step === "review" && selectedGpu && selectedProvider && (
          <ReviewStep
            provider={selectedProvider.name}
            gpu={selectedGpu}
            count={count}
          />
        )}

        {/* Navigation */}
        <Stack direction="horizontal" gap={2} justify="between">
          <Button
            variant="secondary"
            onClick={stepIndex === 0 ? handleClose : goBack}
          >
            {stepIndex === 0 ? "Cancel" : "Back"}
          </Button>

          {step === "review" ? (
            <Button
              variant="primary"
              onClick={handleProvision}
              loading={provisionInstance.isPending}
            >
              Provision {count} Instance{count !== 1 ? "s" : ""}
            </Button>
          ) : (
            <Button variant="primary" onClick={goNext} disabled={!canNext}>
              Next
            </Button>
          )}
        </Stack>
      </Stack>
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Step indicator
   -------------------------------------------------------------------------- */

function StepIndicator({ current }: { current: WizardStep }) {
  const currentIndex = STEP_ORDER.indexOf(current);

  return (
    <div className="flex items-center gap-2">
      {STEP_ORDER.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          {i > 0 && (
            <div
              className={`h-px w-6 ${i <= currentIndex ? "bg-[var(--color-action-primary)]" : "bg-[var(--color-border-default)]"}`}
            />
          )}
          <div className="flex items-center gap-1">
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium ${
                i < currentIndex
                  ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                  : i === currentIndex
                    ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                    : "bg-[var(--color-surface-tertiary)] text-[var(--color-text-muted)]"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-xs hidden sm:inline ${
                i === currentIndex
                  ? "text-[var(--color-text-primary)] font-medium"
                  : "text-[var(--color-text-muted)]"
              }`}
            >
              {STEP_LABELS[s]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------------------
   GPU selector
   -------------------------------------------------------------------------- */

function GpuSelector({
  providerId,
  gpuTypes,
  loading,
  selected,
  onSelect,
}: {
  providerId: number;
  gpuTypes: CloudGpuType[];
  loading: boolean;
  selected: CloudGpuType | null;
  onSelect: (gpu: CloudGpuType) => void;
}) {
  const syncGpuTypes = useSyncGpuTypes(providerId);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <WireframeLoader size={48} />
      </div>
    );
  }

  if (gpuTypes.length === 0) {
    return (
      <Stack gap={3} align="center" className="py-4">
        <p className="text-sm text-[var(--color-text-muted)] text-center">
          No GPU types available for this provider.
        </p>
        <Button
          variant="secondary"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={() => syncGpuTypes.mutate()}
          loading={syncGpuTypes.isPending}
        >
          Sync from Provider
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap={2}>
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Select a GPU type:
        </p>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={() => syncGpuTypes.mutate()}
          loading={syncGpuTypes.isPending}
        >
          Resync
        </Button>
      </div>
      {gpuTypes.map((gpu) => (
        <button
          key={gpu.id}
          type="button"
          onClick={() => onSelect(gpu)}
          className={`w-full text-left rounded-[var(--radius-md)] border px-3 py-2 transition-colors ${
            selected?.id === gpu.id
              ? "border-[var(--color-action-primary)] bg-[var(--color-action-primary)]/5"
              : "border-[var(--color-border-default)] hover:bg-[var(--color-surface-tertiary)]"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium text-[var(--color-text-primary)]">
                {gpu.name}
              </span>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1">
                  <Cpu size={12} />
                  {gpu.gpu_id}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive size={12} />
                  {formatBytes(gpu.vram_mb * 1_048_576)}
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign size={12} />
                  {formatCents(gpu.cost_per_hour_cents)}/hr
                </span>
              </div>
            </div>
            <Badge variant={gpu.available ? "success" : "default"} size="sm">
              {gpu.available ? "Available" : "Unavailable"}
            </Badge>
          </div>
        </button>
      ))}
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Review step
   -------------------------------------------------------------------------- */

function ReviewStep({
  provider,
  gpu,
  count,
}: {
  provider: string;
  gpu: CloudGpuType;
  count: number;
}) {
  const totalCostPerHour = gpu.cost_per_hour_cents * count;

  return (
    <Stack gap={3}>
      <p className="text-sm text-[var(--color-text-secondary)]">
        Review your provisioning request:
      </p>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border-default)] p-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <ReviewRow label="Provider" value={provider} />
          <ReviewRow label="GPU Type" value={gpu.name} />
          <ReviewRow label="VRAM" value={formatBytes(gpu.vram_mb * 1_048_576)} />
          <ReviewRow label="Count" value={String(count)} />
          <ReviewRow label="Cost/hr (each)" value={formatCents(gpu.cost_per_hour_cents)} />
          <ReviewRow label="Total Cost/hr" value={formatCents(totalCostPerHour)} />
        </div>
      </div>
    </Stack>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="text-[var(--color-text-primary)] font-medium">{value}</span>
    </>
  );
}
