import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button, Input } from "@/components/primitives";
import { useAuthStore } from "@/stores/auth-store";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading } = useAuthStore();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      await login(username, password);
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-primary)]">
      <div className="w-full max-w-sm space-y-6 rounded-[var(--radius-lg)] bg-[var(--color-surface-secondary)] p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-[var(--color-text-primary)]">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Enter your credentials to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Username"
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
          />

          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
          />

          {error && (
            <p role="alert" className="text-sm text-[var(--color-action-danger)]">
              {error}
            </p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={isLoading}
            disabled={isLoading}
            className="w-full"
          >
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
