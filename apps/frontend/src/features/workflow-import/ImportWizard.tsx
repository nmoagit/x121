/**
 * Multi-step import wizard for ComfyUI workflows (PRD-75).
 *
 * Steps:
 * 1. Upload JSON file or paste content
 * 2. Review validation results
 * 3. Review discovered parameters
 * 4. Success summary
 */

import { useCallback, useState } from "react";

import { Badge } from "@/components/primitives";

import type {
  DiscoveredParameter,
  ImportWorkflowRequest,
  ValidationResult,
  Workflow,
} from "./types";
import { workflowStatusLabel, workflowStatusVariant } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ImportWizardProps {
  /** Callback when import is complete. */
  onComplete?: (workflow: Workflow) => void;
  /** Import mutation function. */
  onImport: (input: ImportWorkflowRequest) => Promise<Workflow>;
  /** Validate mutation function. */
  onValidate?: (id: number) => Promise<ValidationResult>;
  /** Whether the import is currently in progress. */
  isImporting?: boolean;
}

type WizardStep = "upload" | "validation" | "parameters" | "done";

const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Upload JSON",
  validation: "Review Validation",
  parameters: "Review Parameters",
  done: "Complete",
};

const STEPS: WizardStep[] = ["upload", "validation", "parameters", "done"];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImportWizard({
  onComplete,
  onImport,
  onValidate,
  isImporting = false,
}: ImportWizardProps) {
  const [step, setStep] = useState<WizardStep>("upload");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  const currentStepIndex = STEPS.indexOf(step);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result;
        if (typeof text === "string") {
          setJsonText(text);
          setError(null);
        }
      };
      reader.readAsText(file);
    },
    [],
  );

  const handleImport = useCallback(async () => {
    setError(null);

    if (!name.trim()) {
      setError("Workflow name is required.");
      return;
    }

    let parsedJson: Record<string, unknown>;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch {
      setError("Invalid JSON. Please check your input.");
      return;
    }

    try {
      const result = await onImport({
        name: name.trim(),
        description: description.trim() || undefined,
        json_content: parsedJson,
      });
      setWorkflow(result);

      // Try to validate.
      if (onValidate) {
        try {
          const validation = await onValidate(result.id);
          setValidationResult(validation);
        } catch {
          // Validation is optional at import time.
        }
      }

      setStep("validation");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Import failed.";
      setError(message);
    }
  }, [name, description, jsonText, onImport, onValidate]);

  const discoveredParams: DiscoveredParameter[] =
    (workflow?.discovered_params_json as DiscoveredParameter[] | null) ?? [];

  return (
    <div data-testid="import-wizard" className="space-y-6">
      {/* Step indicator */}
      <nav data-testid="step-indicator" className="flex gap-2">
        {STEPS.map((s, i) => (
          <span
            key={s}
            data-testid={`indicator-${s}`}
            className={`text-sm font-medium ${
              i <= currentStepIndex
                ? "text-[var(--color-action-primary)]"
                : "text-[var(--color-text-tertiary)]"
            }`}
          >
            {i > 0 && (
              <span className="mr-2 text-[var(--color-text-tertiary)]">
                /
              </span>
            )}
            {STEP_LABELS[s]}
          </span>
        ))}
      </nav>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div data-testid="step-upload" className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Workflow Name
            </span>
            <input
              data-testid="workflow-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1.5 text-sm"
              placeholder="My Workflow"
            />
          </label>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Description (optional)
            </span>
            <input
              data-testid="workflow-description-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1.5 text-sm"
              placeholder="Optional description"
            />
          </label>

          <div className="space-y-2">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Upload a ComfyUI workflow JSON file or paste the contents
              below:
            </p>
            <input
              data-testid="file-upload"
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="block text-sm"
            />
          </div>

          <label className="block space-y-1 text-sm">
            <span className="text-[var(--color-text-secondary)]">
              Or paste JSON:
            </span>
            <textarea
              data-testid="json-textarea"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={10}
              className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-secondary)] px-2 py-1.5 font-mono text-xs"
              placeholder='{"3": {"class_type": "KSampler", ...}}'
            />
          </label>

          {error && (
            <p data-testid="error-message" className="text-sm text-[var(--color-action-danger)]">
              {error}
            </p>
          )}

          <div className="flex justify-end">
            <button
              data-testid="import-btn"
              type="button"
              disabled={!jsonText.trim() || !name.trim() || isImporting}
              onClick={handleImport}
              className="rounded bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {isImporting ? "Importing..." : "Import & Validate"}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Validation Results */}
      {step === "validation" && (
        <div data-testid="step-validation" className="space-y-4">
          {validationResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Overall:</span>
                <Badge
                  variant={
                    validationResult.overall_valid ? "success" : "danger"
                  }
                >
                  {validationResult.overall_valid ? "Valid" : "Invalid"}
                </Badge>
              </div>

              {validationResult.node_results.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">
                    Node Validation
                  </h4>
                  <ul className="space-y-1">
                    {validationResult.node_results.map((nr) => (
                      <li
                        key={nr.node_type}
                        data-testid={`node-result-${nr.node_type}`}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className={
                            nr.present
                              ? "text-[var(--color-action-success)]"
                              : "text-[var(--color-action-danger)]"
                          }
                        >
                          {nr.present ? "\u2713" : "\u2717"}
                        </span>
                        {nr.node_type}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validationResult.model_results.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">
                    Model Validation
                  </h4>
                  <ul className="space-y-1">
                    {validationResult.model_results.map((mr) => (
                      <li
                        key={mr.model_name}
                        data-testid={`model-result-${mr.model_name}`}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className={
                            mr.found_in_registry
                              ? "text-[var(--color-action-success)]"
                              : "text-[var(--color-action-warning)]"
                          }
                        >
                          {mr.found_in_registry ? "\u2713" : "?"}
                        </span>
                        {mr.model_name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p
              data-testid="no-validation"
              className="text-sm text-[var(--color-text-tertiary)]"
            >
              No validation results available. Validation can be run after
              import.
            </p>
          )}

          <div className="flex justify-end">
            <button
              data-testid="next-to-parameters"
              type="button"
              onClick={() => setStep("parameters")}
              className="rounded bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Next: Review Parameters
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Discovered Parameters */}
      {step === "parameters" && (
        <div data-testid="step-parameters" className="space-y-4">
          {discoveredParams.length > 0 ? (
            <ul className="space-y-2">
              {discoveredParams.map((param) => (
                <li
                  key={`${param.node_id}-${param.input_name}`}
                  data-testid={`param-${param.node_id}-${param.input_name}`}
                  className="rounded border border-[var(--color-border-subtle)] p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {param.suggested_name}
                    </span>
                    <Badge variant="default" size="sm">
                      {param.category}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">
                    Node {param.node_id} / {param.input_name}
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                    Current: {JSON.stringify(param.current_value)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p
              data-testid="no-parameters"
              className="text-sm text-[var(--color-text-tertiary)]"
            >
              No configurable parameters were detected in this workflow.
            </p>
          )}

          <div className="flex justify-end">
            <button
              data-testid="next-to-done"
              type="button"
              onClick={() => setStep("done")}
              className="rounded bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Finish
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
      {step === "done" && workflow && (
        <div data-testid="step-done" className="space-y-4">
          <div className="rounded border border-[var(--color-action-success)] bg-[var(--color-action-success)]/10 p-4">
            <h3 className="text-sm font-medium text-[var(--color-action-success)]">
              Workflow imported successfully
            </h3>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              <strong>{workflow.name}</strong> (ID: {workflow.id}) has been
              imported as version {workflow.current_version}.
            </p>
            <div className="mt-2">
              <Badge variant={workflowStatusVariant(workflow.status_id)}>
                {workflowStatusLabel(workflow.status_id)}
              </Badge>
            </div>
          </div>

          {onComplete && (
            <div className="flex justify-end">
              <button
                data-testid="done-btn"
                type="button"
                onClick={() => onComplete(workflow)}
                className="rounded bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
