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

import { useQueryClient } from "@tanstack/react-query";

import { Badge, Toggle } from "@/components/primitives";

import { api } from "@/lib/api";
import { useSceneCatalogue } from "@/features/scene-catalogue/hooks/use-scene-catalogue";
import { trackConfigKeys } from "@/features/scene-catalogue/hooks/use-track-configs";
import type { SceneCatalogueEntry } from "@/features/scene-catalogue/types";

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

type WizardStep = "upload" | "validation" | "parameters" | "assign" | "done";

const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Upload JSON",
  validation: "Review Validation",
  parameters: "Review Parameters",
  assign: "Assign to Scenes",
  done: "Complete",
};

const STEPS: WizardStep[] = ["upload", "validation", "parameters", "assign", "done"];

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ImportWizard({
  onComplete,
  onImport,
  onValidate,
  isImporting = false,
}: ImportWizardProps) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>("upload");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [jsonText, setJsonText] = useState("");
  const [sourceFilename, setSourceFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [assignedPairs, setAssignedPairs] = useState<Set<string>>(new Set());
  const [isAssigning, setIsAssigning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const currentStepIndex = STEPS.indexOf(step);

  const readFile = useCallback((file: File) => {
    setSourceFilename(file.name);
    // Default workflow name to filename (without extension) if not already filled
    setName((prev) => {
      if (prev.trim()) return prev;
      return file.name.replace(/\.json$/i, "");
    });
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === "string") {
        setJsonText(text);
        setError(null);
      }
    };
    reader.readAsText(file);
  }, []);

  const handleFileUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file);
    },
    [readFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) readFile(file);
    },
    [readFile],
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
        source_filename: sourceFilename,
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
        {STEPS.map((s, i) => {
          // Can navigate to visited steps (except can't go back to upload after import)
          const isVisited = i <= currentStepIndex;
          const canClick = isVisited && s !== step && s !== "done" && (s !== "upload" || !workflow);

          return (
            <span key={s} className="inline-flex items-center">
              {i > 0 && (
                <span className="mr-2 text-sm text-[var(--color-text-tertiary)]">/</span>
              )}
              <span
                data-testid={`indicator-${s}`}
                role={canClick ? "button" : undefined}
                tabIndex={canClick ? 0 : undefined}
                onClick={canClick ? () => setStep(s) : undefined}
                onKeyDown={canClick ? (e) => { if (e.key === "Enter") setStep(s); } : undefined}
                className={`text-sm font-medium ${
                  s === step
                    ? "text-[var(--color-action-primary)] underline underline-offset-4"
                    : isVisited
                      ? "text-[var(--color-action-primary)] cursor-pointer hover:underline"
                      : "text-[var(--color-text-tertiary)]"
                }`}
              >
                {STEP_LABELS[s]}
              </span>
            </span>
          );
        })}
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

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`rounded-[var(--radius-lg)] border-2 border-dashed p-6 text-center transition-colors ${
              isDragging
                ? "border-[var(--color-action-primary)] bg-[var(--color-action-primary)]/5"
                : "border-[var(--color-border-subtle)]"
            }`}
          >
            <p className="text-sm text-[var(--color-text-secondary)]">
              {sourceFilename
                ? `Loaded: ${sourceFilename}`
                : "Drag & drop a ComfyUI workflow JSON file here, or"}
            </p>
            <label className="mt-2 inline-block cursor-pointer rounded bg-[var(--color-surface-secondary)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]">
              Browse file
              <input
                data-testid="file-upload"
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
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
                {validationResult.validation_source === "live" ? (
                  <Badge
                    variant={validationResult.overall_valid ? "success" : "danger"}
                  >
                    {validationResult.overall_valid ? "Valid" : "Invalid"}
                  </Badge>
                ) : (
                  <Badge variant="warning">Unverified</Badge>
                )}
                <Badge
                  variant={validationResult.validation_source === "live" ? "info" : "warning"}
                >
                  {validationResult.validation_source === "live"
                    ? "Live (ComfyUI)"
                    : "Connect ComfyUI to verify"}
                </Badge>
              </div>

              {validationResult.validation_source === "static" && (
                <p className="text-sm text-[var(--color-action-warning)]">
                  No ComfyUI instance is connected. Connect to ComfyUI and
                  re-validate to check node availability.
                </p>
              )}

              {validationResult.node_results.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-medium">
                    Node Validation
                  </h4>
                  <ul className="space-y-1">
                    {validationResult.node_results.map((nr) => {
                      const isLive = validationResult.validation_source === "live";
                      let icon: string;
                      let colorClass: string;

                      if (isLive) {
                        icon = nr.present ? "\u2713" : "\u2717";
                        colorClass = nr.present
                          ? "text-[var(--color-action-success)]"
                          : "text-[var(--color-action-danger)]";
                      } else {
                        icon = "\u2014";
                        colorClass = "text-[var(--color-text-muted)]";
                      }

                      return (
                        <li
                          key={nr.node_type}
                          data-testid={`node-result-${nr.node_type}`}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className={colorClass}>{icon}</span>
                          {nr.node_type}
                        </li>
                      );
                    })}
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

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep("upload")}
              className="rounded border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
            >
              Back
            </button>
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

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep("validation")}
              className="rounded border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
            >
              Back
            </button>
            <button
              data-testid="next-to-assign"
              type="button"
              onClick={() => setStep("assign")}
              className="rounded bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              Next: Assign to Scenes
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Assign to Scenes */}
      {step === "assign" && workflow && (
        <AssignToScenesStep
          workflowId={workflow.id}
          assignedPairs={assignedPairs}
          onBack={() => setStep("parameters")}
          onToggle={(key) => {
            setAssignedPairs((prev) => {
              const next = new Set(prev);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              return next;
            });
          }}
          onFinish={async () => {
            setIsAssigning(true);
            setError(null);
            const results = await Promise.allSettled(
              Array.from(assignedPairs).map((key) => {
                const parts = key.split(":");
                const sceneTypeId = Number(parts[0]);
                const trackId = Number(parts[1]);
                const isClothesOff = parts[2] === "co";
                return api.put(
                  `/scene-types/${sceneTypeId}/track-configs/${trackId}`,
                  { workflow_id: workflow.id, is_clothes_off: isClothesOff },
                );
              }),
            );
            const failures = results.filter((r) => r.status === "rejected");
            if (failures.length > 0) {
              console.error("Failed to assign workflows:", failures);
              setError(
                `${failures.length} of ${results.length} assignment(s) failed. Check console for details.`,
              );
            }
            // Invalidate all track config caches so other views pick up changes
            queryClient.invalidateQueries({ queryKey: trackConfigKeys.all });
            setIsAssigning(false);
            setStep("done");
          }}
          onSkip={() => setStep("done")}
          isAssigning={isAssigning}
        />
      )}

      {/* Step 5: Done */}
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

          {error && (
            <p className="text-sm text-[var(--color-action-danger)]">{error}</p>
          )}

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

