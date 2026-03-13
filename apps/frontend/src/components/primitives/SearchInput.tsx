import { cn } from "@/lib/cn";
import { Search } from "@/tokens/icons";
import { forwardRef } from "react";
import type { InputHTMLAttributes } from "react";

type SearchInputSize = "sm" | "md";

const SIZE_CLASSES: Record<SearchInputSize, string> = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-3 py-2 text-base",
};

const ICON_SIZES: Record<SearchInputSize, number> = {
  sm: 14,
  md: 16,
};

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  /** Visual size matching Button sizes. Default "md". */
  size?: SearchInputSize;
  /** Show a search icon inside the input. Default true. */
  showIcon?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { size = "md", showIcon = true, className, ...rest },
  ref,
) {
  const iconSize = ICON_SIZES[size];
  const iconPadding = showIcon ? "pl-9" : "";

  return (
    <div className={cn("relative", className)}>
      {showIcon && (
        <Search
          size={iconSize}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
          aria-hidden="true"
        />
      )}
      <input
        ref={ref}
        type="search"
        className={cn(
          "w-full",
          SIZE_CLASSES[size],
          iconPadding,
          "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
          "border border-[var(--color-border-default)] rounded-[var(--radius-md)]",
          "placeholder:text-[var(--color-text-muted)]",
          "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-default)]",
          "focus:outline-none focus:ring-2 focus:ring-offset-0 focus:ring-[var(--color-border-focus)]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
        {...rest}
      />
    </div>
  );
});
