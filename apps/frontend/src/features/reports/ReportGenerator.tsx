/**
 * Report generation form for Production Reporting (PRD-73).
 *
 * Allows users to select a report type, date range, and output format,
 * then triggers report generation via the API.
 */

import { useState } from "react";

import { Button, Input, Select } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";

import { useGenerateReport, useReportTypes } from "./hooks/use-reports";
import { FORMAT_LABELS } from "./types";
import type { ReportFormat } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const FORMAT_OPTIONS: ReportFormat[] = ["json", "csv", "pdf"];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ReportGenerator() {
  const { data: reportTypes, isLoading: typesLoading } = useReportTypes();
  const generateReport = useGenerateReport();

  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [format, setFormat] = useState<ReportFormat>("json");

  const canSubmit =
    selectedTypeId !== "" && dateFrom !== "" && dateTo !== "" && !generateReport.isPending;

  function handleGenerate() {
    if (!canSubmit) return;

    generateReport.mutate({
      report_type_id: Number(selectedTypeId),
      config_json: { date_from: dateFrom, date_to: dateTo },
      format,
    });
  }

  const typeOptions = (reportTypes ?? []).map((rt) => ({
    value: String(rt.id),
    label: rt.name,
  }));

  return (
    <div data-testid="report-generator">
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Generate Report
          </h3>
        </CardHeader>

        <CardBody>
          <div className="flex flex-col gap-4">
            <Select
              label="Report Type"
              options={typeOptions}
              value={selectedTypeId}
              onChange={setSelectedTypeId}
              placeholder="Select a report type..."
              disabled={typesLoading}
            />

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

            <fieldset>
              <legend className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                Format
              </legend>
              <div className="flex gap-4" data-testid="format-selector">
                {FORMAT_OPTIONS.map((f) => (
                  <label key={f} className="inline-flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="report-format"
                      value={f}
                      checked={format === f}
                      onChange={() => setFormat(f)}
                      className="accent-[var(--color-action-primary)]"
                    />
                    <span className="text-sm text-[var(--color-text-primary)]">
                      {FORMAT_LABELS[f]}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={handleGenerate}
                disabled={!canSubmit}
                loading={generateReport.isPending}
                data-testid="generate-btn"
              >
                Generate Report
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
