import { useCallback, useEffect, useRef, useState } from "react";

import { ChevronDown, ChevronRight } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CollapsibleNotesProps {
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
  saving?: boolean;
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const DEBOUNCE_MS = 1500;
const MIN_ROWS = 2;
const MAX_ROWS = 10;

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CollapsibleNotes({ value, onChange, onSave, saving }: CollapsibleNotesProps) {
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestValueRef = useRef(value);

  // Keep the ref in sync so the blur/debounce callbacks see the latest value.
  latestValueRef.current = value;

  const scheduleSave = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSave(text);
        debounceRef.current = null;
      }, DEBOUNCE_MS);
    },
    [onSave],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      onChange(next);
      scheduleSave(next);
    },
    [onChange, scheduleSave],
  );

  const handleBlur = useCallback(() => {
    // Flush any pending debounce and save immediately.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    onSave(latestValueRef.current);
  }, [onSave]);

  // On unmount: flush any pending save.
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
        // Fire the pending save with the latest value
        onSaveRef.current(latestValueRef.current);
      }
    };
  }, []);

  // Compute rows from content (count newlines, clamp between min/max).
  const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, (value.match(/\n/g)?.length ?? 0) + 1));

  return (
    <div className="flex flex-col gap-1">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors w-fit"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span>Notes</span>
        {saving && <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">saving...</span>}
      </button>

      {/* Expanded textarea */}
      {open && (
        <textarea
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          rows={rows}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[#0d1117] px-3 py-2 font-mono text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-action-primary)] focus:outline-none resize-none"
          placeholder="Add notes..."
        />
      )}
    </div>
  );
}
