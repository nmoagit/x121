import { useNavigate } from "@tanstack/react-router";

import { Dropdown } from "@/components/composite";
import { Avatar } from "@/components/primitives";
import { useAuthStore } from "@/stores/auth-store";
import { LogOut, Settings, User } from "@/tokens/icons";

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
        <span className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1 hover:bg-[var(--color-surface-tertiary)] transition-colors duration-[var(--duration-fast)]">
          <Avatar size="sm" name={user.username} />
          <span className="hidden text-sm font-medium text-[var(--color-text-primary)] sm:block">
            {user.username}
          </span>
          <User size={16} className="text-[var(--color-text-muted)] sm:hidden" />
        </span>
      }
      items={items}
      onSelect={handleSelect}
      align="right"
    />
  );
}
