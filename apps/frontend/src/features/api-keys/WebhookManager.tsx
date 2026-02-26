/**
 * Admin page for managing webhooks (PRD-12).
 *
 * Lists webhooks with CRUD operations, test delivery trigger,
 * and links to delivery history.
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Input, Spinner } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { AlertTriangle, Plus, Trash2 } from "@/tokens/icons";

import {
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhooks,
} from "./hooks/use-api-keys";
import type { CreateWebhookInput, Webhook } from "./types";

/* --------------------------------------------------------------------------
   Create form
   -------------------------------------------------------------------------- */

interface CreateFormProps {
  onClose: () => void;
}

function CreateForm({ onClose }: CreateFormProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [eventTypes, setEventTypes] = useState("");
  const createMutation = useCreateWebhook();

  const handleCreate = useCallback(() => {
    if (!name.trim() || !url.trim()) return;

    const input: CreateWebhookInput = {
      name: name.trim(),
      url: url.trim(),
      secret: secret.trim() || undefined,
      event_types: eventTypes
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };

    createMutation.mutate(input, { onSuccess: () => onClose() });
  }, [name, url, secret, eventTypes, createMutation, onClose]);

  return (
    <Stack gap={4}>
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My Webhook"
      />
      <Input
        label="URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://example.com/webhook"
      />
      <Input
        label="Secret (optional)"
        value={secret}
        onChange={(e) => setSecret(e.target.value)}
        placeholder="HMAC signing secret"
      />
      <Input
        label="Event Types (comma-separated)"
        value={eventTypes}
        onChange={(e) => setEventTypes(e.target.value)}
        placeholder="project.created, job.completed"
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
          disabled={!name.trim() || !url.trim()}
        >
          Create Webhook
        </Button>
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Webhook row
   -------------------------------------------------------------------------- */

interface WebhookRowProps {
  webhook: Webhook;
  onDelete: (w: Webhook) => void;
  onViewDeliveries: (w: Webhook) => void;
}

function WebhookRow({ webhook, onDelete, onViewDeliveries }: WebhookRowProps) {
  const testMutation = useTestWebhook();

  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {webhook.name}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)] max-w-xs truncate">
        {webhook.url}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(webhook.event_types as string[]).length > 0 ? (
            (webhook.event_types as string[]).map((et) => (
              <Badge key={et} variant="default" size="sm">
                {et}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-[var(--color-text-muted)]">All events</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={webhook.is_enabled ? "success" : "default"} size="sm">
          {webhook.is_enabled ? "Enabled" : "Disabled"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
        {webhook.last_triggered_at
          ? formatDateTime(webhook.last_triggered_at)
          : "Never"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => testMutation.mutate(webhook.id)}
            loading={testMutation.isPending}
          >
            Test
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewDeliveries(webhook)}
          >
            Deliveries
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onDelete(webhook)}
            icon={<Trash2 size={16} />}
            aria-label={`Delete ${webhook.name}`}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export interface WebhookManagerProps {
  onViewDeliveries?: (webhook: Webhook) => void;
}

export function WebhookManager({ onViewDeliveries }: WebhookManagerProps) {
  const { data: webhooks, isLoading } = useWebhooks();
  const deleteMutation = useDeleteWebhook();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Webhook | null>(null);

  const handleConfirmDelete = useCallback(() => {
    if (!deleteTarget) return;
    deleteMutation.mutate(deleteTarget.id, {
      onSuccess: () => setDeleteTarget(null),
    });
  }, [deleteTarget, deleteMutation]);

  const handleViewDeliveries = useCallback(
    (webhook: Webhook) => {
      onViewDeliveries?.(webhook);
    },
    [onViewDeliveries],
  );

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Webhooks
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Manage outbound webhook subscriptions.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={20} />}
            onClick={() => setShowCreate(true)}
          >
            Create Webhook
          </Button>
        </div>

        {/* Webhooks table */}
        <Card elevation="sm" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">URL</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Events</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Last Triggered</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!webhooks || webhooks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                    >
                      No webhooks configured. Click "Create Webhook" to add one.
                    </td>
                  </tr>
                ) : (
                  webhooks.map((wh) => (
                    <WebhookRow
                      key={wh.id}
                      webhook={wh}
                      onDelete={setDeleteTarget}
                      onViewDeliveries={handleViewDeliveries}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Stack>

      {/* Create modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Webhook"
        size="md"
      >
        <CreateForm onClose={() => setShowCreate(false)} />
      </Modal>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete Webhook"
        size="sm"
      >
        {deleteTarget && (
          <Stack gap={4}>
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={24}
                className="text-[var(--color-action-danger)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--color-text-secondary)]">
                Are you sure you want to delete{" "}
                <strong className="text-[var(--color-text-primary)]">{deleteTarget.name}</strong>?
                All delivery history will be removed.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmDelete}
                loading={deleteMutation.isPending}
              >
                Delete Webhook
              </Button>
            </div>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
