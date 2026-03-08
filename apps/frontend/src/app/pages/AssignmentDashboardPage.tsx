import { useParams } from "@tanstack/react-router";
import { AssignmentDashboard } from "@/features/character-review/AssignmentDashboard";

export function AssignmentDashboardPage() {
  const { projectId } = useParams({ strict: false });
  const id = Number(projectId);

  if (!id || Number.isNaN(id)) {
    return <div className="p-6 text-action-danger">Invalid project ID</div>;
  }

  return <AssignmentDashboard projectId={id} />;
}
