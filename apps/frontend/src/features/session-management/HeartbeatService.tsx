/**
 * Heartbeat service component (PRD-98).
 *
 * Invisible component that sends a heartbeat POST every 60 seconds.
 * Mount in the app layout so it runs for all authenticated users.
 */

import { useHeartbeat } from "./hooks/use-session-management";

export function HeartbeatService() {
  useHeartbeat();
  return null;
}
