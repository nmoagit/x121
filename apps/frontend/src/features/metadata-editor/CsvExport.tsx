/**
 * CSV export button for character metadata (PRD-66).
 *
 * Triggers a browser file download of the project's metadata CSV.
 */

import { useCallback, useState } from "react";

import { Button } from "@/components/primitives";

import { exportMetadataCsv } from "./hooks/use-metadata-editor";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface CsvExportProps {
  projectId: number;
}

export function CsvExport({ projectId }: CsvExportProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      await exportMetadataCsv(projectId);
    } catch {
      // Error notification can be added via toast.
    } finally {
      setExporting(false);
    }
  }, [projectId]);

  return (
    <Button
      variant="secondary"
      size="sm"
      disabled={exporting}
      onClick={handleExport}
    >
      {exporting ? "Exporting..." : "Export CSV"}
    </Button>
  );
}
