/**
 * Avatar dashboard content page — project/avatar picker
 * wrapping the AvatarDashboard feature component.
 */

import { ProjectAvatarPicker } from "@/components/domain";
import { AvatarDashboard } from "@/features/avatar-dashboard/AvatarDashboard";

export function AvatarDashboardPage() {
  return (
    <ProjectAvatarPicker
      title="Avatar Dashboard"
      description="View settings, generation history, and readiness status for a model."
    >
      {(_projectId, avatarId) => (
        <AvatarDashboard avatarId={avatarId} />
      )}
    </ProjectAvatarPicker>
  );
}
