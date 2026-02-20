import { cn } from "@/lib/cn";
import { Image } from "@/tokens/icons";
import { StatusBadge } from "./StatusBadge";

type AspectRatio = "16:9" | "4:3" | "1:1";

interface ThumbnailCardProps {
  src?: string;
  alt?: string;
  title: string;
  subtitle?: string;
  status?: string;
  aspectRatio?: AspectRatio;
  onClick?: () => void;
  className?: string;
}

const ASPECT_CLASSES: Record<AspectRatio, string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
};

export function ThumbnailCard({
  src,
  alt,
  title,
  subtitle,
  status,
  aspectRatio = "16:9",
  onClick,
  className,
}: ThumbnailCardProps) {
  const isInteractive = Boolean(onClick);

  return (
    <div
      className={cn(
        "group rounded-[var(--radius-lg)] overflow-hidden",
        "bg-[var(--color-surface-secondary)] border border-[var(--color-border-default)]",
        "transition-all duration-[var(--duration-fast)] ease-[var(--ease-default)]",
        isInteractive && "cursor-pointer hover:shadow-[var(--shadow-md)] hover:scale-[1.02]",
        className,
      )}
      onClick={onClick}
      onKeyDown={
        isInteractive
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      tabIndex={isInteractive ? 0 : undefined}
      role={isInteractive ? "button" : undefined}
    >
      <div className={cn("relative overflow-hidden", ASPECT_CLASSES[aspectRatio])}>
        {src ? (
          <img src={src} alt={alt ?? title} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center w-full h-full bg-[var(--color-surface-tertiary)]">
            <Image size={32} className="text-[var(--color-text-muted)]" aria-hidden="true" />
          </div>
        )}

        {status && (
          <div className="absolute top-2 right-2">
            <StatusBadge status={status} size="sm" />
          </div>
        )}
      </div>

      <div className="p-[var(--spacing-3)]">
        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  );
}
