/**
 * RecoveryRunbookDownload -- download button for the recovery runbook HTML (PRD-81).
 *
 * Uses the raw API client to fetch the HTML blob and trigger a browser download.
 */

import { useState } from "react";

import { Button } from "@/components/primitives";
import { Download } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";
import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function RecoveryRunbookDownload() {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await api.raw("/admin/backups/recovery-runbook", {
        headers: { Accept: "text/html" },
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "recovery-runbook.html";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<Download size={iconSizes.sm} />}
      loading={downloading}
      onClick={handleDownload}
      data-testid="runbook-download"
    >
      Download Runbook
    </Button>
  );
}
