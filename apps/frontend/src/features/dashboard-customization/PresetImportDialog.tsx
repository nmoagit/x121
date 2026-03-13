/**
 * PresetImportDialog -- dialog for importing a shared dashboard preset
 * by share token or link (PRD-89).
 */

import { useState } from "react";

import { Button, Input } from "@/components/primitives";
import { Modal } from "@/components/composite";
import { Download } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Extract the share token from a full URL or plain token string. */
function extractShareToken(input: string): string {
  const trimmed = input.trim();

  // If input looks like a URL, extract the last path segment
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    return parts[parts.length - 1] ?? trimmed;
  }

  return trimmed;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface PresetImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (shareToken: string) => void;
  isImporting?: boolean;
}

export function PresetImportDialog({
  open,
  onClose,
  onImport,
  isImporting = false,
}: PresetImportDialogProps) {
  const [tokenInput, setTokenInput] = useState("");

  const handleImport = () => {
    const token = extractShareToken(tokenInput);
    if (!token) return;
    onImport(token);
    setTokenInput("");
  };

  const handleClose = () => {
    setTokenInput("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Shared Preset" size="md">
      <div data-testid="preset-import-dialog" className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-text-secondary)]">
          Paste a share link or token to import a dashboard preset from another user.
        </p>

        <Input
          label="Share token or link"
          placeholder="Enter share token or paste link..."
          value={tokenInput}
          onChange={(e) => setTokenInput(e.target.value)}
          disabled={isImporting}
        />

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleClose}
            disabled={isImporting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Download size={16} aria-hidden="true" />}
            onClick={handleImport}
            loading={isImporting}
            disabled={!tokenInput.trim() || isImporting}
          >
            Import
          </Button>
        </div>
      </div>
    </Modal>
  );
}