/* --------------------------------------------------------------------------
   Assign to Scenes sub-component
   -------------------------------------------------------------------------- */

interface AssignToScenesStepProps {
  workflowId: number;
  assignedPairs: Set<string>;
  onBack: () => void;
  onToggle: (key: string) => void;
  onFinish: () => void;
  onSkip: () => void;
  isAssigning: boolean;
}

function AssignToScenesStep({
  assignedPairs,
  onBack,
  onToggle,
  onFinish,
  onSkip,
  isAssigning,
}: AssignToScenesStepProps) {
  const { data: entries, isLoading } = useSceneCatalogue(true);

  const entriesWithTracks = (entries ?? []).filter(
    (e: SceneCatalogueEntry) => e.tracks.length > 0,
  );

  if (isLoading) {
    return <p className="text-sm text-[var(--color-text-muted)]">Loading scenes...</p>;
  }

  return (
    <div data-testid="step-assign" className="space-y-4">
      <p className="text-sm text-[var(--color-text-secondary)]">
        Toggle the scene + track combinations that should use this workflow.
        You can skip this step and assign later from the Scene Catalogue.
      </p>

      {entriesWithTracks.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          No scene types with tracks found. You can assign workflows later.
        </p>
      ) : (
        <div className="overflow-y-auto rounded border border-[var(--color-border-subtle)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-primary)]">
              <tr className="border-b border-[var(--color-border-default)]">
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Scene Type
                </th>
                <th className="px-3 py-1.5 text-left text-xs font-medium text-[var(--color-text-muted)]">
                  Track
                </th>
                <th className="px-3 py-1.5 text-center text-xs font-medium text-[var(--color-text-muted)]">
                  Assign
                </th>
              </tr>
            </thead>
            <tbody>
              {entriesWithTracks.map((entry: SceneCatalogueEntry) => {
                // Build rows: normal + clothes-off per track
                const rows: { trackId: number; trackName: string; isClothesOff: boolean }[] = [];
                for (const track of entry.tracks) {
                  rows.push({ trackId: track.id, trackName: track.name, isClothesOff: false });
                  if (entry.has_clothes_off_transition) {
                    rows.push({ trackId: track.id, trackName: track.name, isClothesOff: true });
                  }
                }

                return rows.map((row, idx) => {
                  const key = `${entry.id}:${row.trackId}${row.isClothesOff ? ":co" : ""}`;
                  return (
                    <tr
                      key={key}
                      className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-secondary)] transition-colors cursor-pointer"
                      onClick={() => onToggle(key)}
                    >
                      <td className="px-3 py-1">
                        {idx === 0 ? (
                          <span className="text-xs font-medium text-[var(--color-text-primary)]">
                            {entry.name}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-1 text-xs text-[var(--color-text-secondary)]">
                        <span>{row.trackName}</span>
                        {row.isClothesOff && (
                          <span className="ml-1.5 text-[var(--color-action-warning)] font-medium">
                            (Clothes Off)
                          </span>
                        )}
                      </td>
                      <td
                        className="px-3 py-1 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Toggle
                          checked={assignedPairs.has(key)}
                          onChange={() => onToggle(key)}
                          size="sm"
                        />
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-between">
        <button
          type="button"
          onClick={onBack}
          className="rounded border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
        >
          Back
        </button>
        <div className="flex gap-2">
          <button
            data-testid="skip-assign"
            type="button"
            onClick={onSkip}
            className="rounded border border-[var(--color-border-default)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-secondary)]"
          >
            Skip
          </button>
          <button
            data-testid="finish-assign"
          type="button"
          disabled={isAssigning}
          onClick={onFinish}
          className="rounded bg-[var(--color-action-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isAssigning
            ? "Assigning..."
            : assignedPairs.size > 0
              ? `Assign & Finish (${assignedPairs.size})`
              : "Finish"}
          </button>
        </div>
      </div>
    </div>
  );
}
