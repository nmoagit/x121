/**
 * Inline form for creating a new dataset export (PRD-40).
 *
 * Renders within DatasetExportPanel when the user clicks "New Export".
 */

import { useState } from "react";

import { Button, Input } from "@/components/primitives";
import { TERMINAL_LABEL } from "@/lib/ui-classes";

import { SplitConfigurator } from "./SplitConfigurator";
import { useCreateDatasetExport } from "./hooks/use-sidecar";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface CreateExportFormProps {
  projectId: number;
  onCancel: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function CreateExportForm({ projectId, onCancel }: CreateExportFormProps) {
  const createExport = useCreateDatasetExport(projectId);

  const [name, setName] = useState("");
  const [qualityThreshold, setQualityThreshold] = useState(80);
  const [train, setTrain] = useState(70);
  const [validation, setValidation] = useState(20);
  const [test, setTest] = useState(10);

  const splitSum = train + validation + test;
  const canSubmit = name.trim() !== "" && splitSum === 100;

  function handleSplitChange(
    field: "train" | "validation" | "test",
    value: number,
  ) {
    if (field === "train") setTrain(value);
    else if (field === "validation") setValidation(value);
    else setTest(value);
  }

  function handleSubmit() {
    if (!canSubmit) return;

    createExport.mutate(
      {
        name: name.trim(),
        config_json: {
          quality_threshold: qualityThreshold,
          train_split: train,
          validation_split: validation,
          test_split: test,
        },
      },
      { onSuccess: onCancel },
    );
  }

  return (
    <div data-testid="create-export-form" className="flex flex-col gap-3 p-3">
      <Input
        label="Export Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Dataset export name"
      />
      <div>
        <span className={`block mb-1 ${TERMINAL_LABEL}`}>
          Quality Threshold: {qualityThreshold}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={qualityThreshold}
          onChange={(e) => setQualityThreshold(Number(e.target.value))}
          className="w-full"
          data-testid="quality-slider"
        />
      </div>
      <SplitConfigurator
        train={train}
        validation={validation}
        test={test}
        onChange={handleSplitChange}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={!canSubmit}
          loading={createExport.isPending}
          data-testid="submit-export-btn"
        >
          Create Export
        </Button>
      </div>
    </div>
  );
}
