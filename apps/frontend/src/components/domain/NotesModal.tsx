/**
 * Notes button + modal — opens a full-size modal for editing notes.
 *
 * Shows a compact button with note preview. Clicking opens a modal with
 * a large textarea. Saves on close and debounced while typing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { Modal } from "@/components/composite";
import { Button } from "@/components/primitives";
import { FileText } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface NotesModalProps {
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
  saving?: boolean;
  /** Title shown in the modal header. */
  title?: string;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 1500;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function NotesModal({ value, onChange, onSave, saving, title }: NotesModalProps) {
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  const latestRef = useRef(value);

  onSaveRef.current = onSave;
  latestRef.current = value;

  const scheduleSave = useCallback((text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSaveRef.current(text);
      debounceRef.current = null;
    }, DEBOUNCE_MS);
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      onChange(next);
      scheduleSave(next);
    },
    [onChange, scheduleSave],
  );

  const handleClose = useCallback(() => {
    // Flush any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    // Save on close
    onSaveRef.current(latestRef.current);
    setOpen(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        onSaveRef.current(latestRef.current);
      }
    };
  }, []);

  const hasContent = value.trim().length > 0;
  const preview = hasContent
    ? value.length > 60 ? value.slice(0, 60) + "…" : value
    : null;

  return (
    <>
      {/* Compact trigger button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors w-fit"
      >
        <FileText size={12} />
        <span>Notes</span>
        {saving && <span className="text-[10px]">saving...</span>}
        {preview && (
          <span className="text-[10px] text-[var(--color-text-muted)] truncate max-w-48">
            — {preview}
          </span>
        )}
      </button>

      {/* Full modal */}
      <Modal
        open={open}
        onClose={handleClose}
        title={title ? `Notes — ${title}` : "Notes"}
        size="lg"
      >
        <textarea
          value={value}
          onChange={handleChange}
          rows={16}
          autoFocus
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-surface-primary)] px-4 py-3 font-mono text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-action-primary)] focus:outline-none resize-y min-h-[200px]"
          placeholder="Add notes..."
        />
        <div className="flex items-center justify-between mt-3">
          <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
            {saving ? "Saving..." : "Auto-saves while typing"}
          </span>
          <Button size="sm" onClick={handleClose}>
            Done
          </Button>
        </div>
      </Modal>
    </>
  );
}
