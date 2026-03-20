import { Modal } from "@/components/composite/Modal";
import { Button } from "@/components/primitives/Button";
import type { SceneVideoVersion } from "./types";

interface ResumeFromDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  clip: SceneVideoVersion | null;
  clipsToDiscard: number;
  isSubmitting?: boolean;
}

export function ResumeFromDialog({
  isOpen,
  onClose,
  onConfirm,
  clip,
  clipsToDiscard,
  isSubmitting,
}: ResumeFromDialogProps) {
  if (!clip) return null;

  return (
    <Modal open={isOpen} onClose={onClose} title="Resume Generation" size="lg">
      <div className="flex flex-col gap-4">
        <p className="font-mono text-xs text-[var(--color-text-secondary)]">
          This will discard <strong className="text-orange-400">{clipsToDiscard}</strong> clip(s) after version{" "}
          <strong className="text-cyan-400">v{clip.version_number}</strong> and restart generation from this point.
        </p>
        <p className="font-mono text-xs text-[var(--color-text-muted)]">
          Discarded clips are soft-deleted and can be restored if needed.
        </p>
        <div className="flex justify-end gap-2 pt-1 border-t border-[var(--color-border-default)]">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirm}
            disabled={isSubmitting}
            loading={isSubmitting}
          >
            Resume Generation
          </Button>
        </div>
      </div>
    </Modal>
  );
}
