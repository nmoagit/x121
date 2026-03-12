import { usePageTitle } from "@/app/usePageTitle";
import { UserMenu } from "@/app/UserMenu";
import { useSidebar } from "@/app/useSidebar";
import { cn } from "@/lib/cn";
import { Menu } from "@/tokens/icons";

/** Shared icon-button styling used by header toolbar buttons. */
const ICON_BTN = [
  "rounded-[var(--radius-md)] p-1.5",
  "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]",
  "transition-colors duration-[var(--duration-fast)]",
].join(" ");

export function Header() {
  const { openMobile } = useSidebar();
  const title = usePageTitle((s) => s.title);
  const description = usePageTitle((s) => s.description);

  return (
    <header
      className={cn(
        "flex h-11 shrink-0 items-center justify-between gap-4 border-b px-4",
        "border-[var(--color-border-default)] bg-[var(--color-surface-secondary)]",
      )}
    >
      {/* Left: mobile hamburger + page title */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={openMobile}
          className={cn(ICON_BTN, "lg:hidden")}
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        {title && (
          <div className="flex items-baseline gap-2 min-w-0 truncate">
            <span className="text-sm font-medium text-[var(--color-text-primary)] shrink-0">
              {title}
            </span>
            {description && (
              <>
                <span className="text-[var(--color-text-muted)] text-xs hidden sm:inline">—</span>
                <span className="text-xs text-[var(--color-text-muted)] truncate hidden sm:inline">
                  {description}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right: user menu */}
      <div className="flex items-center gap-2 shrink-0">
        <UserMenu />
      </div>
    </header>
  );
}
