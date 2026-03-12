import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { routeTree, basepath } from "@/app/router";
import { ToastContainer } from "@/components/composite";
import { toastStore } from "@/components/composite/useToast";
import { ApiRequestError } from "@/lib/api";
import { ThemeProvider } from "@/theme";
import "@/app/index.css";

/**
 * Human-friendly labels for common HTTP error status codes.
 * The server-provided detail message is appended after these.
 */
const STATUS_LABELS: Record<number, string> = {
  400: "Invalid request",
  403: "You don't have permission to do that",
  404: "Resource not found",
  409: "A conflict occurred",
  422: "Validation failed",
  429: "Too many requests — please wait",
  500: "Something went wrong on the server",
};

/** Global mutation error handler — surfaces API errors as toasts. */
const mutationCache = new MutationCache({
  onError(error) {
    if (error instanceof ApiRequestError) {
      // Don't toast 401s — those are handled by the auth redirect in api.ts
      if (error.status === 401) return;

      const prefix = STATUS_LABELS[error.status] ?? `Error ${error.status}`;
      const detail = error.error?.message;
      const message = detail ? `${prefix}: ${detail}` : prefix;
      toastStore.addToast({ message, variant: "error" });
    } else {
      toastStore.addToast({
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "error",
      });
    }
  },
});

const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

const router = createRouter({ routeTree, basepath });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <ToastContainer />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
