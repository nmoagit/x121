/**
 * Dialog for creating a new shareable preview link (PRD-84).
 *
 * Shows scope selection, expiry presets, optional max views and password.
 * After creation, displays the generated URL with a copy button.
 */

import { useCallback, useState } from "react";

import { Modal } from "@/components/composite";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { Stack } from "@/components/layout";
import { Button, Input, Select } from "@/components/primitives";
import { AlertTriangle, Copy } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useCreateLink } from "./hooks/use-shared-links";
import { EXPIRY_PRESETS, SCOPE_TYPE_LABELS } from "./types";
import type { CreateLinkInput, LinkScopeType } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SCOPE_OPTIONS = (
  Object.entries(SCOPE_TYPE_LABELS) as [LinkScopeType, string][]
).map(([value, label]) => ({ value, label }));

const EXPIRY_OPTIONS = EXPIRY_PRESETS.map((p) => ({
  value: String(p.hours),
  label: p.label,
}));

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CreateLinkDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill scope type and id when creating from a specific entity. */
  defaultScopeType?: LinkScopeType;
  defaultScopeId?: number;
}

export function CreateLinkDialog({
  open,
  onClose,
  defaultScopeType,
  defaultScopeId,
}: CreateLinkDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title="Create Shareable Link" size="lg">
      <CreateLinkForm
        onClose={onClose}
        defaultScopeType={defaultScopeType}
        defaultScopeId={defaultScopeId}
      />
    </Modal>
  );
}

/* --------------------------------------------------------------------------
   Internal form
   -------------------------------------------------------------------------- */

interface CreateLinkFormProps {
  onClose: () => void;
  defaultScopeType?: LinkScopeType;
  defaultScopeId?: number;
}

function CreateLinkForm({
  onClose,
  defaultScopeType,
  defaultScopeId,
}: CreateLinkFormProps) {
  const [scopeType, setScopeType] = useState<string>(
    defaultScopeType ?? "segment",
  );
  const [scopeId, setScopeId] = useState(
    defaultScopeId ? String(defaultScopeId) : "",
  );
  const [expiryHours, setExpiryHours] = useState(
    String(EXPIRY_PRESETS[1].hours),
  );
  const [maxViews, setMaxViews] = useState("");
  const [password, setPassword] = useState("");

  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const { copied, copy } = useCopyToClipboard();

  const createMutation = useCreateLink();

  const handleCreate = useCallback(() => {
    const parsedScopeId = Number(scopeId);
    if (!scopeId.trim() || Number.isNaN(parsedScopeId)) return;

    const input: CreateLinkInput = {
      scope_type: scopeType as LinkScopeType,
      scope_id: parsedScopeId,
      expiry_hours: Number(expiryHours),
      max_views: maxViews.trim() ? Number(maxViews) : undefined,
      password: password.trim() || undefined,
    };

    createMutation.mutate(input, {
      onSuccess: (response) => {
        setCreatedUrl(response.url);
      },
    });
  }, [scopeType, scopeId, expiryHours, maxViews, password, createMutation]);

  const handleCopy = useCallback(() => {
    if (!createdUrl) return;
    copy(createdUrl);
  }, [createdUrl, copy]);

  /* -- Success state: show URL ------------------------------------------ */
  if (createdUrl) {
    return (
      <Stack gap={4}>
        <div className="flex items-start gap-3">
          <AlertTriangle
            size={iconSizes.lg}
            className="text-[var(--color-action-warning)] shrink-0 mt-0.5"
            aria-hidden="true"
          />
          <p className="text-sm text-[var(--color-text-secondary)]">
            Copy this link now. The full URL will{" "}
            <strong>not</strong> be shown again.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 text-sm font-mono bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] rounded-[var(--radius-md)] break-all">
            {createdUrl}
          </code>
          <Button
            variant="secondary"
            size="sm"
            icon={<Copy size={iconSizes.sm} />}
            onClick={handleCopy}
            aria-label="Copy link"
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

  /* -- Form state ------------------------------------------------------- */
  const canSubmit =
    scopeId.trim().length > 0 && !Number.isNaN(Number(scopeId));

  return (
    <Stack gap={4}>
      <Select
        label="Scope Type"
        options={SCOPE_OPTIONS}
        value={scopeType}
        onChange={setScopeType}
      />

      <Input
        label="Scope ID"
        type="number"
        value={scopeId}
        onChange={(e) => setScopeId(e.target.value)}
        placeholder="Enter the entity ID"
      />

      <Select
        label="Expires In"
        options={EXPIRY_OPTIONS}
        value={expiryHours}
        onChange={setExpiryHours}
      />

      <Input
        label="Max Views (optional)"
        type="number"
        value={maxViews}
        onChange={(e) => setMaxViews(e.target.value)}
        placeholder="Unlimited"
        helperText="Leave blank for unlimited views."
      />

      <Input
        label="Password (optional)"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Protect with a password"
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
          disabled={!canSubmit}
        >
          Create Link
        </Button>
      </div>
    </Stack>
  );
}
