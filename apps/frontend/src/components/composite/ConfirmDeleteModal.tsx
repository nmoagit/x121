/**
 * Reusable delete confirmation modal.
 *
 * Provides a standard "Are you sure?" dialog with entity name,
 * customizable warning text, and Cancel / Delete buttons.
 *
 * Extracted from ProjectGroupsTab, ProjectCharactersTab, and
 * CharacterDetailPage which all had near-identical delete modals.
 */

import type { ReactNode } from "react";

import { Stack } from "@/components/layout";
import { Button } from "@/components/primitives";

import { Modal } from "./Modal";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ConfirmDeleteModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Close handler. */
  onClose: () => void;
  /** Title shown in the modal header (e.g. "Delete Character"). */
  title: string;
  /** The name of the entity being deleted (rendered in bold). */
  entityName: string;
  /**
   * Additional warning text after the entity name.
   * @default "This action cannot be undone."
   */
  warningText?: string;
  /** Called when the user confirms deletion. */
  onConfirm: () => void;
  /** Whether the delete mutation is in-flight. */
  loading?: boolean;
  /** Optional extra content rendered above the action buttons. */
  children?: ReactNode;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ConfirmDeleteModal({
  open,
  onClose,
  title,
  entityName,
  warningText = "This action cannot be undone.",
  onConfirm,
  loading,
  children,
}: ConfirmDeleteModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      <Stack gap={4}>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Are you sure you want to delete <strong>{entityName}</strong>? {warningText}
        </p>
        {children}
        <div className="flex gap-[var(--spacing-2)] justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            Delete
          </Button>
        </div>
      </Stack>
    </Modal>
  );
}
