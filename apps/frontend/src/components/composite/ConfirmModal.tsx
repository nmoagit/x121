/**
 * Generic confirmation modal for destructive or important actions.
 *
 * Replaces browser `window.confirm()` with a styled modal that matches
 * the design system. Supports customizable title, message, button labels,
 * and button variants.
 *
 * For delete-specific confirmations, prefer `ConfirmDeleteModal` which
 * provides a more opinionated UX with entity name and danger styling.
 */

import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";
import type { ReactNode } from "react";

import { Modal } from "./Modal";

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Body content — can be a string or JSX. */
  children: ReactNode;
  /** Called when the user confirms. */
  onConfirm: () => void;
  /** Confirm button label. @default "Confirm" */
  confirmLabel?: string;
  /** Confirm button variant. @default "danger" */
  confirmVariant?: "primary" | "danger" | "secondary";
  /** Cancel button label. @default "Cancel" */
  cancelLabel?: string;
  /** Whether the confirm action is in-flight. */
  loading?: boolean;
}

export function ConfirmModal({
  open,
  onClose,
  title,
  children,
  onConfirm,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  cancelLabel = "Cancel",
  loading,
}: ConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <Stack gap={4}>
        <div className="text-sm text-[var(--color-text-secondary)]">
          {children}
        </div>
        <div className="flex gap-[var(--spacing-2)] justify-end">
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
