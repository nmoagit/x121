/**
 * TestResultDisplay -- request/response side-by-side result view (PRD-99).
 */

import { Badge } from "@/components/primitives";

import type { WebhookDeliveryLog } from "./types";
import { TYPO_DATA, TYPO_INPUT_LABEL, TYPO_CAPTION} from "@/lib/typography-tokens";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

interface TestResultDisplayProps {
  result: WebhookDeliveryLog;
}

export function TestResultDisplay({ result }: TestResultDisplayProps) {
  return (
    <div data-testid="send-result" className="space-y-4">
      <div className="flex items-center gap-3">
        <Badge variant={result.success ? "success" : "danger"}>
          {result.success ? "Success" : "Failed"}
        </Badge>
        {result.response_status != null && (
          <span className={TYPO_CAPTION}>
            HTTP {result.response_status}
          </span>
        )}
        <span className={TYPO_CAPTION}>
          {result.duration_ms}ms
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Request */}
        <div>
          <span className={`mb-1 block ${TYPO_INPUT_LABEL}`}>
            Request
          </span>
          <pre className={`max-h-48 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 ${TYPO_DATA}`}>
            {result.request_body_json
              ? JSON.stringify(result.request_body_json, null, 2)
              : "(empty body)"}
          </pre>
        </div>

        {/* Response */}
        <div>
          <span className={`mb-1 block ${TYPO_INPUT_LABEL}`}>
            Response
          </span>
          <pre className={`max-h-48 overflow-auto rounded bg-[var(--color-bg-secondary)] p-2 ${TYPO_DATA}`}>
            {result.response_body ?? "(no response body)"}
          </pre>
        </div>
      </div>

      {result.error_message && (
        <pre className="max-h-32 overflow-auto rounded bg-red-50 p-2 font-mono text-xs text-red-700">
          {result.error_message}
        </pre>
      )}
    </div>
  );
}
