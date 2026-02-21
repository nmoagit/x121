/**
 * View module registry for the panel system (PRD-30).
 *
 * Provides a central registry where feature modules register themselves
 * as available panel content types. Panels reference view modules by key.
 */

import type { ComponentType, LazyExoticComponent } from "react";

/** A view module registration entry. */
export interface ViewModuleRegistration {
  /** Unique key used to reference this module in panel state. */
  key: string;
  /** Human-readable label shown in the UI. */
  label: string;
  /** Icon component for the module (typically from lucide-react). */
  icon: ComponentType;
  /** Lazily-loaded component rendered inside the panel. */
  component: LazyExoticComponent<ComponentType<Record<string, unknown>>>;
  /** Whether multiple panels can use the same module simultaneously. */
  allowMultiple: boolean;
}

/** Internal map of registered view modules. */
const registry = new Map<string, ViewModuleRegistration>();

/**
 * Register a view module so it can be assigned to panels.
 *
 * Calling this with an existing key overwrites the previous registration.
 */
export function registerViewModule(module: ViewModuleRegistration): void {
  registry.set(module.key, module);
}

/** Look up a view module by its key. */
export function getViewModule(key: string): ViewModuleRegistration | undefined {
  return registry.get(key);
}

/** Return all registered view modules. */
export function getAllViewModules(): ViewModuleRegistration[] {
  return Array.from(registry.values());
}

/** Clear all registered view modules (useful for testing). */
export function clearViewModules(): void {
  registry.clear();
}
