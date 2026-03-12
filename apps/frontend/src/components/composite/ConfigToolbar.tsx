/**
 * Reusable export/import toolbar for settings pages.
 *
 * Renders a compact row with Export and Import buttons.
 */

import { useCallback, useRef } from "react";

import { Button } from "@/components/primitives";
import { Download, Upload } from "@/tokens/icons";

interface ConfigToolbarProps {
  /** Called when user clicks Export. Should trigger downloadConfig(). */
  onExport: () => void;
  /** Called when user selects a JSON file for import. */
  onImport: (file: File) => void;
  /** Whether export is in progress (loading state). */
  exporting?: boolean;
  /** Whether import is in progress (loading state). */
  importing?: boolean;
}

export function ConfigToolbar({
  onExport,
  onImport,
  exporting = false,
  importing = false,
}: ConfigToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onImport(file);
        // Reset so the same file can be re-imported
        e.target.value = "";
      }
    },
    [onImport],
  );

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        icon={<Download size={14} />}
        onClick={onExport}
        loading={exporting}
      >
        Export
      </Button>
      <Button
        variant="ghost"
        size="sm"
        icon={<Upload size={14} />}
        onClick={() => inputRef.current?.click()}
        loading={importing}
      >
        Import
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
