/**
 * Context menu injection for extensions (PRD-85).
 *
 * Provides a hook to retrieve extension-registered menu items for a given
 * entity type, and a component to render individual extension menu items.
 */

import { cn } from "@/lib/cn";
import { useMemo } from "react";

import { useExtensionRegistry } from "./hooks/use-extensions";
import type { MenuItemRegistration } from "./types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface ExtensionMenuItemData extends MenuItemRegistration {
  extensionId: number;
  extensionName: string;
}

interface ExtensionMenuItemProps {
  item: ExtensionMenuItemData;
  entityId: number;
  onClick: (extensionId: number, menuItemId: string, entityId: number) => void;
}

/* --------------------------------------------------------------------------
   Hook: useExtensionMenuItems
   -------------------------------------------------------------------------- */

/**
 * Returns extension-registered context menu items for a given entity type.
 *
 * Filters the enabled extension registry for menu items that declare the
 * specified entity type.
 */
export function useExtensionMenuItems(
  entityType: string,
): ExtensionMenuItemData[] {
  const { data: extensions } = useExtensionRegistry();

  return useMemo(() => {
    if (!extensions) return [];

    return extensions.flatMap((ext) =>
      ext.manifest_json.menu_items
        .filter((item) => item.entity_types.includes(entityType))
        .map((item) => ({
          ...item,
          extensionId: ext.id,
          extensionName: ext.name,
        })),
    );
  }, [extensions, entityType]);
}

/* --------------------------------------------------------------------------
   Component: ExtensionMenuItem
   -------------------------------------------------------------------------- */

/**
 * Renders a single extension-injected menu item styled to match the
 * platform Dropdown menu items.
 */
export function ExtensionMenuItem({
  item,
  entityId,
  onClick,
}: ExtensionMenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        "flex items-center gap-2 w-full px-3 py-2 text-sm text-left",
        "text-[var(--color-text-primary)]",
        "hover:bg-[var(--color-surface-tertiary)]",
        "transition-colors duration-[var(--duration-instant)]",
      )}
      onClick={() => onClick(item.extensionId, item.id, entityId)}
    >
      <span className="truncate">{item.label}</span>
      <span className="ml-auto text-xs text-[var(--color-text-muted)] truncate">
        {item.extensionName}
      </span>
    </button>
  );
}
