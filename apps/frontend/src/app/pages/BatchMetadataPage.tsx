/**
 * Batch metadata operations page (PRD-88).
 *
 * Provides a project-scoped batch metadata panel for multi-select edits,
 * search-replace operations, and an operation history log.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, Input } from "@/components/primitives";

import { BatchMetadataPanel } from "@/features/batch-metadata";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function BatchMetadataPage() {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");

  const handleLoad = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setProjectId(parsed);
    }
  };

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Batch Metadata Operations"
          description="Perform bulk metadata edits, search-replace, and field operations across multiple avatars."
        />

        {/* Project selector */}
        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Input
              label="Project ID"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter project ID"
              min="1"
            />
          </div>
          <Button variant="primary" onClick={handleLoad} disabled={!inputValue.trim()}>
            Load
          </Button>
        </Stack>

        {/* Panel */}
        {projectId !== null ? (
          <BatchMetadataPanel projectId={projectId} avatarIds={[]} />
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter a project ID above to start a batch metadata operation.
          </p>
        )}
      </Stack>
    </div>
  );
}
