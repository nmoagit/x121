import { useSetPageTitle } from "@/hooks/useSetPageTitle";
import { ServiceStatusGrid } from "@/features/system-health";

export function SystemHealthPage() {
  useSetPageTitle("System Health", "Service status and uptime monitoring.");

  return (
    <div className="min-h-full">
      <ServiceStatusGrid />
    </div>
  );
}
