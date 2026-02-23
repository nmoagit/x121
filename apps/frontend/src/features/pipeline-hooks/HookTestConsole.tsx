/**
 * HookTestConsole -- test a hook with sample input and view output (PRD-77).
 *
 * Provides a JSON textarea for input, an execute button, and displays
 * the execution result including stdout, exit code, and duration.
 */

import { useState } from "react";

import { Badge, Button, Card, CardBody, CardHeader } from "@/components";

import { useTestHook } from "./hooks/use-pipeline-hooks";
import type { HookExecutionLog } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface HookTestConsoleProps {
  hookId: number;
}

/* --------------------------------------------------------------------------
   Default sample input
   -------------------------------------------------------------------------- */

const DEFAULT_INPUT = JSON.stringify(
  {
    variant_id: 1,
    segment_id: 1,
    job_id: null,
    scene_type: "talking_head",
    character_name: "Test Character",
  },
  null,
  2,
);

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function HookTestConsole({ hookId }: HookTestConsoleProps) {
  const [inputText, setInputText] = useState(DEFAULT_INPUT);
  const [result, setResult] = useState<HookExecutionLog | null>(null);
  const testHook = useTestHook();

  const handleExecute = () => {
    let inputJson: Record<string, unknown> | null = null;
    try {
      inputJson = JSON.parse(inputText);
    } catch {
      // If invalid JSON, pass null
    }

    testHook.mutate(
      { id: hookId, input_json: inputJson },
      { onSuccess: (data) => setResult(data) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <h3
          data-testid="test-console-title"
          className="text-sm font-semibold text-[var(--color-text-primary)]"
        >
          Hook Test Console
        </h3>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]">
              Input JSON
            </label>
            <textarea
              data-testid="test-input"
              className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]"
              rows={6}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
          </div>

          <Button
            data-testid="execute-btn"
            onClick={handleExecute}
            disabled={testHook.isPending}
          >
            {testHook.isPending ? "Executing..." : "Execute"}
          </Button>

          {result && (
            <div
              data-testid="test-result"
              className="space-y-2 rounded border border-[var(--color-border)] p-3"
            >
              <div className="flex items-center gap-3">
                <Badge variant={result.success ? "success" : "danger"}>
                  {result.success ? "Success" : "Failed"}
                </Badge>
                {result.exit_code != null && (
                  <span
                    data-testid="exit-code"
                    className="text-xs text-[var(--color-text-secondary)]"
                  >
                    Exit code: {result.exit_code}
                  </span>
                )}
                {result.duration_ms != null && (
                  <span
                    data-testid="duration"
                    className="text-xs text-[var(--color-text-secondary)]"
                  >
                    {result.duration_ms}ms
                  </span>
                )}
              </div>
              {result.output_text && (
                <pre
                  data-testid="output-text"
                  className="max-h-48 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]"
                >
                  {result.output_text}
                </pre>
              )}
              {result.error_message && (
                <pre
                  data-testid="error-text"
                  className="max-h-48 overflow-auto rounded bg-red-50 p-2 font-mono text-xs text-red-700"
                >
                  {result.error_message}
                </pre>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
