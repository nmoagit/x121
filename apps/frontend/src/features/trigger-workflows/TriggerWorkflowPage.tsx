/**
 * Trigger workflow page (PRD-97).
 *
 * Top-level page with tabs for trigger list, chain graph visualization,
 * and execution log viewer. Includes global pause/resume controls.
 */

import { useCallback, useState } from "react";

import { Button } from "@/components/primitives";
import { Modal, Tabs } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Pause, Play, Plus } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { ChainGraph } from "./ChainGraph";
import {
  useCreateTrigger,
  usePauseAll,
  useResumeAll,
  useUpdateTrigger,
} from "./hooks/use-trigger-workflows";
import { TriggerForm } from "./TriggerForm";
import { TriggerList } from "./TriggerList";
import { TriggerLogTable } from "./TriggerLogTable";
import type { CreateTrigger, Trigger } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TABS = [
  { id: "triggers", label: "Triggers" },
  { id: "chain-graph", label: "Chain Graph" },
  { id: "log", label: "Execution Log" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function TriggerWorkflowPage() {
  const [activeTab, setActiveTab] = useState("triggers");
  const [formOpen, setFormOpen] = useState(false);
  const [editingTrigger, setEditingTrigger] = useState<Trigger | undefined>();

  const createMutation = useCreateTrigger();
  const updateMutation = useUpdateTrigger(editingTrigger?.id ?? 0);
  const pauseAllMutation = usePauseAll();
  const resumeAllMutation = useResumeAll();

  const handleOpenCreate = useCallback(() => {
    setEditingTrigger(undefined);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((trigger: Trigger) => {
    setEditingTrigger(trigger);
    setFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingTrigger(undefined);
  }, []);

  const handleSubmit = useCallback(
    (data: CreateTrigger) => {
      if (editingTrigger) {
        updateMutation.mutate(data, { onSuccess: handleCloseForm });
      } else {
        createMutation.mutate(data, { onSuccess: handleCloseForm });
      }
    },
    [editingTrigger, createMutation, updateMutation, handleCloseForm],
  );

  return (
    <div className="p-[var(--spacing-6)]" data-testid="trigger-workflow-page">
      <Stack direction="vertical" gap={5}>
        {/* Page header */}
        <Stack direction="horizontal" gap={3} align="center" justify="between">
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
            Trigger Workflows
          </h1>
          <Stack direction="horizontal" gap={2} align="center">
            {activeTab === "triggers" && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Pause size={iconSizes.sm} />}
                  onClick={() => pauseAllMutation.mutate()}
                  disabled={pauseAllMutation.isPending}
                  data-testid="pause-all-btn"
                >
                  Pause All
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Play size={iconSizes.sm} />}
                  onClick={() => resumeAllMutation.mutate()}
                  disabled={resumeAllMutation.isPending}
                  data-testid="resume-all-btn"
                >
                  Resume All
                </Button>
                <Button
                  variant="primary"
                  size="md"
                  icon={<Plus size={iconSizes.md} />}
                  onClick={handleOpenCreate}
                  data-testid="create-trigger-btn"
                >
                  New Trigger
                </Button>
              </>
            )}
          </Stack>
        </Stack>

        {/* Tabs */}
        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === "triggers" && <TriggerList onEdit={handleEdit} />}
        {activeTab === "chain-graph" && <ChainGraph />}
        {activeTab === "log" && <TriggerLogTable />}
      </Stack>

      {/* Create / Edit modal */}
      <Modal
        open={formOpen}
        onClose={handleCloseForm}
        title={editingTrigger ? "Edit Trigger" : "New Trigger"}
        size="lg"
      >
        <TriggerForm
          trigger={editingTrigger}
          onSubmit={handleSubmit}
          onCancel={handleCloseForm}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      </Modal>
    </div>
  );
}
