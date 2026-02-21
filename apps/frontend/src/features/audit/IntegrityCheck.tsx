/**
 * Integrity Check Panel (PRD-45).
 *
 * Button to run integrity verification on the audit log hash chain,
 * with progress indicator and pass/fail result display.
 */

import { useState, useCallback } from "react";

import { Card } from "@/components/composite/Card";
import { Button, Spinner } from "@/components/primitives";
import { Stack } from "@/components/layout";
import type { IntegrityCheckResult } from "./types";
import { api } from "@/lib/api";

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
    <Card padding="lg">
      <Stack gap={4}>
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
            Integrity Verification
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Verify the audit log hash chain has not been tampered with.
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={runCheck}
          disabled={isRunning}
        >
          {isRunning ? "Running..." : "Run Integrity Check"}
        </Button>

        {isRunning && (
          <div className="flex items-center gap-2">
            <Spinner size="sm" />
            <span className="text-sm text-[var(--color-text-muted)]">
              Verifying audit log chain...
            </span>
          </div>
        )}

        {error && (
          <div className="rounded-[var(--radius-md)] border border-[var(--color-status-error)] bg-red-50 p-3 text-sm text-[var(--color-status-error)]">
            {error}
          </div>
        )}

        {result && (
          <div
            className={`rounded-[var(--radius-md)] border p-4 ${
              result.chain_valid
                ? "border-[var(--color-status-success)] bg-green-50"
                : "border-[var(--color-status-error)] bg-red-50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`text-lg font-bold ${
                  result.chain_valid
                    ? "text-[var(--color-status-success)]"
                    : "text-[var(--color-status-error)]"
                }`}
              >
                {result.chain_valid ? "PASS" : "FAIL"}
              </span>
              <span className="text-sm text-[var(--color-text-secondary)]">
                {result.verified_entries} entries verified
              </span>
            </div>
            {result.first_break !== null && (
              <p className="mt-2 text-sm text-[var(--color-status-error)]">
                Chain break detected at entry #{result.first_break}
              </p>
            )}
          </div>
        )}
      </Stack>
    </Card>
  );
}
