/**
 * Multi-step folder import wizard (PRD-113).
 *
 * Steps: Input → Preview → Fix Issues → Confirm.
 * Supports text/CSV name input and displays parsed character entries
 * for review, editing, validation, and bulk import.
 */

import type { ReactNode } from "react";
import { useState } from "react";

import { Badge, Button, Spinner } from "@/components/primitives";
import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import {
  useConfirmImport,
  useCancelSession,
  useIngestFromText,
  useUpdateIngestEntry,
  useValidateSession,
} from "./hooks/use-character-ingest";
import { ImportPreviewTable } from "./ImportPreviewTable";
import type {
  CharacterIngestEntry,
  IngestConfirmResult,
  IngestEntryUpdate,
  IngestSessionDetail,
  WizardStepId,
} from "./types";
import { VALIDATION_STATUS_VARIANT, WIZARD_STEPS } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface FolderImportWizardProps {
  projectId: number;
  onComplete: (characterIds: number[]) => void;
  onCancel: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function FolderImportWizard({
  projectId,
  onComplete,
  onCancel,
}: FolderImportWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStepId>("input");
  const [textInput, setTextInput] = useState("");
  const [sessionData, setSessionData] = useState<IngestSessionDetail | null>(
    null,
  );
  const [confirmResult, setConfirmResult] =
    useState<IngestConfirmResult | null>(null);

  const ingestFromText = useIngestFromText(projectId);
  const sessionId = sessionData?.session.id ?? 0;
  const updateEntry = useUpdateIngestEntry(projectId, sessionId);
  const validateSession = useValidateSession(projectId, sessionId);
  const confirmImport = useConfirmImport(projectId, sessionId);
  const cancelSession = useCancelSession(projectId, sessionId);

  /* -- Step navigation -- */

  const stepIndex = WIZARD_STEPS.findIndex((s) => s.id === currentStep);

  function goNext() {
    const next = WIZARD_STEPS[stepIndex + 1];
    if (next) {
      setCurrentStep(next.id);
    }
  }

  function goBack() {
    const prev = WIZARD_STEPS[stepIndex - 1];
    if (prev) {
      setCurrentStep(prev.id);
    }
  }

  /* -- Handlers -- */

  function handleSubmitText() {
    const names = textInput
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (names.length === 0) return;

    ingestFromText.mutate(
      { names },
      {
        onSuccess: (data) => {
          setSessionData(data);
          goNext();
        },
      },
    );
  }

  function handleUpdateEntry(
    entryId: number,
    updates: Partial<IngestEntryUpdate>,
  ) {
    updateEntry.mutate(
      { entryId, data: updates },
      {
        onSuccess: (updatedEntry) => {
          if (!sessionData) return;
          setSessionData({
            ...sessionData,
            entries: sessionData.entries.map((e) =>
              e.id === updatedEntry.id ? updatedEntry : e,
            ),
          });
        },
      },
    );
  }

  function handleToggleInclude(entryId: number) {
    const entry = sessionData?.entries.find((e) => e.id === entryId);
    if (!entry) return;
    handleUpdateEntry(entryId, { is_included: !entry.is_included });
  }

  function handleValidate() {
    validateSession.mutate(undefined, {
      onSuccess: () => goNext(),
    });
  }

  function handleConfirm() {
    confirmImport.mutate(undefined, {
      onSuccess: (result) => {
        setConfirmResult(result);
        onComplete(result.character_ids);
      },
    });
  }

  function handleCancel() {
    if (sessionId > 0) {
      cancelSession.mutate(undefined, { onSuccess: onCancel });
    } else {
      onCancel();
    }
  }

  /* -- Render -- */

  return (
    <Card>
      <div className="p-6">
        {/* Step indicator */}
        <StepIndicator currentIndex={stepIndex} />

        <div className="mt-6">
          {/* Step 1: Input */}
          {currentStep === "input" && (
            <Stack gap={4}>
              <h3 className="text-lg font-semibold">
                Enter character names
              </h3>
              <p className="text-sm text-muted-foreground">
                Enter one character name per line. Folder names, underscored
                names, and mixed-case names are all accepted.
              </p>
              <textarea
                className="min-h-[200px] w-full rounded-[var(--radius-md)] border border-input bg-background px-3 py-2 font-mono text-sm"
                placeholder={"aj_riley\nmr_simons\ntesa_von_doom\nxena"}
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitText}
                  disabled={
                    !textInput.trim() || ingestFromText.isPending
                  }
                >
                  {ingestFromText.isPending ? (
                    <Spinner size="sm" />
                  ) : (
                    "Parse Names"
                  )}
                </Button>
              </div>
            </Stack>
          )}

          {/* Step 2: Preview */}
          {currentStep === "preview" && sessionData && (
            <Stack gap={4}>
              <h3 className="text-lg font-semibold">Review parsed characters</h3>
              <p className="text-sm text-muted-foreground">
                Review parsed names and edit any that look incorrect. Click a
                name to edit it inline.
              </p>
              <ImportPreviewTable
                entries={sessionData.entries}
                onUpdateEntry={handleUpdateEntry}
                onToggleInclude={handleToggleInclude}
              />
              <WizardNavFooter onBack={goBack} onCancel={handleCancel}>
                <Button onClick={handleValidate} disabled={validateSession.isPending}>
                  {validateSession.isPending ? <Spinner size="sm" /> : "Validate"}
                </Button>
              </WizardNavFooter>
            </Stack>
          )}

          {/* Step 3: Fix Issues */}
          {currentStep === "fix" && sessionData && (
            <Stack gap={4}>
              <h3 className="text-lg font-semibold">Fix issues</h3>
              <p className="text-sm text-muted-foreground">
                Resolve validation issues below. You can exclude entries or edit
                names before confirming.
              </p>
              <ImportPreviewTable
                entries={sessionData.entries}
                onUpdateEntry={handleUpdateEntry}
                onToggleInclude={handleToggleInclude}
              />
              <WizardNavFooter onBack={goBack} onCancel={handleCancel}>
                <Button onClick={goNext}>Continue to Confirm</Button>
              </WizardNavFooter>
            </Stack>
          )}

          {/* Step 4: Confirm */}
          {currentStep === "confirm" && sessionData && (
            <Stack gap={4}>
              <h3 className="text-lg font-semibold">Confirm import</h3>

              {confirmResult ? (
                <ConfirmSummary result={confirmResult} />
              ) : (
                <>
                  <ConfirmPreview entries={sessionData.entries} />
                  <WizardNavFooter onBack={goBack} onCancel={handleCancel}>
                    <Button
                      onClick={handleConfirm}
                      disabled={confirmImport.isPending}
                    >
                      {confirmImport.isPending ? <Spinner size="sm" /> : "Confirm Import"}
                    </Button>
                  </WizardNavFooter>
                </>
              )}
            </Stack>
          )}
        </div>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

/** Shared wizard navigation footer: Back (left) | Cancel + Primary (right). */
function WizardNavFooter({
  onBack,
  onCancel,
  children,
}: {
  onBack: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex justify-between">
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        {children}
      </div>
    </div>
  );
}

function StepIndicator({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="flex items-center gap-2">
      {WIZARD_STEPS.map((step, i) => (
        <div key={step.id} className="flex items-center gap-2">
          {i > 0 && <div className="h-px w-8 bg-border" />}
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              i === currentIndex
                ? "bg-primary text-primary-foreground"
                : i < currentIndex
                  ? "bg-muted text-foreground"
                  : "bg-muted/50 text-muted-foreground"
            }`}
          >
            <span>{i + 1}</span>
            <span>{step.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfirmPreview({ entries }: { entries: CharacterIngestEntry[] }) {
  const included = entries.filter((e) => e.is_included);
  const excluded = entries.filter((e) => !e.is_included);

  return (
    <div className="space-y-3 text-sm">
      <p>
        <strong>{included.length}</strong> characters will be imported.
        {excluded.length > 0 && (
          <>
            {" "}
            <strong>{excluded.length}</strong> excluded.
          </>
        )}
      </p>
      <div className="max-h-48 overflow-y-auto rounded-[var(--radius-md)] border p-3">
        {included.map((entry) => (
          <div key={entry.id} className="flex items-center gap-2 py-1">
            <span>{entry.confirmed_name ?? entry.parsed_name}</span>
            {entry.validation_status && (
              <Badge
                variant={VALIDATION_STATUS_VARIANT[entry.validation_status] ?? "default"}
              >
                {entry.validation_status}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ConfirmSummary({ result }: { result: IngestConfirmResult }) {
  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-4">
        <Badge variant="success">{result.created} created</Badge>
        {result.skipped > 0 && (
          <Badge variant="default">{result.skipped} skipped</Badge>
        )}
        {result.failed > 0 && (
          <Badge variant="danger">{result.failed} failed</Badge>
        )}
      </div>
      <p className="text-muted-foreground">
        Import complete. {result.character_ids.length} characters have been
        created in your project.
      </p>
    </div>
  );
}
