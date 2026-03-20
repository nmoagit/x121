import { WireframeLoader } from "@/components/primitives";

export function PageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <WireframeLoader size={64} />
    </div>
  );
}
