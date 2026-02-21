/**
 * Quick rejection category selection dialog (PRD-35).
 *
 * Appears when a reviewer presses the reject key. Provides structured
 * rejection categories for fast, consistent feedback. Optional text
 * comment can be added for specific details.
 */

import { useCallback, useState } from "react";

import { useRejectionCategories } from "./hooks/use-review";
import type { RejectionCategory } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface RejectionDialogProps {
  /** Whether the dialog is currently open. */
  isOpen: boolean;
  /** Called when the dialog is dismissed without selecting a category. */
  onClose: () => void;
  /** Called when a rejection is submitted with category and optional comment. */
  onSubmit: (categoryId: number | undefined, comment: string | undefined) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RejectionDialog({
  isOpen,
  onClose,
  onSubmit,
}: RejectionDialogProps) {
  const { data: categories, isPending } = useRejectionCategories();
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>(
    undefined,
  );
  const [comment, setComment] = useState("");

  const handleSubmit = useCallback(() => {
    onSubmit(selectedCategory, comment.trim() || undefined);
    setSelectedCategory(undefined);
    setComment("");
  }, [selectedCategory, comment, onSubmit]);

  const handleClose = useCallback(() => {
    setSelectedCategory(undefined);
    setComment("");
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-label="Rejection reason"
    >
      <div className="w-full max-w-md rounded-lg bg-[var(--color-surface-primary)] p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-text-primary)]">
          Select Rejection Reason
        </h2>

        {isPending ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            Loading categories...
          </p>
        ) : (
          <div className="mb-4 grid grid-cols-2 gap-2">
            {categories?.map((cat: RejectionCategory) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  selectedCategory === cat.id
                    ? "border-red-500 bg-red-500/10 text-red-400"
                    : "border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]"
                }`}
                aria-label={cat.name}
              >
                <span className="block font-medium">
                  {cat.name.replace(/_/g, " ")}
                </span>
                {cat.description && (
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    {cat.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Optional comment */}
        <div className="mb-4">
          <label
            htmlFor="rejection-comment"
            className="mb-1 block text-sm text-[var(--color-text-muted)]"
          >
            Comment (optional)
          </label>
          <textarea
            id="rejection-comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Additional details..."
            rows={2}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-md px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}
