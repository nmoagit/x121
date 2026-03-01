/**
 * Bulk character onboarding wizard page (PRD-67).
 *
 * Lists existing onboarding sessions for a project, allows creating
 * new sessions, and renders the OnboardingWizard for the selected session.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Badge, Button, Input, LoadingPane, SelectableRow } from "@/components/primitives";
import { EmptyState } from "@/components/domain";

import {
  OnboardingWizard,
  useAbandonSession,
  useAdvanceStep,
  useCompleteSession,
  useCreateSession,
  useGoBack,
  useOnboardingSession,
  useOnboardingSessions,
  useUpdateStepData,
} from "@/features/onboarding-wizard";
import { STEP_LABELS } from "@/features/onboarding-wizard";
import type { OnboardingSession, OnboardingStepNumber } from "@/features/onboarding-wizard";

/* --------------------------------------------------------------------------
   Session list row
   -------------------------------------------------------------------------- */

function SessionRow({
  session,
  isSelected,
  onSelect,
}: {
  session: OnboardingSession;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const stepLabel =
    STEP_LABELS[session.current_step as OnboardingStepNumber] ??
    `Step ${session.current_step}`;

  return (
    <SelectableRow isSelected={isSelected} onSelect={onSelect}>
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          Session #{session.id}
        </span>
        <Badge
          variant={
            session.status === "completed"
              ? "success"
              : session.status === "abandoned"
                ? "danger"
                : "default"
          }
          size="sm"
        >
          {session.status}
        </Badge>
      </div>
      <span className="text-xs text-[var(--color-text-muted)]">{stepLabel}</span>
    </SelectableRow>
  );
}

/* --------------------------------------------------------------------------
   Main page
   -------------------------------------------------------------------------- */

export function OnboardingWizardPage() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [projectInput, setProjectInput] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const { data: sessions, isLoading: sessionsLoading } = useOnboardingSessions(
    projectId ?? 0,
  );
  const { data: session, isLoading: sessionLoading } = useOnboardingSession(
    selectedSessionId ?? 0,
  );

  const createSession = useCreateSession();
  const advanceStep = useAdvanceStep();
  const goBack = useGoBack();
  const updateStepData = useUpdateStepData();
  const abandonSession = useAbandonSession();
  const completeSession = useCompleteSession();

  const isMutating =
    advanceStep.isPending ||
    goBack.isPending ||
    updateStepData.isPending ||
    abandonSession.isPending ||
    completeSession.isPending;

  const handleLoadProject = () => {
    const parsed = Number.parseInt(projectInput, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setProjectId(parsed);
      setSelectedSessionId(null);
    }
  };

  const handleCreateSession = () => {
    if (!projectId) return;
    createSession.mutate(
      { project_id: projectId },
      { onSuccess: (data) => setSelectedSessionId(data.id) },
    );
  };

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Character Onboarding Wizard"
          description="Bulk character onboarding with step-by-step guidance for upload, metadata, and variant generation."
        />

        {/* Project selector */}
        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Input
              label="Project ID"
              type="number"
              value={projectInput}
              onChange={(e) => setProjectInput(e.target.value)}
              placeholder="Enter project ID"
              min="1"
            />
          </div>
          <Button
            variant="primary"
            onClick={handleLoadProject}
            disabled={!projectInput.trim()}
          >
            Load
          </Button>
        </Stack>

        {/* Sessions list */}
        {projectId !== null && sessionsLoading && <LoadingPane />}

        {projectId !== null && !sessionsLoading && (
          <Stack gap={4}>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-medium text-[var(--color-text-primary)]">
                Sessions for Project {projectId}
              </h2>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateSession}
                disabled={createSession.isPending}
              >
                {createSession.isPending ? "Creating..." : "New Session"}
              </Button>
            </div>

            {sessions && sessions.length > 0 ? (
              <Stack gap={2}>
                {sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    isSelected={s.id === selectedSessionId}
                    onSelect={() => setSelectedSessionId(s.id)}
                  />
                ))}
              </Stack>
            ) : (
              <EmptyState
                title="No Sessions"
                description="Create a new onboarding session to get started."
              />
            )}
          </Stack>
        )}

        {/* Active wizard */}
        {selectedSessionId !== null && sessionLoading && <LoadingPane />}

        {session && (
          <OnboardingWizard
            session={session}
            onAdvance={() => advanceStep.mutate(session.id)}
            onGoBack={() => goBack.mutate(session.id)}
            onUpdateStepData={(data) =>
              updateStepData.mutate({
                sessionId: session.id,
                stepData: { step_data: data },
              })
            }
            onAbandon={() => abandonSession.mutate(session.id)}
            onComplete={() => completeSession.mutate(session.id)}
            isLoading={isMutating}
          />
        )}
      </Stack>
    </div>
  );
}
