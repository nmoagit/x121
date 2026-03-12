import { Link, useParams } from "@tanstack/react-router";
import { AssignmentDashboard } from "@/features/character-review/AssignmentDashboard";
import { ChevronLeft } from "@/tokens/icons";

export function AssignmentDashboardPage() {
  const { projectId } = useParams({ strict: false });
  const id = Number(projectId);

  if (!id || Number.isNaN(id)) {
    return <div className="p-6 text-action-danger">Invalid project ID</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        to="/projects/$projectId"
        params={{ projectId: String(id) }}
        search={{ tab: undefined, group: undefined }}
        className="inline-flex items-center gap-1 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors w-fit"
      >
        <ChevronLeft size={16} />
        Back to Project
      </Link>
      <AssignmentDashboard projectId={id} />
    </div>
  );
}
