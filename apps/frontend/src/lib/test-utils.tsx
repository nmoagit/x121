/**
 * Shared test utilities used across feature test files.
 *
 * Provides a `renderWithProviders` helper that wraps components in the
 * necessary context providers (QueryClientProvider) for testing.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";

/**
 * Render a React element wrapped in all required providers for testing.
 *
 * Creates a fresh `QueryClient` with retries disabled so tests don't
 * hang on failed queries.
 */
export function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}
