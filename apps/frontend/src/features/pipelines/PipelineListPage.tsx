/**
 * Pipeline admin list page — manage all pipelines (PRD-138).
 *
 * Route: /admin/pipelines
 */

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Modal, useToast } from "@/components/composite";
import { EmptyState } from "@/components/domain";
import { Stack } from "@/components/layout";
import { Badge, Button, Input, LoadingPane } from "@/components/primitives";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { TERMINAL_DIVIDER, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_PANEL, TERMINAL_ROW_HOVER } from "@/lib/ui-classes";
import { cn } from "@/lib/cn";
import { Plus, Settings, Workflow } from "@/tokens/icons";

import { useCreatePipeline, usePipelines } from "./hooks/use-pipelines";
import { TYPO_DATA } from "@/lib/typography-tokens";

export function PipelineListPage() {
  useSetPageTitle("Pipelines", "Manage production pipelines.");

  const navigate = useNavigate();
  const { data: pipelines, isLoading, error } = usePipelines();
  const createPipeline = useCreatePipeline();
  const { addToast } = useToast();

  /* --- modal state --- */
  const [modalOpen, setModalOpen] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  function handleCreate() {
    if (!newCode.trim() || !newName.trim()) return;

    createPipeline.mutate(
      {
        code: newCode.trim(),
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      },
      {
        onSuccess: (created) => {
          setModalOpen(false);
          setNewCode("");
          setNewName("");
          setNewDescription("");
          addToast({ variant: "success", message: `Pipeline "${created.name}" created` });
          navigate({ to: `/admin/pipelines/${created.id}` });
        },
        onError: (err) => {
          addToast({ variant: "error", message: `Failed: ${err.message}` });
        },
      },
    );
  }

  if (isLoading) return <LoadingPane />;

  if (error) {
    return (
      <EmptyState
        icon={<Workflow size={32} />}
        title="Failed to load pipelines"
        description="An error occurred while fetching the pipeline list."
      />
    );
  }

  return (
    <Stack gap={6}>
      {/* Header actions */}
      <div className="flex items-center justify-end">
        <Button
          size="sm"
          icon={<Plus size={16} />}
          onClick={() => setModalOpen(true)}
        >
          New Pipeline
        </Button>
      </div>

      {/* Pipeline list */}
      {!pipelines || pipelines.length === 0 ? (
        <EmptyState
          icon={<Workflow size={32} />}
          title="No pipelines"
          description="Create your first pipeline to define production workflows."
          action={
            <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>
              New Pipeline
            </Button>
          }
        />
      ) : (
        <div className={TERMINAL_PANEL}>
          <div className={TERMINAL_HEADER}>
            <h2 className={TERMINAL_HEADER_TITLE}>
              All Pipelines ({pipelines.length})
            </h2>
          </div>
          <div>
            {pipelines.map((pipeline, index) => (
              <div
                key={pipeline.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate({ to: `/admin/pipelines/${pipeline.id}` })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") navigate({ to: `/admin/pipelines/${pipeline.id}` });
                }}
                className={cn(
                  "flex items-center justify-between px-[var(--spacing-3)] py-[var(--spacing-2)] cursor-pointer",
                  TERMINAL_ROW_HOVER,
                  index < pipelines.length - 1 && TERMINAL_DIVIDER,
                )}
              >
                <div className="flex items-center gap-3">
                  <Settings size={14} className="text-[var(--color-text-muted)] shrink-0" />
                  <div>
                    <div className={TYPO_DATA}>
                      {pipeline.name}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {pipeline.code}
                      {pipeline.description && (
                        <> &mdash; {pipeline.description}</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                    {pipeline.seed_slots.length} slot{pipeline.seed_slots.length !== 1 ? "s" : ""}
                  </span>
                  <Badge variant={pipeline.is_active ? "success" : "default"}>
                    {pipeline.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create pipeline modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setNewCode("");
          setNewName("");
          setNewDescription("");
        }}
        title="New Pipeline"
        size="sm"
      >
        <Stack gap={4}>
          <Input
            label="Pipeline Code"
            placeholder="e.g. standard"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
          />
          <Input
            label="Pipeline Name"
            placeholder="e.g. Standard Pipeline"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Input
            label="Description"
            placeholder="Optional description..."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <Button
            size="sm"
            onClick={handleCreate}
            loading={createPipeline.isPending}
            disabled={!newCode.trim() || !newName.trim()}
          >
            Create Pipeline
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
