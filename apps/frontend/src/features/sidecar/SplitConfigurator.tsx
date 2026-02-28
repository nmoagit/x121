/**
 * Split configurator for Dataset Export (PRD-40).
 *
 * Three number inputs for train/validation/test split percentages
 * with a visual indicator that turns green when the sum equals 100%.
 */

import { Input } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SPLIT_FIELDS = [
  { key: "train", label: "Train %" },
  { key: "validation", label: "Validation %" },
  { key: "test", label: "Test %" },
] as const;

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface SplitConfiguratorProps {
  train: number;
  validation: number;
  test: number;
  onChange: (field: "train" | "validation" | "test", value: number) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SplitConfigurator({
  train,
  validation,
  test,
  onChange,
}: SplitConfiguratorProps) {
  const values: Record<string, number> = { train, validation, test };
  const sum = train + validation + test;
  const isValid = sum === 100;

  return (
    <div data-testid="split-configurator">
      <div className="grid grid-cols-3 gap-3">
        {SPLIT_FIELDS.map(({ key, label }) => (
          <Input
            key={key}
            label={label}
            type="number"
            min={0}
            max={100}
            value={String(values[key])}
            onChange={(e) => onChange(key, Number(e.target.value) || 0)}
            data-testid={`split-${key}`}
          />
        ))}
      </div>

      <p
        data-testid="split-sum"
        className={`mt-2 text-xs font-medium ${
          isValid
            ? "text-[var(--color-status-success)]"
            : "text-[var(--color-status-danger)]"
        }`}
      >
        Total: {sum}%{isValid ? "" : " (must equal 100%)"}
      </p>
    </div>
  );
}
