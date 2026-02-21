/**
 * Admin page for managing API keys (PRD-12).
 *
 * Lists API keys, provides creation (shows plaintext once), rotation,
 * revocation, and settings editing. All operations are admin-only.
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Input, Spinner } from "@/components/primitives";
import { formatDateTime } from "@/lib/format";
import { AlertTriangle, Copy, Plus, RefreshCw } from "@/tokens/icons";

import {
  useApiKeys,
  useApiKeyScopes,
  useCreateApiKey,
  useRevokeApiKey,
  useRotateApiKey,
} from "./hooks/use-api-keys";
import type { ApiKeyCreatedResponse, ApiKeyListItem, CreateApiKeyInput } from "./types";

/* --------------------------------------------------------------------------
   Create form
   -------------------------------------------------------------------------- */

interface CreateFormProps {
  onClose: () => void;
  onCreated: (response: ApiKeyCreatedResponse) => void;
}

function CreateForm({ onClose, onCreated }: CreateFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState("read_only");
  const { data: scopes } = useApiKeyScopes();
  const createMutation = useCreateApiKey();

  const handleCreate = useCallback(() => {
    if (!name.trim()) return;

    const input: CreateApiKeyInput = {
      name: name.trim(),
      description: description.trim() || undefined,
      scope,
    };

    createMutation.mutate(input, {
      onSuccess: (response) => {
        onCreated(response);
        onClose();
      },
    });
  }, [name, description, scope, createMutation, onCreated, onClose]);

  return (
    <Stack gap={4}>
      <Input
        label="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="My API key"
      />
      <Input
        label="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Used for CI/CD pipeline"
      />
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="scope-select"
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          Scope
        </label>
        <select
          id="scope-select"
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)]"
        >
          {scopes?.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} {s.description ? `- ${s.description}` : ""}
            </option>
          )) ?? <option value="read_only">read_only</option>}
        </select>
      </div>
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
        >
          Create API Key
        </Button>
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Key reveal modal
   -------------------------------------------------------------------------- */

interface KeyRevealProps {
  response: ApiKeyCreatedResponse;
  onClose: () => void;
}

function KeyReveal({ response, onClose }: KeyRevealProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(response.plaintext_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [response.plaintext_key]);

  return (
    <Stack gap={4}>
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={24}
          className="text-[var(--color-action-warning)] shrink-0 mt-0.5"
          aria-hidden="true"
        />
        <p className="text-sm text-[var(--color-text-secondary)]">
          Copy this key now. It will <strong>not</strong> be shown again.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <code className="flex-1 px-3 py-2 text-sm font-mono bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] break-all">
          {response.plaintext_key}
        </code>
        <Button
          variant="secondary"
          size="sm"
          icon={<Copy size={16} />}
          onClick={handleCopy}
          aria-label="Copy key"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Key row
   -------------------------------------------------------------------------- */

interface KeyRowProps {
  apiKey: ApiKeyListItem;
  onRotate: (key: ApiKeyListItem) => void;
  onRevoke: (key: ApiKeyListItem) => void;
}

function KeyRow({ apiKey, onRotate, onRevoke }: KeyRowProps) {
  const isRevoked = apiKey.revoked_at !== null;

  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {apiKey.name}
          </span>
          {apiKey.description && (
            <span className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {apiKey.description}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <code className="text-sm font-mono text-[var(--color-text-secondary)]">
          {apiKey.key_prefix}...
        </code>
      </td>
      <td className="px-4 py-3">
        <Badge variant="info" size="sm">
          {apiKey.scope_name}
        </Badge>
      </td>
      <td className="px-4 py-3">
        {isRevoked ? (
          <Badge variant="danger" size="sm">Revoked</Badge>
        ) : apiKey.is_active ? (
          <Badge variant="success" size="sm">Active</Badge>
        ) : (
          <Badge variant="default" size="sm">Inactive</Badge>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-[var(--color-text-muted)]">
        {apiKey.last_used_at ? formatDateTime(apiKey.last_used_at) : "Never"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {!isRevoked && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRotate(apiKey)}
                icon={<RefreshCw size={16} />}
                aria-label={`Rotate ${apiKey.name}`}
              >
                Rotate
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => onRevoke(apiKey)}
                aria-label={`Revoke ${apiKey.name}`}
              >
                Revoke
              </Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ApiKeyManager() {
  const { data: keys, isLoading } = useApiKeys();
  const rotateMutation = useRotateApiKey();
  const revokeMutation = useRevokeApiKey();

  const [showCreate, setShowCreate] = useState(false);
  const [createdKey, setCreatedKey] = useState<ApiKeyCreatedResponse | null>(null);
  const [rotateTarget, setRotateTarget] = useState<ApiKeyListItem | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyListItem | null>(null);

  const handleConfirmRotate = useCallback(() => {
    if (!rotateTarget) return;
    rotateMutation.mutate(rotateTarget.id, {
      onSuccess: (response) => {
        setRotateTarget(null);
        setCreatedKey(response);
      },
    });
  }, [rotateTarget, rotateMutation]);

  const handleConfirmRevoke = useCallback(() => {
    if (!revokeTarget) return;
    revokeMutation.mutate(revokeTarget.id, {
      onSuccess: () => setRevokeTarget(null),
    });
  }, [revokeTarget, revokeMutation]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-surface-primary)] p-[var(--spacing-6)]">
      <Stack gap={6}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              API Keys
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Manage API keys for external integrations.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={20} />}
            onClick={() => setShowCreate(true)}
          >
            Create API Key
          </Button>
        </div>

        {/* Keys table */}
        <Card elevation="sm" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Prefix</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Scope</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Last Used</th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {!keys || keys.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                    >
                      No API keys created. Click "Create API Key" to add one.
                    </td>
                  </tr>
                ) : (
                  keys.map((key) => (
                    <KeyRow
                      key={key.id}
                      apiKey={key}
                      onRotate={setRotateTarget}
                      onRevoke={setRevokeTarget}
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
        title="Create API Key"
        size="md"
      >
        <CreateForm
          onClose={() => setShowCreate(false)}
          onCreated={setCreatedKey}
        />
      </Modal>

      {/* Key reveal modal */}
      <Modal
        open={createdKey !== null}
        onClose={() => setCreatedKey(null)}
        title="API Key Created"
        size="md"
      >
        {createdKey && (
          <KeyReveal response={createdKey} onClose={() => setCreatedKey(null)} />
        )}
      </Modal>

      {/* Rotate confirmation */}
      <Modal
        open={rotateTarget !== null}
        onClose={() => setRotateTarget(null)}
        title="Rotate API Key"
        size="sm"
      >
        {rotateTarget && (
          <Stack gap={4}>
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={24}
                className="text-[var(--color-action-warning)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--color-text-secondary)]">
                Rotating <strong className="text-[var(--color-text-primary)]">{rotateTarget.name}</strong> will
                replace the current key with a new one. Any integration using the old key will stop working.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRotateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleConfirmRotate}
                loading={rotateMutation.isPending}
              >
                Rotate Key
              </Button>
            </div>
          </Stack>
        )}
      </Modal>

      {/* Revoke confirmation */}
      <Modal
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title="Revoke API Key"
        size="sm"
      >
        {revokeTarget && (
          <Stack gap={4}>
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={24}
                className="text-[var(--color-action-danger)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--color-text-secondary)]">
                Revoking <strong className="text-[var(--color-text-primary)]">{revokeTarget.name}</strong> will
                immediately disable this key. This cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setRevokeTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmRevoke}
                loading={revokeMutation.isPending}
              >
                Revoke Key
              </Button>
            </div>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
