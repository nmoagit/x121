/**
 * Name parser preview component (PRD-113).
 *
 * Shows original folder name alongside parsed name with a confidence indicator.
 * Supports inline editing of the parsed name.
 */

import { useState } from "react";

import { Badge } from "@/components/primitives";
import type { BadgeVariant } from "@/components/primitives";
import { ArrowRight } from "@/tokens/icons";
import type { NameConfidence } from "./types";

/* --------------------------------------------------------------------------
   Confidence → Badge mapping
   -------------------------------------------------------------------------- */

const CONFIDENCE_VARIANT: Record<NameConfidence, BadgeVariant> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

const CONFIDENCE_LABEL: Record<NameConfidence, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface NameParserPreviewProps {
  original: string;
  parsed: string;
  confidence: NameConfidence;
  onEdit: (newName: string) => void;
}

export function NameParserPreview({
  original,
  parsed,
  confidence,
  onEdit,
}: NameParserPreviewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(parsed);

  function handleSubmit() {
    setIsEditing(false);
    if (editValue.trim() && editValue !== parsed) {
      onEdit(editValue.trim());
    } else {
      setEditValue(parsed);
    }
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-mono text-muted-foreground">{original}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" />

      {isEditing ? (
        <input
          className="rounded border border-input bg-background px-2 py-0.5 text-sm"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
            if (e.key === "Escape") {
              setEditValue(parsed);
              setIsEditing(false);
            }
          }}
          autoFocus
        />
      ) : (
        <button
          className="cursor-pointer rounded px-1 font-medium hover:bg-muted"
          onClick={() => setIsEditing(true)}
          title="Click to edit"
        >
          {parsed}
        </button>
      )}

      <Badge variant={CONFIDENCE_VARIANT[confidence]}>
        {CONFIDENCE_LABEL[confidence]}
      </Badge>
    </div>
  );
}
