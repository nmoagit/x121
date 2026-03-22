/**
 * Simple array editor that renders values as removable chips with an inline text input.
 *
 * Unlike the domain TagInput (which does API calls for tag autocomplete), this is
 * a pure local-state component for editing string arrays in metadata fields.
 */

import { useCallback, useId, useRef, useState } from "react";

import { RemovableChip } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { CHIP_CONTAINER } from "@/lib/ui-classes";

interface ChipInputProps {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function ChipInput({
  label,
  values,
  onChange,
  placeholder = "Add item...",
}: ChipInputProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  const addValue = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed) return;
      // Avoid exact duplicates
      if (values.includes(trimmed)) {
        setInput("");
        return;
      }
      onChange([...values, trimmed]);
      setInput("");
    },
    [values, onChange],
  );

  const removeValue = useCallback(
    (index: number) => {
      onChange(values.filter((_, i) => i !== index));
    },
    [values, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addValue(input);
      } else if (e.key === "Backspace" && input === "" && values.length > 0) {
        removeValue(values.length - 1);
      }
    },
    [input, values, addValue, removeValue],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-[var(--color-text-secondary)]">
        {label}
      </label>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: clicking the container focuses the inline <input>; keyboard users reach it via Tab */}
      <div className={cn(CHIP_CONTAINER, "px-2 py-1.5")} onClick={() => inputRef.current?.focus()}>
        {values.map((val, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: duplicates are blocked by addValue; index needed to removeValue by position
          <RemovableChip key={`${val}-${i}`} label={val} onRemove={() => removeValue(i)} />
        ))}
        <input
          ref={inputRef}
          id={id}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addValue(input)}
          placeholder={values.length === 0 ? placeholder : ""}
          className={cn(
            "flex-1 min-w-[6rem] bg-transparent text-sm",
            "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
            "outline-none border-none p-0",
          )}
        />
      </div>
    </div>
  );
}
