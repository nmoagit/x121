/**
 * Integrity Check Panel (PRD-45).
 *
 * Button to run integrity verification on the audit log hash chain,
 * with progress indicator and pass/fail result display.
 */

import { useState, useCallback } from "react";

import { Button ,  ContextLoader } from "@/components/primitives";
import { Stack } from "@/components/layout";
import { TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_BODY } from "@/lib/ui-classes";
import type { IntegrityCheckResult } from "./types";
import { api } from "@/lib/api";
import { TYPO_DATA_DANGER } from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function IntegrityCheck() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<IntegrityCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setIsRunning(true);
    setResult(null);
    setError(null);

    try {
      const data = await api.get<IntegrityCheckResult>(
        "/admin/audit-logs/integrity-check",
      );
      setResult(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Integrity check failed",
      );
    } finally {
      setIsRunning(false);
    }
  }, []);

  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <span className={TERMINAL_HEADER_TITLE}>Integrity Verification</span>
        <p className="mt-1 text-xs text-[var(--color-text-muted)] font-mono">
          Verify the audit log hash chain has not been tampered with.
        </p>
      </div>

      <div className={TERMINAL_BODY}>
        <Stack gap={4}>
          <Button
            variant="primary"
            size="sm"
            onClick={runCheck}
            disabled={isRunning}
          >
            {isRunning ? "Running..." : "Run Integrity Check"}
          </Button>

          {isRunning && (
            <div className="flex items-center gap-2">
              <ContextLoader size={32} />
              <span className="text-xs text-[var(--color-text-muted)] font-mono">
                Verifying audit log chain...
              </span>
            </div>
          )}

          {error && (
            <div className={`${TYPO_DATA_DANGER} rounded-[var(--radius-md)] border border-red-400/30 bg-red-400/5 p-3`}>
              {error}
            </div>
          )}

          {result && (
            <div
              className={`rounded-[var(--radius-md)] border p-4 ${
                result.chain_valid
                  ? "border-green-400/30 bg-green-400/5"
                  : "border-red-400/30 bg-red-400/5"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-lg font-bold font-mono ${
                    result.chain_valid
                      ? "text-[var(--color-data-green)]"
                      : "text-[var(--color-data-red)]"
                  }`}
                >
                  {result.chain_valid ? "PASS" : "FAIL"}
                </span>
                <span className="text-xs text-[var(--color-text-muted)] font-mono">
                  {result.verified_entries} entries verified
                </span>
              </div>
              {result.first_break !== null && (
                <p className={`${TYPO_DATA_DANGER} mt-2`}>
                  Chain break detected at entry #{result.first_break}
                </p>
              )}
            </div>
          )}
        </Stack>
      </div>
    </div>
  );
}
