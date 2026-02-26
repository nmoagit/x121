import { UserMenu } from "@/app/UserMenu";
import { useSidebar } from "@/app/useSidebar";
import { cn } from "@/lib/cn";
import { useTheme } from "@/theme";
import { Menu, Moon, Sun } from "@/tokens/icons";

/** Shared icon-button styling used by header toolbar buttons. */
const ICON_BTN = [
  "rounded-[var(--radius-md)] p-1.5",
  "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-tertiary)] hover:text-[var(--color-text-primary)]",
  "transition-colors duration-[var(--duration-fast)]",
].join(" ");

export function Header() {
  const { toggle, openMobile } = useSidebar();
  const { colorScheme, setColorScheme } = useTheme();

  const toggleTheme = () => {
    setColorScheme(colorScheme === "dark" ? "light" : "dark");
  };

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4",
        "border-[var(--color-border-default)] bg-[var(--color-surface-primary)]",
      )}
    >
      {/* Left: sidebar toggles */}
      <div className="flex items-center gap-2">
        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={openMobile}
          className={cn(ICON_BTN, "lg:hidden")}
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>

        {/* Desktop collapse toggle */}
        <button
          type="button"
          onClick={toggle}
          className={cn(ICON_BTN, "hidden lg:flex")}
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Right: theme + user */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleTheme}
          className={ICON_BTN}
          aria-label={colorScheme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {colorScheme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
