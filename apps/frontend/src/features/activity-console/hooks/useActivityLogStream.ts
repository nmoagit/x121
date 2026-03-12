/**
 * WebSocket hook for real-time activity log streaming (PRD-118).
 *
 * Connects to `/ws/activity-logs`, sends filter subscriptions,
 * and routes incoming messages to the Zustand store.
 * Auto-reconnects with exponential backoff (1s -> 30s max).
 */

import { useEffect, useRef, useState } from "react";

import { toastStore } from "@/components/composite/useToast";
import { useAuthStore } from "@/stores/auth-store";

import { useActivityConsoleStore } from "../stores/useActivityConsoleStore";
import type {
  ActivityLogEntry,
  ActivityLogLaggedMessage,
  WsClientAction,
  WsConnectionStatus,
  WsMessage,
} from "../types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;
const FILTER_DEBOUNCE_MS = 300;

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Derive the WebSocket URL from the current page location. */
function getWsUrl(): string {
  const loc = window.location;
  const protocol = loc.protocol === "https:" ? "wss:" : "ws:";
  const basePath = import.meta.env.BASE_URL ?? "/";
  return `${protocol}//${loc.host}${basePath}api/v1/ws/activity-logs`;
}

/** Build the subscribe/update_filter payload from current store state. */
function buildFilterAction(action: "subscribe" | "update_filter"): WsClientAction {
  const state = useActivityConsoleStore.getState();
  return {
    action,
    levels: state.levels.size > 0 ? [...state.levels] : undefined,
    sources: state.sources.size > 0 ? [...state.sources] : undefined,
    mode: state.mode,
    entity_type: state.entityFilter?.type,
    entity_id: state.entityFilter?.id,
    search: state.searchText || undefined,
  };
}

/**
 * Patterns that should surface a toast notification to the user.
 * Matches on the message text from curated activity log entries.
 */
const TOAST_PATTERNS: Array<{
  match: RegExp;
  variant: "success" | "error" | "warning" | "info";
}> = [
  // Scaling / provisioning
  { match: /Auto-scaling: provisioning/i, variant: "info" },
  { match: /Auto-scaling:.*instance provisioned/i, variant: "success" },
  { match: /Auto-scaling: failed to provision/i, variant: "error" },
  // Instance connectivity
  { match: /ComfyUI instance \d+ connected$/i, variant: "success" },
  { match: /ComfyUI instance \d+ disconnected$/i, variant: "warning" },
  // Job queued waiting for instance
  { match: /No ComfyUI instances available.*requesting instance startup/i, variant: "info" },
  // Deferred dispatch
  { match: /Dispatched \d+ deferred job/i, variant: "success" },
  // Generation completion
  { match: /Job \d+ completed$/i, variant: "success" },
  { match: /Job \d+ failed/i, variant: "error" },
];

/** Show a toast for important curated activity log entries. */
function maybeShowToast(entry: ActivityLogEntry) {
  if (entry.category !== "curated") return;
  for (const pattern of TOAST_PATTERNS) {
    if (pattern.match.test(entry.message)) {
      toastStore.addToast({
        message: entry.message,
        variant: pattern.variant,
        duration: pattern.variant === "error" ? 8000 : 5000,
      });
      return; // only one toast per entry
    }
  }
}

/** Parse and validate an incoming WebSocket message. */
function parseMessage(data: string): WsMessage | null {
  try {
    const msg = JSON.parse(data) as WsMessage;
    if (msg.type === "entry" || msg.type === "lagged") return msg;
    return null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useActivityLogStream(): WsConnectionStatus {
  const [status, setStatus] = useState<WsConnectionStatus>("disconnected");

  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  /* -- Lifecycle: connect on mount, disconnect on unmount ----------------- */
  useEffect(() => {
    mountedRef.current = true;

    const { addEntry, addSkipped } = useActivityConsoleStore.getState();

    function send(payload: WsClientAction) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(payload));
      }
    }

    function scheduleReconnect() {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
        connect();
      }, backoffRef.current);
    }

    function connect() {
      if (!mountedRef.current) return;

      // Clean up any prior connection
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect from cleanup
        wsRef.current.close();
        wsRef.current = null;
      }

      setStatus("connecting");

      const token = useAuthStore.getState().accessToken;
      const url = token ? `${getWsUrl()}?token=${encodeURIComponent(token)}` : getWsUrl();
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        backoffRef.current = INITIAL_BACKOFF_MS;
        setStatus("connected");
        send(buildFilterAction("subscribe"));
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        const msg = parseMessage(event.data as string);
        if (!msg) return;

        if (msg.type === "entry") {
          const entry = msg as ActivityLogEntry;
          addEntry(entry);
          maybeShowToast(entry);
        } else if (msg.type === "lagged") {
          addSkipped((msg as ActivityLogLaggedMessage).skipped);
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus("disconnected");
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror, which triggers reconnect.
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect from cleanup close
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // stable — no deps, all state access via refs and getState()

  /* -- React to filter changes: debounced update_filter ------------------- */
  const levels = useActivityConsoleStore((s) => s.levels);
  const sources = useActivityConsoleStore((s) => s.sources);
  const mode = useActivityConsoleStore((s) => s.mode);
  const entityFilter = useActivityConsoleStore((s) => s.entityFilter);
  const searchText = useActivityConsoleStore((s) => s.searchText);

  useEffect(() => {
    // Skip if not connected
    if (status !== "connected") return;

    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    filterTimerRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(buildFilterAction("update_filter")));
      }
    }, FILTER_DEBOUNCE_MS);

    return () => {
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    };
  }, [levels, sources, mode, entityFilter, searchText, status]);

  return status;
}
