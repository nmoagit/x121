/**
 * Offline status banner (PRD-55).
 *
 * Shows a persistent banner when the device is offline, along with
 * the number of pending offline actions waiting to sync.
 */

import { useEffect, useState } from "react";

import { cn } from "@/lib/cn";
import { AlertTriangle, Cloud } from "@/tokens/icons";
import { iconSizes } from "@/tokens/icons";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface OfflineIndicatorProps {
  pendingSyncCount: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function OfflineIndicator({ pendingSyncCount }: OfflineIndicatorProps) {
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    function handleOnline() { setIsOnline(true); }
    function handleOffline() { setIsOnline(false); }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline && pendingSyncCount === 0) return null;

  return (
    <div
      data-testid="offline-indicator"
      className={cn(
        "flex items-center gap-2 px-4 py-2 text-sm font-medium",
        !isOnline
          ? "bg-[var(--color-action-danger)]/15 text-[var(--color-action-danger)]"
          : "bg-[var(--color-action-warning)]/15 text-[var(--color-action-warning)]",
      )}
    >
      {!isOnline ? (
        <>
          <AlertTriangle size={iconSizes.sm} aria-hidden="true" />
          <span>You are offline</span>
        </>
      ) : (
        <>
          <Cloud size={iconSizes.sm} aria-hidden="true" />
          <span>Syncing...</span>
        </>
      )}

      {pendingSyncCount > 0 && (
        <span className="ml-auto text-xs opacity-80">
          {pendingSyncCount} pending {pendingSyncCount === 1 ? "action" : "actions"}
        </span>
      )}
    </div>
  );
}
