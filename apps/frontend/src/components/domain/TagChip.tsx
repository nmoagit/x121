import { cn } from "@/lib/cn";

interface TagInfo {
  id: number;
  name: string;
  display_name: string;
  namespace: string | null;
  color: string | null;
}

interface TagChipProps {
  tag: TagInfo;
  onRemove?: () => void;
  size?: "sm" | "md";
  className?: string;
}

/**
 * Renders a single tag as a compact chip with optional color and remove button.
 *
 * If the tag has a namespace, it is shown as a subtle prefix before the label.
 * If the tag has a color, it is used as the left border accent.
 */
export function TagChip({ tag, onRemove, size = "md", className }: TagChipProps) {
  const label = tag.namespace
    ? tag.display_name.slice(tag.namespace.length + 1)
    : tag.display_name;

  const sizeClasses = size === "sm" ? "text-xs px-1.5 py-0.5 gap-1" : "text-sm px-2 py-0.5 gap-1.5";

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[var(--radius-full)]",
        "bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]",
        "border border-[var(--color-border-default)]",
        "transition-colors duration-150",
        sizeClasses,
        className,
      )}
      style={tag.color ? { borderLeftColor: tag.color, borderLeftWidth: "3px" } : undefined}
    >
      {tag.namespace && (
        <span className="text-[var(--color-text-muted)] font-medium">{tag.namespace}:</span>
      )}
      <span>{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className={cn(
            "ml-0.5 rounded-full leading-none",
            "text-[var(--color-text-muted)] hover:text-[var(--color-action-danger)]",
            "transition-colors duration-150",
            "focus:outline-none focus:ring-1 focus:ring-[var(--color-border-focus)]",
          )}
          aria-label={`Remove tag ${tag.display_name}`}
        >
          <svg
            width={size === "sm" ? 12 : 14}
            height={size === "sm" ? 12 : 14}
            viewBox="0 0 14 14"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M4 4L10 10M10 4L4 10"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}
    </span>
  );
}

/** Tag info with usage count, used by autocomplete suggestions and filter lists. */
interface TagWithCount extends TagInfo {
  usage_count: number;
}

export type { TagInfo, TagWithCount, TagChipProps };
