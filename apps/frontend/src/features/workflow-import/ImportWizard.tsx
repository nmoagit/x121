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

import { Button, Toggle } from "@/components/primitives";
import { TERMINAL_INPUT, TERMINAL_TEXTAREA, TERMINAL_DIVIDER, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";

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
import { workflowStatusLabel } from "./types";

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
  upload: "Upload",
  validation: "Validation",
  parameters: "Parameters",
  assign: "Assign",
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
  }, [name, description, jsonText, onImport, onValidate, sourceFilename]);

  const discoveredParams: DiscoveredParameter[] =
    (workflow?.discovered_params_json as DiscoveredParameter[] | null) ?? [];

  return (
    <div data-testid="import-wizard" className="space-y-4">
      {/* Step indicator */}
      <nav data-testid="step-indicator" className="flex items-center gap-1 font-mono text-xs">
        {STEPS.map((s, i) => {
          const isVisited = i <= currentStepIndex;
          const canClick = isVisited && s !== step && s !== "done" && (s !== "upload" || !workflow);

          return (
            <span key={s} className="inline-flex items-center">
              {i > 0 && (
                <span className="mx-1 text-white/20">/</span>
              )}
              <span
                data-testid={`indicator-${s}`}
                role={canClick ? "button" : undefined}
                tabIndex={canClick ? 0 : undefined}
                onClick={canClick ? () => setStep(s) : undefined}
                onKeyDown={canClick ? (e) => { if (e.key === "Enter") setStep(s); } : undefined}
                className={cn(
                  "uppercase tracking-wide",
                  s === step
                    ? "text-cyan-400"
                    : isVisited
                      ? "text-cyan-400/60 cursor-pointer hover:text-cyan-400"
                      : "text-[var(--color-text-muted)]",
                )}
              >
                {STEP_LABELS[s]}
              </span>
            </span>
          );
        })}
      </nav>

      {/* Step 1: Upload */}
      {step === "upload" && (
        <div data-testid="step-upload" className="space-y-3">
          <div className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              Workflow Name
            </span>
            <input
              data-testid="workflow-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={cn(TERMINAL_INPUT, "w-full")}
              placeholder="My Workflow"
            />
          </div>

          <div className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              Description
            </span>
            <input
              data-testid="workflow-description-input"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(TERMINAL_INPUT, "w-full")}
              placeholder="Optional description"
            />
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "rounded-[var(--radius-sm)] border-2 border-dashed p-4 text-center transition-colors",
              isDragging
                ? "border-cyan-400 bg-cyan-400/5"
                : "border-[var(--color-border-default)]",
            )}
          >
            <p className="font-mono text-xs text-[var(--color-text-muted)]">
              {sourceFilename
                ? <>loaded: <span className="text-cyan-400">{sourceFilename}</span></>
                : "drop comfyui workflow .json here"}
            </p>
            <label className="mt-2 inline-block cursor-pointer rounded bg-[#161b22] px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
              Browse
              <input
                data-testid="file-upload"
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">
              Or paste JSON
            </span>
            <textarea
              data-testid="json-textarea"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              rows={8}
              className={cn(TERMINAL_TEXTAREA, "w-full")}
              placeholder='{"3": {"class_type": "KSampler", ...}}'
            />
          </div>

          {error && (
            <p data-testid="error-message" className="font-mono text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex justify-end pt-1 border-t border-[var(--color-border-default)]">
            <Button
              data-testid="import-btn"
              size="sm"
              disabled={!jsonText.trim() || !name.trim() || isImporting}
              onClick={handleImport}
            >
              {isImporting ? "Importing..." : "Import & Validate"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Validation Results */}
      {step === "validation" && (
        <div data-testid="step-validation" className="space-y-3">
          {validationResult ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-[var(--color-text-muted)]">overall:</span>
                {validationResult.validation_source === "live" ? (
                  <span className={validationResult.overall_valid ? "text-green-400" : "text-red-400"}>
                    {validationResult.overall_valid ? "valid" : "invalid"}
                  </span>
                ) : (
                  <span className="text-orange-400">unverified</span>
                )}
                <span className="text-white/20">|</span>
                <span className={validationResult.validation_source === "live" ? "text-cyan-400" : "text-orange-400"}>
                  {validationResult.validation_source === "live" ? "live (ComfyUI)" : "static — connect ComfyUI to verify"}
                </span>
              </div>

              {validationResult.node_results.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                    nodes ({validationResult.node_results.length})
                  </p>
                  <div className="border border-[var(--color-border-default)] rounded-[var(--radius-sm)] max-h-40 overflow-y-auto">
                    {validationResult.node_results.map((nr) => {
                      const isLive = validationResult.validation_source === "live";
                      return (
                        <div
                          key={nr.node_type}
                          data-testid={`node-result-${nr.node_type}`}
                          className={`px-2 py-0.5 font-mono text-xs flex items-center gap-2 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}
                        >
                          <span className={isLive ? (nr.present ? "text-green-400" : "text-red-400") : "text-[var(--color-text-muted)]"}>
                            {isLive ? (nr.present ? "✓" : "✗") : "—"}
                          </span>
                          <span className="text-[var(--color-text-primary)]">{nr.node_type}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {validationResult.model_results.length > 0 && (
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-[var(--color-text-muted)] mb-1">
                    models ({validationResult.model_results.length})
                  </p>
                  <div className="border border-[var(--color-border-default)] rounded-[var(--radius-sm)] max-h-40 overflow-y-auto">
                    {validationResult.model_results.map((mr) => (
                      <div
                        key={mr.model_name}
                        data-testid={`model-result-${mr.model_name}`}
                        className={`px-2 py-0.5 font-mono text-xs flex items-center gap-2 ${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER}`}
                      >
                        <span className={mr.found_in_registry ? "text-green-400" : "text-orange-400"}>
                          {mr.found_in_registry ? "✓" : "?"}
                        </span>
                        <span className="text-[var(--color-text-primary)]">{mr.model_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p data-testid="no-validation" className="font-mono text-xs text-[var(--color-text-muted)]">
              No validation results available. Validation can be run after import.
            </p>
          )}

          <div className="flex justify-between pt-1 border-t border-[var(--color-border-default)]">
            <Button size="sm" variant="secondary" onClick={() => setStep("upload")}>
              Back
            </Button>
            <Button size="sm" data-testid="next-to-parameters" onClick={() => setStep("parameters")}>
              Parameters
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Discovered Parameters */}
      {step === "parameters" && (
        <div data-testid="step-parameters" className="space-y-3">
          {discoveredParams.length > 0 ? (
            <div className="border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
              {discoveredParams.map((param, i) => (
                <div
                  key={`${param.node_id}-${param.input_name}`}
                  data-testid={`param-${param.node_id}-${param.input_name}`}
                  className={`px-2 py-1.5 font-mono text-xs ${i > 0 ? TERMINAL_DIVIDER : ""} ${TERMINAL_ROW_HOVER}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--color-text-primary)]">{param.suggested_name}</span>
                    <span className="text-[var(--color-text-muted)]">{param.category}</span>
                  </div>
                  <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                    node {param.node_id} / {param.input_name} = <span className="text-cyan-400">{JSON.stringify(param.current_value)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p data-testid="no-parameters" className="font-mono text-xs text-[var(--color-text-muted)]">
              No configurable parameters detected in this workflow.
            </p>
          )}

          <div className="flex justify-between pt-1 border-t border-[var(--color-border-default)]">
            <Button size="sm" variant="secondary" onClick={() => setStep("validation")}>
              Back
            </Button>
            <Button size="sm" data-testid="next-to-assign" onClick={() => setStep("assign")}>
              Assign to Scenes
            </Button>
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
              setError(
                `${failures.length} of ${results.length} assignment(s) failed.`,
              );
            }
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
        <div data-testid="step-done" className="space-y-3">
          <div className="border-l-2 border-green-400 pl-2 py-1 font-mono text-xs">
            <p className="text-green-400">workflow imported successfully</p>
            <p className="text-[var(--color-text-primary)] mt-0.5">
              <span className="text-cyan-400">{workflow.name}</span> (id: {workflow.id}) v{workflow.current_version}
            </p>
            <p className="text-[var(--color-text-muted)] mt-0.5">
              status: <span className="text-cyan-400">{workflowStatusLabel(workflow.status_id).toLowerCase()}</span>
            </p>
          </div>

          {error && (
            <p className="font-mono text-xs text-red-400">{error}</p>
          )}

          {onComplete && (
            <div className="flex justify-end pt-1 border-t border-[var(--color-border-default)]">
              <Button data-testid="done-btn" size="sm" onClick={() => onComplete(workflow)}>
                Done
              </Button>
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
    return <p className="font-mono text-xs text-[var(--color-text-muted)]">loading scenes...</p>;
  }

  return (
    <div data-testid="step-assign" className="space-y-3">
      <p className="font-mono text-xs text-[var(--color-text-muted)]">
        Toggle scene + track combinations for this workflow. You can skip and assign later.
      </p>

      {entriesWithTracks.length === 0 ? (
        <p className="font-mono text-xs text-[var(--color-text-muted)]">
          No scene types with tracks found.
        </p>
      ) : (
        <div className="overflow-y-auto max-h-64 border border-[var(--color-border-default)] rounded-[var(--radius-sm)]">
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-[#161b22]">
              <tr className={TERMINAL_DIVIDER}>
                <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Scene</th>
                <th className="px-2 py-1 text-left text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Track</th>
                <th className="px-2 py-1 text-center text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">Assign</th>
              </tr>
            </thead>
            <tbody>
              {entriesWithTracks.map((entry: SceneCatalogueEntry) => {
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
                      className={`${TERMINAL_DIVIDER} last:border-b-0 ${TERMINAL_ROW_HOVER} cursor-pointer`}
                      onClick={() => onToggle(key)}
                    >
                      <td className="px-2 py-0.5">
                        {idx === 0 ? (
                          <span className="text-[var(--color-text-primary)]">{entry.name}</span>
                        ) : null}
                      </td>
                      <td className="px-2 py-0.5 text-[var(--color-text-muted)]">
                        {row.trackName}
                        {row.isClothesOff && (
                          <span className="ml-1 text-orange-400">(off)</span>
                        )}
                      </td>
                      <td className="px-2 py-0.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <Toggle
                          checked={assignedPairs.has(key)}
                          onChange={() => onToggle(key)}
                          size="xs"
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

      <div className="flex justify-between pt-1 border-t border-[var(--color-border-default)]">
        <Button size="sm" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <div className="flex gap-2">
          <Button data-testid="skip-assign" size="sm" variant="secondary" onClick={onSkip}>
            Skip
          </Button>
          <Button
            data-testid="finish-assign"
            size="sm"
            disabled={isAssigning}
            onClick={onFinish}
          >
            {isAssigning
              ? "Assigning..."
              : assignedPairs.size > 0
                ? `Assign (${assignedPairs.size})`
                : "Finish"}
          </Button>
        </div>
      </div>
    </div>
  );
}
