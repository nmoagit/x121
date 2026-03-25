/**
 * External review page for shareable preview links (PRD-84).
 *
 * Lightweight page without platform chrome. Validates the token,
 * optionally gates behind a password, then shows content metadata
 * and a feedback form.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Badge ,  ContextLoader } from "@/components/primitives";
import { formatCountdown } from "@/lib/format";

import { FeedbackForm } from "./FeedbackForm";
import { LinkError } from "./LinkError";
import { PasswordGate } from "./PasswordGate";
import { useValidateToken } from "./hooks/use-shared-links";
import { SCOPE_TYPE_LABELS } from "./types";
import type { LinkScopeType } from "./types";

interface ExternalReviewPageProps {
  token: string;
}

export function ExternalReviewPage({ token }: ExternalReviewPageProps) {
  const { data, isLoading, error } = useValidateToken(token);
  const [passwordVerified, setPasswordVerified] = useState(false);

  /* -- Loading ---------------------------------------------------------- */
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <ContextLoader size={64} />
      </div>
    );
  }

  /* -- Error / expired / not found -------------------------------------- */
  if (error || !data) {
    const reason = getErrorReason(error);
    return <LinkError reason={reason} />;
  }

  /* -- Check if expired on client side ---------------------------------- */
  const now = new Date();
  const expires = new Date(data.expires_at);
  if (now > expires) {
    return <LinkError reason="expired" expiresAt={data.expires_at} />;
  }

  /* -- Password gate ---------------------------------------------------- */
  if (data.password_required && !passwordVerified) {
    return (
      <PasswordGate token={token} onVerified={() => setPasswordVerified(true)} />
    );
  }

  /* -- Main content ----------------------------------------------------- */
  return (
    <div className="flex min-h-screen items-center justify-center p-[var(--spacing-4)]">
      <div className="w-full max-w-lg">
        <Stack gap={6}>
          {/* Header */}
          <Stack gap={2} align="center">
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Review Request
            </h1>
            <div className="flex items-center gap-2">
              <Badge variant="info" size="sm">
                {SCOPE_TYPE_LABELS[data.scope_type as LinkScopeType] ??
                  data.scope_type}
              </Badge>
              <span className="text-sm text-[var(--color-text-muted)]">
                ID: {data.scope_id}
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Expires in {formatCountdown(data.expires_at)}
            </p>
          </Stack>

          {/* Feedback form */}
          <FeedbackForm token={token} />
        </Stack>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

function getErrorReason(
  error: unknown,
): "expired" | "revoked" | "exhausted" | "not_found" {
  if (
    error &&
    typeof error === "object" &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  ) {
    const status = (error as { status: number }).status;
    if (status === 404) return "not_found";
    if (status === 410) return "expired";
    if (status === 403) return "revoked";
    if (status === 429) return "exhausted";
  }
  return "not_found";
}
