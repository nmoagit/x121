import { Button } from "@/components/primitives";
import { Link } from "@tanstack/react-router";

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <h1 className="text-6xl font-bold text-[var(--color-text-muted)]">404</h1>
      <p className="text-lg text-[var(--color-text-secondary)]">Page not found</p>
      <Link to="/">
        <Button variant="primary">Back to Dashboard</Button>
      </Link>
    </div>
  );
}
