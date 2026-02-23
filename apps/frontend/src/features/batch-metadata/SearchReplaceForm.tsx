/**
 * Search/Replace form for batch metadata operations (PRD-88).
 *
 * Allows entering a search pattern, replacement text, toggling regex mode,
 * and specifying an optional field filter.
 */

import { useState } from "react";

import { Button, Checkbox, Input } from "@/components";

import { useCreatePreview } from "./hooks/use-batch-metadata";
import type {
  BatchMetadataOperation,
  CreateBatchMetadataRequest,
} from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface SearchReplaceFormProps {
  /** Builds the full request object from params + field_name. */
  buildRequest: (
    params: Record<string, unknown>,
    fieldName?: string,
  ) => CreateBatchMetadataRequest;
  /** Called when a preview is successfully created. */
  onPreviewCreated: (op: BatchMetadataOperation) => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SearchReplaceForm({
  buildRequest,
  onPreviewCreated,
}: SearchReplaceFormProps) {
  const [searchPattern, setSearchPattern] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(true);
  const [fieldName, setFieldName] = useState("");

  const createPreview = useCreatePreview();

  const handleSubmit = () => {
    const params = {
      search_pattern: searchPattern,
      replace_with: replaceWith,
      use_regex: useRegex,
      case_sensitive: caseSensitive,
    };

    const request = buildRequest(params, fieldName || undefined);

    createPreview.mutate(request, {
      onSuccess: (op) => onPreviewCreated(op),
    });
  };

  const isValid = searchPattern.length > 0;

  return (
    <div data-testid="search-replace-form" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Search Pattern</label>
        <Input
          data-testid="search-pattern-input"
          value={searchPattern}
          onChange={(e) => setSearchPattern(e.target.value)}
          placeholder="Enter search text..."
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Replace With</label>
        <Input
          data-testid="replace-with-input"
          value={replaceWith}
          onChange={(e) => setReplaceWith(e.target.value)}
          placeholder="Enter replacement text..."
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Field Name (optional)</label>
        <Input
          data-testid="field-name-input"
          value={fieldName}
          onChange={(e) => setFieldName(e.target.value)}
          placeholder="e.g. hair_color"
        />
      </div>

      <div className="flex items-center gap-4">
        <span data-testid="regex-toggle">
          <Checkbox
            checked={useRegex}
            onChange={(v: boolean) => setUseRegex(v)}
            label="Use Regex"
          />
        </span>
        <span data-testid="case-sensitive-toggle">
          <Checkbox
            checked={caseSensitive}
            onChange={(v: boolean) => setCaseSensitive(v)}
            label="Case Sensitive"
          />
        </span>
      </div>

      <Button
        data-testid="preview-search-replace-btn"
        onClick={handleSubmit}
        disabled={!isValid || createPreview.isPending}
      >
        {createPreview.isPending ? "Creating Preview..." : "Preview Changes"}
      </Button>
    </div>
  );
}
