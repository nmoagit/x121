/**
 * Pipeline settings page — view/edit pipeline configuration (PRD-138).
 *
 * Route: /admin/pipelines/$pipelineId
 */

import { useCallback, useEffect, useState } from "react";

import { useToast } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Button, Input, LoadingPane, Toggle } from "@/components/primitives";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { TERMINAL_BODY, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_PANEL } from "@/lib/ui-classes";
import { Save, Settings } from "@/tokens/icons";

import { ImportRulesEditor } from "./components/ImportRulesEditor";
import { JsonConfigPanel } from "./components/JsonConfigPanel";
import { SeedSlotEditor } from "./components/SeedSlotEditor";
import { usePipeline, useUpdatePipeline } from "./hooks/use-pipelines";
import type { SeedSlot } from "./types";
import { TYPO_DATA_MUTED } from "@/lib/typography-tokens";

interface PipelineSettingsPageProps {
  pipelineId: number;
}

export function PipelineSettingsPage({ pipelineId }: PipelineSettingsPageProps) {
  const { data: pipeline, isLoading, error } = usePipeline(pipelineId);
  const updatePipeline = useUpdatePipeline();
  const { addToast } = useToast();

  useSetPageTitle(
    pipeline ? `Pipeline: ${pipeline.name}` : "Pipeline Settings",
    "View and edit pipeline configuration.",
  );

  /* --- local form state --- */
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [seedSlots, setSeedSlots] = useState<SeedSlot[]>([]);
  const [namingRules, setNamingRules] = useState("");
  const [deliveryConfig, setDeliveryConfig] = useState("");
  const [isActive, setIsActive] = useState(true);

  /* --- sync from server data --- */
  useEffect(() => {
    if (!pipeline) return;
    setName(pipeline.name);
    setDescription(pipeline.description ?? "");
    setSeedSlots(pipeline.seed_slots);
    setNamingRules(JSON.stringify(pipeline.naming_rules, null, 2));
    setDeliveryConfig(JSON.stringify(pipeline.delivery_config, null, 2));
    setIsActive(pipeline.is_active);
  }, [pipeline]);

  /* --- save handler --- */
  const handleSave = useCallback(() => {
    let parsedNaming: Record<string, unknown> = {};
    let parsedDelivery: Record<string, unknown> = {};

    try {
      parsedNaming = namingRules.trim() ? JSON.parse(namingRules) : {};
    } catch {
      addToast({ variant: "error", message: "Invalid JSON in naming rules" });
      return;
    }

    try {
      parsedDelivery = deliveryConfig.trim() ? JSON.parse(deliveryConfig) : {};
    } catch {
      addToast({ variant: "error", message: "Invalid JSON in delivery config" });
      return;
    }

    updatePipeline.mutate(
      {
        id: pipelineId,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          seed_slots: seedSlots,
          naming_rules: parsedNaming,
          delivery_config: parsedDelivery,
          is_active: isActive,
        },
      },
      {
        onSuccess: () => addToast({ variant: "success", message: "Pipeline updated" }),
        onError: (err) => addToast({ variant: "error", message: `Failed to save: ${err.message}` }),
      },
    );
  }, [pipelineId, name, description, seedSlots, namingRules, deliveryConfig, isActive, updatePipeline, addToast]);

  if (isLoading) return <LoadingPane />;

  if (error || !pipeline) {
    return (
      <EmptyState
        icon={<Settings size={32} />}
        title="Pipeline not found"
        description="The requested pipeline could not be loaded."
      />
    );
  }

  return (
    <Stack gap={6}>
      {/* General info */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_HEADER}>
          <h2 className={TERMINAL_HEADER_TITLE}>General</h2>
        </div>
        <div className={TERMINAL_BODY}>
          <Stack gap={4}>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  label="Pipeline Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Standard Pipeline"
                />
              </div>
              <div className="pt-5">
                <span className={TYPO_DATA_MUTED}>
                  Code: <span className="text-[var(--color-data-cyan)]">{pipeline.code}</span>
                </span>
              </div>
            </div>
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional pipeline description..."
            />
            <Toggle checked={isActive} onChange={setIsActive} label="Active" size="sm" />
          </Stack>
        </div>
      </div>

      {/* Seed slots */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_HEADER}>
          <h2 className={TERMINAL_HEADER_TITLE}>Seed Slots</h2>
        </div>
        <div className={TERMINAL_BODY}>
          <SeedSlotEditor slots={seedSlots} onChange={setSeedSlots} />
        </div>
      </div>

      {/* Naming rules */}
      <JsonConfigPanel
        title="Naming Rules"
        value={namingRules}
        onChange={setNamingRules}
        placeholder='{ "pattern": "{avatar}_{scene}_{variant}" }'
      />

      {/* Import Rules */}
      <div className={TERMINAL_PANEL}>
        <div className={TERMINAL_HEADER}>
          <h2 className={TERMINAL_HEADER_TITLE}>Import Rules</h2>
        </div>
        <div className={TERMINAL_BODY}>
          <ImportRulesEditor pipeline={pipeline} />
        </div>
      </div>

      {/* Delivery config */}
      <JsonConfigPanel
        title="Delivery Config"
        value={deliveryConfig}
        onChange={setDeliveryConfig}
        placeholder='{ "format": "mp4", "resolution": "1080p" }'
      />

      {/* Save */}
      <div className="flex justify-end">
        <Button
          icon={<Save size={14} />}
          onClick={handleSave}
          loading={updatePipeline.isPending}
          disabled={!name.trim()}
        >
          Save Pipeline
        </Button>
      </div>
    </Stack>
  );
}
