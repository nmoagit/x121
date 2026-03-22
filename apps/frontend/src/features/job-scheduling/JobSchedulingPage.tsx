/**
 * Job scheduling page (PRD-119).
 *
 * Top-level page with tabs for schedule management and off-peak configuration.
 * The Schedules tab shows a list of all schedules with a create button.
 * The Off-Peak Config tab shows the off-peak windows editor.
 */

import { useCallback, useState } from "react";

import { Button } from "@/components/primitives";
import { Modal, Tabs } from "@/components/composite";
import { Stack } from "@/components/layout";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { Plus } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import {
  useCreateSchedule,
  useUpdateSchedule,
} from "./hooks/use-job-scheduling";
import { OffPeakConfigEditor } from "./OffPeakConfigEditor";
import { ScheduleForm } from "./ScheduleForm";
import { ScheduleList } from "./ScheduleList";
import type { CreateSchedule, Schedule } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const TABS = [
  { id: "schedules", label: "Schedules" },
  { id: "offpeak", label: "Off-Peak Config" },
];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function JobSchedulingPage() {
  useSetPageTitle("Job Scheduling", "Schedule and manage recurring generation jobs.");
  const [activeTab, setActiveTab] = useState("schedules");
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | undefined>();

  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule(editingSchedule?.id ?? 0);

  const handleOpenCreate = useCallback(() => {
    setEditingSchedule(undefined);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((schedule: Schedule) => {
    setEditingSchedule(schedule);
    setFormOpen(true);
  }, []);

  const handleCloseForm = useCallback(() => {
    setFormOpen(false);
    setEditingSchedule(undefined);
  }, []);

  const handleSubmit = useCallback(
    (data: CreateSchedule) => {
      if (editingSchedule) {
        updateMutation.mutate(data, { onSuccess: handleCloseForm });
      } else {
        createMutation.mutate(data, { onSuccess: handleCloseForm });
      }
    },
    [editingSchedule, createMutation, updateMutation, handleCloseForm],
  );

  return (
    <div className="p-[var(--spacing-6)]" data-testid="job-scheduling-page">
      <Stack direction="vertical" gap={5}>
        {/* Page header */}
        <Stack direction="horizontal" gap={3} align="center" justify="end">
          {activeTab === "schedules" && (
            <Button
              variant="primary"
              size="sm"
              icon={<Plus size={iconSizes.md} />}
              onClick={handleOpenCreate}
              data-testid="create-schedule-btn"
            >
              New Schedule
            </Button>
          )}
        </Stack>

        {/* Tabs */}
        <Tabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === "schedules" && <ScheduleList onEdit={handleEdit} />}
        {activeTab === "offpeak" && <OffPeakConfigEditor />}
      </Stack>

      {/* Create / Edit modal */}
      <Modal
        open={formOpen}
        onClose={handleCloseForm}
        title={editingSchedule ? "Edit Schedule" : "New Schedule"}
        size="lg"
      >
        <ScheduleForm
          schedule={editingSchedule}
          onSubmit={handleSubmit}
          onCancel={handleCloseForm}
          isSubmitting={createMutation.isPending || updateMutation.isPending}
        />
      </Modal>
    </div>
  );
}
