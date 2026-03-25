import { Chip } from "@/components/primitives/Chip";

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
 * Renders a single tag using the design system Chip component.
 */
export function TagChip({ tag, onRemove, size = "md", className }: TagChipProps) {
  const label = tag.namespace
    ? tag.display_name.slice(tag.namespace.length + 1)
    : tag.display_name;

  return (
    <Chip
      size={size === "sm" ? "sm" : "md"}
      color={tag.color}
      onRemove={onRemove}
      className={className}
    >
      {tag.namespace && (
        <span className="text-[var(--color-text-muted)] font-medium">{tag.namespace}:</span>
      )}
      {label}
    </Chip>
  );
}

/** Tag info with usage count, used by autocomplete suggestions and filter lists. */
interface TagWithCount extends TagInfo {
  usage_count: number;
}

export type { TagInfo, TagWithCount, TagChipProps };
