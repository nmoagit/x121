/**
 * Bug report submission form (PRD-44).
 *
 * Pre-fills context (URL, browser info) and lets the user add a description.
 * Submits via the bug-report API endpoint.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components";
import { Modal } from "@/components/composite/Modal";
import { cn } from "@/lib/cn";

import { useSubmitBugReport } from "./hooks/use-bug-reports";
import type { CreateBugReportInput } from "./types";

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Collect browser metadata. */
function getBrowserInfo(): string {
  const { userAgent, language, platform } = navigator;
  const screenRes = `${screen.width}x${screen.height}`;
  const viewportSize = `${window.innerWidth}x${window.innerHeight}`;
  return `UA: ${userAgent}\nLang: ${language}\nPlatform: ${platform}\nScreen: ${screenRes}\nViewport: ${viewportSize}`;
}

/** Collect recent console errors (captured via listener). */
const consoleErrors: string[] = [];
const MAX_CONSOLE_ERRORS = 50;

// Capture unhandled errors
if (typeof window !== "undefined") {
  window.addEventListener("error", (event) => {
    consoleErrors.push(
      `[${new Date().toISOString()}] ${event.message} at ${event.filename}:${event.lineno}:${event.colno}`,
    );
    if (consoleErrors.length > MAX_CONSOLE_ERRORS) {
      consoleErrors.shift();
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    consoleErrors.push(
      `[${new Date().toISOString()}] Unhandled rejection: ${String(event.reason)}`,
    );
    if (consoleErrors.length > MAX_CONSOLE_ERRORS) {
      consoleErrors.shift();
    }
  });
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface BugReportFormProps {
  onClose: () => void;
}

export function BugReportForm({ onClose }: BugReportFormProps) {
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const submitMutation = useSubmitBugReport();

  // Capture context at mount time (when user clicks "Report Bug").
  const context = useMemo(
    () => ({
      url: window.location.href,
      browserInfo: getBrowserInfo(),
      consoleErrors: [...consoleErrors],
    }),
    [],
  );

  const handleSubmit = useCallback(() => {
    const input: CreateBugReportInput = {
      description: description.trim() || undefined,
      url: context.url,
      browser_info: context.browserInfo,
      console_errors_json:
        context.consoleErrors.length > 0 ? context.consoleErrors : undefined,
      context_json: {
        pathname: window.location.pathname,
        search: window.location.search,
        timestamp: new Date().toISOString(),
      },
    };

    submitMutation.mutate(input, {
      onSuccess: () => setSubmitted(true),
    });
  }, [description, context, submitMutation]);

  // Auto-close after successful submission.
  useEffect(() => {
    if (!submitted) return;
    const timer = setTimeout(onClose, 2000);
    return () => clearTimeout(timer);
  }, [submitted, onClose]);

  return (
    <Modal open onClose={onClose} title="Report a Bug" size="lg">
      {submitted ? (
        <div className="py-6 text-center">
          <p className="text-base font-medium text-[var(--color-text-primary)]">
            Bug report submitted successfully!
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            Thank you for helping improve the platform.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="bug-description"
              className="text-sm font-medium text-[var(--color-text-secondary)]"
            >
              What went wrong?
            </label>
            <textarea
              id="bug-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue you encountered..."
              rows={4}
              maxLength={10000}
              className={cn(
                "w-full px-3 py-2 text-base resize-y",
                "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
                "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
                "placeholder:text-[var(--color-text-muted)]",
                "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
                "focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--color-border-focus)]",
              )}
            />
          </div>

          {/* Pre-filled context (read-only) */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              Context (auto-captured)
            </span>
            <div className="rounded-[var(--radius-md)] bg-[var(--color-surface-tertiary)] p-3 text-xs text-[var(--color-text-muted)] font-mono space-y-1">
              <p>URL: {context.url}</p>
              <p>Browser: {navigator.userAgent.slice(0, 80)}...</p>
              {context.consoleErrors.length > 0 && (
                <p>Console errors: {context.consoleErrors.length} captured</p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              loading={submitMutation.isPending}
              onClick={handleSubmit}
            >
              Submit Report
            </Button>
          </div>

          {submitMutation.isError && (
            <p className="text-sm text-[var(--color-action-danger)]">
              Failed to submit bug report. Please try again.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
