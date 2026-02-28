/**
 * Inline form for creating a new report schedule (PRD-73).
 *
 * Renders within ScheduleManager when the user clicks "New Schedule".
 */

import { useState } from "react";

import { Button, Input, Select } from "@/components/primitives";

import { useCreateSchedule, useReportTypes } from "./hooks/use-reports";
import { FORMAT_LABELS, SCHEDULE_LABELS } from "./types";
import type { ReportFormat } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SCHEDULE_OPTIONS = Object.entries(SCHEDULE_LABELS).map(([value, label]) => ({
  value,
  label,
}));

const FORMAT_SELECT_OPTIONS = Object.entries(FORMAT_LABELS).map(([value, label]) => ({
  value,
  label,
}));

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CreateScheduleFormProps {
  onCancel: () => void;
}

export function CreateScheduleForm({ onCancel }: CreateScheduleFormProps) {
  const { data: reportTypes } = useReportTypes();
  const createSchedule = useCreateSchedule();

  const [typeId, setTypeId] = useState("");
  const [format, setFormat] = useState<ReportFormat>("csv");
  const [schedule, setSchedule] = useState("weekly");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recipients, setRecipients] = useState("");

  const typeOptions = (reportTypes ?? []).map((rt) => ({
    value: String(rt.id),
    label: rt.name,
  }));

  const canSubmit = typeId !== "" && dateFrom !== "" && dateTo !== "";

  function handleSubmit() {
    if (!canSubmit) return;

    createSchedule.mutate(
      {
        report_type_id: Number(typeId),
        config_json: { date_from: dateFrom, date_to: dateTo },
        format,
        schedule,
        recipients_json: recipients
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean),
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <div data-testid="create-schedule-form" className="flex flex-col gap-3 p-3">
      <Select
        label="Report Type"
        options={typeOptions}
        value={typeId}
        onChange={setTypeId}
        placeholder="Select type..."
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Format"
          options={FORMAT_SELECT_OPTIONS}
          value={format}
          onChange={(v) => setFormat(v as ReportFormat)}
        />
        <Select
          label="Schedule"
          options={SCHEDULE_OPTIONS}
          value={schedule}
          onChange={setSchedule}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Date From"
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
        />
        <Input
          label="Date To"
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
        />
      </div>
      <Input
        label="Recipients (comma-separated)"
        value={recipients}
        onChange={(e) => setRecipients(e.target.value)}
        placeholder="user@example.com, admin@example.com"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={createSchedule.isPending}
          data-testid="submit-schedule-btn"
        >
          Create Schedule
        </Button>
      </div>
    </div>
  );
}
