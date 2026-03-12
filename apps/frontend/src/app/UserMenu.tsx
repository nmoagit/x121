import { useNavigate } from "@tanstack/react-router";

import { Dropdown } from "@/components/composite";
import { Avatar } from "@/components/primitives";
import { useAuthStore } from "@/stores/auth-store";
import { useTheme } from "@/theme";
import { LogOut, Moon, Settings, Sun, SunMoon } from "@/tokens/icons";

function ThemeToggle() {
  const { colorScheme, setColorScheme } = useTheme();

  const options: { value: "light" | "dark" | "system"; icon: React.ReactNode; label: string }[] = [
    { value: "dark", icon: <Moon size={14} />, label: "Dark" },
    { value: "light", icon: <Sun size={14} />, label: "Light" },
    { value: "system", icon: <SunMoon size={14} />, label: "System" },
  ];

  // Map "system" to actual preference for active state
  const active = colorScheme;

  return (
    <div className="grid grid-cols-3 rounded-[var(--radius-md)] bg-[var(--color-surface-tertiary)] p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setColorScheme(opt.value === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : opt.value);
          }}
          className={`flex items-center justify-center rounded-[var(--radius-sm)] py-1.5 text-xs transition-colors ${
            active === opt.value || (opt.value === "system" && active !== "dark" && active !== "light")
              ? "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
          aria-label={opt.label}
          title={opt.label}
        >
          {opt.icon}
        </button>
      ))}
    </div>
  );
}

export function UserMenu() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  if (!user) return null;

  const items = [
    {
      label: "Settings",
      value: "settings",
      icon: <Settings size={16} />,
    },
    {
      label: "Logout",
      value: "logout",
      icon: <LogOut size={16} />,
      danger: true,
    },
  ];

  const handleSelect = async (value: string) => {
    if (value === "logout") {
      await logout();
      navigate({ to: "/login" });
    } else if (value === "settings") {
      navigate({ to: "/settings/shortcuts" });
    }
  };

  return (
    <Dropdown
      trigger={
        <span className="flex items-center rounded-full hover:ring-2 hover:ring-[var(--color-surface-tertiary)] transition-all duration-[var(--duration-fast)]">
          <Avatar size="sm" name={user.username} />
        </span>
      }
      header={
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {user.username}
          </span>
          <ThemeToggle />
        </div>
      }
      items={items}
      onSelect={handleSelect}
      align="right"
    />
  );
}
