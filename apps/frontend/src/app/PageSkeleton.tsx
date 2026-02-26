import { Spinner } from "@/components/primitives";

export function PageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
