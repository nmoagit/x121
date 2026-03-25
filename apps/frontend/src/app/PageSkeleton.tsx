import { ContextLoader } from "@/components/primitives";

export function PageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <ContextLoader size={64} />
    </div>
  );
}
