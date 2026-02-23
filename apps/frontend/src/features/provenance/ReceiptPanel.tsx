/**
 * Receipt panel component for displaying generation provenance (PRD-69).
 *
 * Shows all fields of a generation receipt grouped into expandable
 * accordion sections: Image Hashes, Model Info, LoRA Configs,
 * Generation Parameters, and Timing.
 */

import { useCallback, useState } from "react";

import { Accordion } from "@/components";
import { Badge, Spinner } from "@/components";

import { useSegmentProvenance } from "./hooks/use-provenance";
import type { GenerationReceipt, LoraConfig } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ReceiptPanelProps {
  segmentId: number;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Copy text to clipboard with visual feedback. */
function CopyableHash({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <button
        type="button"
        onClick={handleCopy}
        title="Copy to clipboard"
        data-testid={`copy-${label.toLowerCase().replace(/\s+/g, "-")}`}
        className="font-mono text-xs text-[var(--color-text-secondary)] truncate max-w-48 hover:text-[var(--color-text-primary)] transition-colors"
      >
        {copied ? "Copied!" : value}
      </button>
    </div>
  );
}

function FieldRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-[var(--color-text-muted)]">{label}</span>
      <span className="text-xs text-[var(--color-text-secondary)]">
        {value ?? "N/A"}
      </span>
    </div>
  );
}

function LoraConfigRow({ config, index }: { config: LoraConfig; index: number }) {
  return (
    <div
      className="flex flex-col gap-1 py-1"
      data-testid={`lora-config-${index}`}
    >
      <FieldRow label="Weight" value={config.weight.toFixed(2)} />
      <FieldRow label="Version" value={config.version} />
      <CopyableHash label="Hash" value={config.hash} />
      {config.asset_id != null && (
        <FieldRow label="Asset ID" value={config.asset_id} />
      )}
    </div>
  );
}

/* --------------------------------------------------------------------------
   Section builders
   -------------------------------------------------------------------------- */

function buildSections(receipt: GenerationReceipt) {
  return [
    {
      id: "image-hashes",
      title: "Image Hashes",
      content: (
        <div className="flex flex-col gap-2">
          <CopyableHash label="Source Image" value={receipt.source_image_hash} />
          <CopyableHash label="Variant Image" value={receipt.variant_image_hash} />
          <CopyableHash label="Inputs Hash" value={receipt.inputs_hash} />
        </div>
      ),
    },
    {
      id: "model-info",
      title: "Model Info",
      content: (
        <div className="flex flex-col gap-2">
          <FieldRow label="Model Version" value={receipt.model_version} />
          <CopyableHash label="Model Hash" value={receipt.model_hash} />
          <FieldRow label="Workflow Version" value={receipt.workflow_version} />
          <CopyableHash label="Workflow Hash" value={receipt.workflow_hash} />
          {receipt.model_asset_id != null && (
            <FieldRow label="Model Asset ID" value={receipt.model_asset_id} />
          )}
        </div>
      ),
    },
    {
      id: "lora-configs",
      title: `LoRA Configs (${receipt.lora_configs.length})`,
      content:
        receipt.lora_configs.length === 0 ? (
          <p className="text-xs text-[var(--color-text-muted)]">No LoRA adapters</p>
        ) : (
          <div className="flex flex-col gap-2 divide-y divide-[var(--color-border-default)]">
            {receipt.lora_configs.map((config, i) => (
              <LoraConfigRow key={config.hash} config={config} index={i} />
            ))}
          </div>
        ),
    },
    {
      id: "gen-params",
      title: "Generation Parameters",
      content: (
        <div className="flex flex-col gap-2">
          <FieldRow label="Sampler" value={receipt.sampler} />
          <FieldRow label="CFG Scale" value={receipt.cfg_scale} />
          <FieldRow label="Seed" value={receipt.seed} />
          <FieldRow label="Steps" value={receipt.steps} />
          <FieldRow
            label="Resolution"
            value={`${receipt.resolution_width} x ${receipt.resolution_height}`}
          />
          <div className="pt-1">
            <p className="text-xs text-[var(--color-text-muted)] mb-1">Prompt</p>
            <p
              className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap"
              data-testid="prompt-text"
            >
              {receipt.prompt_text}
            </p>
          </div>
          {receipt.negative_prompt && (
            <div className="pt-1">
              <p className="text-xs text-[var(--color-text-muted)] mb-1">Negative Prompt</p>
              <p
                className="text-xs text-[var(--color-text-secondary)] whitespace-pre-wrap"
                data-testid="negative-prompt"
              >
                {receipt.negative_prompt}
              </p>
            </div>
          )}
        </div>
      ),
    },
    {
      id: "timing",
      title: "Timing",
      content: (
        <div className="flex flex-col gap-2">
          <FieldRow label="Started At" value={receipt.generation_started_at} />
          <FieldRow label="Completed At" value={receipt.generation_completed_at} />
          <FieldRow
            label="Duration"
            value={
              receipt.generation_duration_ms != null
                ? `${(receipt.generation_duration_ms / 1000).toFixed(1)}s`
                : null
            }
          />
          <FieldRow label="Created At" value={receipt.created_at} />
        </div>
      ),
    },
  ];
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReceiptPanel({ segmentId }: ReceiptPanelProps) {
  const { data: receipt, isLoading, isError } = useSegmentProvenance(segmentId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-6" data-testid="receipt-loading">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-4 text-sm text-[var(--color-action-danger)]" data-testid="receipt-error">
        Failed to load provenance data.
      </div>
    );
  }

  if (!receipt) {
    return (
      <div
        className="p-4 text-sm text-[var(--color-text-muted)] text-center"
        data-testid="receipt-empty"
      >
        No generation receipt for this segment.
      </div>
    );
  }

  const sections = buildSections(receipt);

  return (
    <div data-testid="receipt-panel">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
          Generation Receipt
        </h3>
        <Badge variant="info" size="sm">
          #{receipt.id}
        </Badge>
      </div>
      <Accordion items={sections} allowMultiple />
    </div>
  );
}
