/**
 * Main wizard shell for legacy data import (PRD-86).
 *
 * Orchestrates the multi-step import flow: source selection, mapping
 * configuration, preview, and progress/report.
 */

import { useState } from "react";

import { GapAnalysisPanel } from "./GapAnalysisPanel";
import { ImportPreview } from "./ImportPreview";
import { ImportProgress } from "./ImportProgress";
import { MappingConfig } from "./MappingConfig";
import { SourceSelection } from "./SourceSelection";
import type {
  ImportRunStatus,
  InferredEntity,
  LegacyImportRun,
  MatchKey,
  PathMappingRule,
  RunReport,
} from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STEP_LABELS = ["Source", "Mapping", "Preview", "Import"] as const;
type WizardStep = (typeof STEP_LABELS)[number];

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

export interface LegacyImportWizardProps {
  /** Current project ID. */
  projectId: number;
  /** The import run (null if not yet created). */
  run?: LegacyImportRun | null;
  /** Current status name. */
  statusName?: ImportRunStatus;
  /** Inferred entities from scanning. */
  inferredEntities?: InferredEntity[];
  /** Full report. */
  report?: RunReport | null;
  /** Called when creating a run. */
  onCreateRun?: (sourcePath: string, projectId: number, matchKey: MatchKey) => void;
  /** Called when scanning. */
  onScan?: (sourcePath: string) => void;
  /** Called when confirming import. */
  onConfirm?: () => void;
  /** Called when cancelling. */
  onCancel?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LegacyImportWizard({
  projectId,
  run,
  statusName = "scanning",
  inferredEntities = [],
  report,
  onCreateRun,
  onScan: _onScan,
  onConfirm,
  onCancel,
}: LegacyImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("Source");
  const [rules, setRules] = useState<PathMappingRule[]>([]);

  const handleSourceSelect = (sourcePath: string, pid: number, matchKey: MatchKey) => {
    onCreateRun?.(sourcePath, pid, matchKey);
    setStep("Mapping");
  };

  const handleMappingNext = () => {
    setStep("Preview");
  };

  const handleConfirm = () => {
    onConfirm?.();
    setStep("Import");
  };

  const isComplete =
    statusName === "completed" ||
    statusName === "partial" ||
    statusName === "failed" ||
    statusName === "cancelled";

  return (
    <div data-testid="legacy-import-wizard" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-[var(--color-text-primary)]">
          Legacy Data Import
        </h2>
      </div>

      {/* Step indicators */}
      <nav data-testid="wizard-steps" className="flex gap-2">
        {STEP_LABELS.map((s, idx) => (
          <button
            key={s}
            data-testid={`step-${s.toLowerCase()}`}
            onClick={() => setStep(s)}
            type="button"
            className={`rounded px-3 py-1 text-sm ${
              step === s
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-[var(--color-text-secondary)]"
            }`}
          >
            {idx + 1}. {s}
          </button>
        ))}
      </nav>

      {/* Step content */}
      {step === "Source" && (
        <SourceSelection
          projectId={projectId}
          onSelect={handleSourceSelect}
          disabled={!!run}
        />
      )}

      {step === "Mapping" && (
        <div className="space-y-4">
          <MappingConfig
            rules={rules}
            onChange={setRules}
            disabled={isComplete}
          />
          <button
            data-testid="mapping-next-btn"
            onClick={handleMappingNext}
            type="button"
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
          >
            Next: Preview
          </button>
        </div>
      )}

      {step === "Preview" && (
        <ImportPreview
          entities={inferredEntities}
          onConfirm={handleConfirm}
          onCancel={onCancel}
          disabled={isComplete}
        />
      )}

      {step === "Import" && run && (
        <div className="space-y-6">
          <ImportProgress
            run={run}
            statusName={statusName}
            report={report}
          />
          {run.gap_report &&
            typeof run.gap_report === "object" &&
            Object.keys(run.gap_report).length > 0 && (
              <GapAnalysisPanel gapReport={run.gap_report} />
            )}
        </div>
      )}
    </div>
  );
}
