/**
 * Password input gate for protected shared links (PRD-84).
 *
 * Shown before content when a shared link requires a password.
 * Calls onVerified on successful password verification.
 */

import { useCallback, useState } from "react";

import { Card } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input } from "@/components/primitives";
import { Lock } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

import { useVerifyPassword } from "./hooks/use-shared-links";

interface PasswordGateProps {
  token: string;
  onVerified: () => void;
}

export function PasswordGate({ token, onVerified }: PasswordGateProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const verifyMutation = useVerifyPassword(token);

  const handleSubmit = useCallback(() => {
    if (!password.trim()) return;
    setError(null);

    verifyMutation.mutate(password, {
      onSuccess: (result) => {
        if (result.verified) {
          onVerified();
        } else {
          setError("Incorrect password. Please try again.");
        }
      },
      onError: () => {
        setError("Verification failed. Please try again.");
      },
    });
  }, [password, verifyMutation, onVerified]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
    },
    [handleSubmit],
  );

  return (
    <div className="flex min-h-screen items-center justify-center p-[var(--spacing-4)]">
      <Card elevation="md" padding="lg" className="max-w-sm w-full">
        <Stack gap={4} align="center">
          <div className="rounded-full bg-[var(--color-action-primary)]/10 p-[var(--spacing-3)]">
            <Lock
              size={iconSizes.xl}
              className="text-[var(--color-action-primary)]"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Password Required
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] text-center">
            This review link is password protected. Enter the password to
            continue.
          </p>
          <div className="w-full" onKeyDown={handleKeyDown}>
            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              error={error ?? undefined}
            />
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            loading={verifyMutation.isPending}
            disabled={!password.trim()}
            className="w-full"
          >
            Continue
          </Button>
        </Stack>
      </Card>
    </div>
  );
}
