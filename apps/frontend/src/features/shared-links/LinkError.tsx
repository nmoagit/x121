/**
 * Error display for expired, revoked, or exhausted shared links (PRD-84).
 */

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { AlertCircle, Ban, Clock } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { formatDateTime } from "@/lib/format";

type LinkErrorReason = "expired" | "revoked" | "exhausted" | "not_found";

interface LinkErrorProps {
  reason: LinkErrorReason;
  expiresAt?: string;
}

const ERROR_CONFIG: Record<
  LinkErrorReason,
  { title: string; description: string; Icon: typeof Clock }
> = {
  expired: {
    title: "This link has expired",
    description: "The review link is no longer valid.",
    Icon: Clock,
  },
  revoked: {
    title: "This link has been revoked",
    description: "The link owner has revoked access.",
    Icon: Ban,
  },
  exhausted: {
    title: "View limit reached",
    description: "This link has reached its maximum number of views.",
    Icon: AlertCircle,
  },
  not_found: {
    title: "Link not found",
    description: "This review link does not exist or is invalid.",
    Icon: AlertCircle,
  },
};

export function LinkError({ reason, expiresAt }: LinkErrorProps) {
  const config = ERROR_CONFIG[reason];
  const { Icon } = config;

  return (
    <div className="flex min-h-screen items-center justify-center p-[var(--spacing-4)]">
      <Card elevation="md" padding="lg" className="max-w-sm w-full text-center">
        <Stack gap={4} align="center">
          <div className="rounded-full bg-[var(--color-action-danger)]/10 p-[var(--spacing-3)]">
            <Icon
              size={iconSizes.xl}
              className="text-[var(--color-action-danger)]"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            {config.title}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {config.description}
          </p>
          {reason === "expired" && expiresAt && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Expired on {formatDateTime(expiresAt)}
            </p>
          )}
        </Stack>
      </Card>
    </div>
  );
}
