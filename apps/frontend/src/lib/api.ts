import { useAuthStore } from "@/stores/auth-store";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const BASE_URL = "/api/v1";

/* --------------------------------------------------------------------------
   Error types
   -------------------------------------------------------------------------- */

interface ApiError {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public error: ApiError,
  ) {
    super(error.message);
    this.name = "ApiRequestError";
  }
}

/* --------------------------------------------------------------------------
   Token refresh queue
   --------------------------------------------------------------------------
   When multiple requests hit 401 simultaneously, only ONE refresh should
   execute. All others wait on the same promise.
   -------------------------------------------------------------------------- */

let refreshPromise: Promise<boolean> | null = null;

async function refreshTokenOnce(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = useAuthStore
      .getState()
      .refresh()
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/* --------------------------------------------------------------------------
   Core request function
   -------------------------------------------------------------------------- */

async function request<T>(
  path: string,
  options?: RequestInit,
  isRetry = false,
): Promise<T> {
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> | undefined),
  };

  const token = useAuthStore.getState().accessToken;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, { ...options, headers });

  /* -- Handle 401: attempt silent refresh, then retry once -- */
  if (response.status === 401 && !isRetry) {
    const refreshed = await refreshTokenOnce();

    if (refreshed) {
      return request<T>(path, options, true);
    }

    // Refresh failed -- clear auth and redirect to login
    useAuthStore.getState().clearAuth();
    window.location.href = "/login";
    // Return a never-resolving promise so callers don't continue
    return new Promise<T>(() => {});
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({
      error: { code: "UNKNOWN", message: response.statusText },
    }));
    throw new ApiRequestError(response.status, body.error);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json();
  return body.data as T;
}

/* --------------------------------------------------------------------------
   Public API client
   -------------------------------------------------------------------------- */

export const api = {
  get<T>(path: string): Promise<T> {
    return request<T>(path);
  },

  post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },

  delete<T = void>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};
