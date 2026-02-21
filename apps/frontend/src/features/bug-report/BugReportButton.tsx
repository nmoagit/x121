/**
 * Floating bug-report trigger button (PRD-44).
 *
 * Renders a fixed-position button that opens the bug report form modal.
 * The button automatically captures the current URL, browser info, and
 * any console errors when clicked.
 */

import { useState } from "react";

import { Button } from "@/components";
import { AlertCircle } from "@/tokens/icons";

import { BugReportForm } from "./BugReportForm";

export function BugReportButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={<AlertCircle size={16} />}
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-40 shadow-lg"
        aria-label="Report a bug"
      >
        Report Bug
      </Button>

      {open && <BugReportForm onClose={() => setOpen(false)} />}
    </>
  );
}
