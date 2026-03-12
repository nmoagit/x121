/**
 * Contact sheet page for a character (PRD-103).
 *
 * Combines FaceCropGrid + ContactSheetControls into a full page view
 * with character header, image count summary, and empty state.
 */

import { useState } from "react";

import { Badge, Spinner } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { useSetPageTitle } from "@/hooks/useSetPageTitle";

import { ContactSheetControls } from "./ContactSheetControls";
import { FaceCropGrid } from "./FaceCropGrid";
import { useContactSheetImages, useGenerateContactSheet } from "./hooks/use-contact-sheet";
import {
  DEFAULT_GRID_COLUMNS,
  type ExportFormat,
  type GridColumns,
} from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface ContactSheetPageProps {
  characterId: number;
  characterName: string;
  sceneLabels?: Record<number, string>;
}

export function ContactSheetPage({
  characterId,
  characterName,
  sceneLabels = {},
}: ContactSheetPageProps) {
  useSetPageTitle("Contact Sheet", characterName);
  const [columns, setColumns] = useState<GridColumns>(DEFAULT_GRID_COLUMNS);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [exportTriggered, setExportTriggered] = useState(false);

  const { data: images = [], isLoading } = useContactSheetImages(characterId);
  const generateMutation = useGenerateContactSheet(characterId);

  function handleGenerate() {
    generateMutation.mutate();
  }

  function handleExport() {
    setExportTriggered(true);
    // Export is handled via the useExportContactSheet query in the parent
    // or by navigating to the export URL. For now, mark as triggered.
  }

  // Reset export trigger when format changes
  function handleFormatChange(format: ExportFormat) {
    setExportFormat(format);
    setExportTriggered(false);
  }

  return (
    <div data-testid="contact-sheet-page" className="space-y-6">
      {/* Image count badge */}
      {images.length > 0 && (
        <div className="flex items-center justify-end">
          <span data-testid="image-count-badge">
            <Badge variant="info" size="sm">
              {images.length} {images.length === 1 ? "image" : "images"}
            </Badge>
          </span>
        </div>
      )}

      {/* Controls */}
      <ContactSheetControls
        imageCount={images.length}
        selectedCount={selectedIds.size}
        exportFormat={exportFormat}
        onExportFormatChange={handleFormatChange}
        columns={columns}
        onColumnsChange={setColumns}
        onGenerate={handleGenerate}
        onExport={handleExport}
        isGenerating={generateMutation.isPending}
        isExporting={exportTriggered}
      />

      {/* Grid */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-medium text-[var(--color-text-primary)]">
            Face Crops
          </h2>
        </CardHeader>
        <CardBody>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Spinner />
            </div>
          ) : (
            <FaceCropGrid
              images={images}
              columns={columns}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              sceneLabels={sceneLabels}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
