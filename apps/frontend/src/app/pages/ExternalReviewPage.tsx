/**
 * Public external review page wrapper (PRD-84).
 *
 * Extracts the share token from URL params and passes it to the
 * ExternalReviewPage feature component. No AppShell chrome.
 */

import { useParams } from "@tanstack/react-router";

import { ExternalReviewPage as ExternalReview } from "@/features/shared-links";

export function ExternalReviewPage() {
  const { token } = useParams({ strict: false }) as { token: string };

  return <ExternalReview token={token} />;
}
