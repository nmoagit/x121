/**
 * MockEndpointManager -- create and manage mock webhook endpoints (PRD-99).
 *
 * Provides a creation form, a list of existing mocks with copy-URL and
 * delete actions, and expandable captured payloads per mock.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input ,  ContextLoader } from "@/components/primitives";
import { AlertTriangle, Plus } from "@/tokens/icons";

import { useCreateMock, useDeleteMock, useMockEndpoints } from "./hooks/use-webhook-testing";
import { MockRow } from "./MockRow";
import type { MockEndpoint } from "./types";

/* --------------------------------------------------------------------------
   Create form sub-component
   -------------------------------------------------------------------------- */

interface CreateFormProps {
  onClose: () => void;
}

function CreateForm({ onClose }: CreateFormProps) {
  const [name, setName] = useState("");
  const [retentionHours, setRetentionHours] = useState("24");
  const createMutation = useCreateMock();

  const handleCreate = useCallback(() => {
    if (!name.trim()) return;

    createMutation.mutate(
      {
        name: name.trim(),
        retention_hours: Number(retentionHours) || 24,
      },
      { onSuccess: () => onClose() },
    );
  }, [name, retentionHours, createMutation, onClose]);

  return (
    <Stack gap={4}>
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My Mock Endpoint"
        data-testid="mock-name-input"
      />
      <Input
        label="Retention (hours)"
        type="number"
        min="1"
        value={retentionHours}
        onChange={(e) => setRetentionHours(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleCreate}
          loading={createMutation.isPending}
          disabled={!name.trim()}
          data-testid="create-mock-submit"
        >
          Create Mock
        </Button>
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function MockEndpointManager() {
  const { data: mocksPage, isLoading } = useMockEndpoints();
  const mocks = mocksPage?.items ?? [];
  const deleteMutation = useDeleteMock();
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MockEndpoint | null>(null);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }, [deleteTarget, deleteMutation]);

  if (isLoading) {
    return (
      <div data-testid="mocks-loading" className="flex items-center justify-center py-12">
        <ContextLoader size={48} />
      </div>
    );
  }

  return (
    <div data-testid="mock-endpoint-manager">
      <Stack gap={4}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">
            Mock Endpoints
          </h3>
          <Button
            variant="primary"
            size="sm"
            icon={<Plus size={16} />}
            onClick={() => setShowCreate(true)}
            data-testid="create-mock-btn"
          >
            Create Mock
          </Button>
        </div>

        {/* Mock list */}
        {mocks.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-default)] p-8 text-center text-sm text-[var(--color-text-secondary)]">
            No mock endpoints yet. Create one to start capturing payloads.
          </div>
        ) : (
          <Stack gap={3}>
            {mocks.map((m) => (
              <MockRow key={m.id} mock={m} onDelete={setDeleteTarget} />
            ))}
          </Stack>
        )}
      </Stack>

      {/* Create modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Mock Endpoint"
        size="sm"
      >
        <CreateForm onClose={() => setShowCreate(false)} />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Mock Endpoint"
        size="sm"
      >
        {deleteTarget && (
          <Stack gap={4}>
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={24}
                className="mt-0.5 shrink-0 text-[var(--color-action-danger)]"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--color-text-secondary)]">
                Are you sure you want to delete{" "}
                <strong className="text-[var(--color-text-primary)]">
                  {deleteTarget.name}
                </strong>
                ? All captured payloads will be removed.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                loading={deleteMutation.isPending}
              >
                Delete Mock
              </Button>
            </div>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
