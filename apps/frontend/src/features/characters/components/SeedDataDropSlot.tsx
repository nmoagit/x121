/**
 * A drop zone slot for uploading a single file (image or JSON).
 *
 * Used by CharacterSeedDataModal for each seed image / metadata slot.
 */

import { useRef, useState } from "react";

import { Spinner } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { Upload } from "@/tokens/icons";

interface SeedDataDropSlotProps {
  /** MIME accept string for the hidden file input. */
  accept: string;
  /** Label shown inside the drop zone. */
  label: string;
  /** Whether an upload is in progress. */
  loading?: boolean;
  /** Called when a file is selected or dropped. */
  onFile: (file: File) => void;
}

export function SeedDataDropSlot({ accept, label, loading, onFile }: SeedDataDropSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    e.target.value = "";
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.click(); }}
      role="button"
      tabIndex={0}
      className={cn(
        "flex flex-col items-center justify-center gap-[var(--spacing-2)]",
        "cursor-pointer rounded-[var(--radius-md)] border-2 border-dashed p-[var(--spacing-4)]",
        "text-[var(--color-text-muted)] text-sm transition-colors",
        dragOver
          ? "border-[var(--color-action-primary)] bg-[var(--color-action-primary-hover)]"
          : "border-[var(--color-border-secondary)] hover:border-[var(--color-border-primary)]",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleFileChange}
      />
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <>
          <Upload size={20} />
          <span>{label}</span>
          <span className="text-xs">Drop file or click to upload</span>
        </>
      )}
    </div>
  );
}
