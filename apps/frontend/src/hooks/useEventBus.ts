/**
 * Event bus subscription hook.
 *
 * Provides a typed interface for subscribing to WebSocket events.
 * The real implementation will come from PRD-010 (Event Bus).
 * This version uses a lightweight in-memory emitter so features
 * can integrate now and swap seamlessly later.
 */

import { useEffect, useRef } from "react";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

type EventHandler<T = unknown> = (payload: T) => void;

interface Listener {
  event: string;
  handler: EventHandler;
}

/* --------------------------------------------------------------------------
   Global emitter (singleton)
   -------------------------------------------------------------------------- */

const listeners: Listener[] = [];

/** Emit an event to all registered listeners. */
export function emitEvent<T = unknown>(event: string, payload: T): void {
  for (const listener of listeners) {
    if (listener.event === event) {
      listener.handler(payload);
    }
  }
}

/** Subscribe to a named event. Automatically unsubscribes on unmount. */
export function useEventBus<T = unknown>(event: string, handler: EventHandler<T>): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const wrapper: EventHandler = (payload) => {
      handlerRef.current(payload as T);
    };

    const entry: Listener = { event, handler: wrapper };
    listeners.push(entry);

    return () => {
      const index = listeners.indexOf(entry);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }, [event]);
}
