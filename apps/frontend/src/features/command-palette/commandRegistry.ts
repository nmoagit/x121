/**
 * Command registry for the command palette (PRD-31).
 *
 * Maintains a registry of commands that can be searched and executed
 * from the Cmd+K palette.
 */

import type { PaletteCommand } from "./types";

export class CommandRegistry {
  private commands = new Map<string, PaletteCommand>();

  /** Register a command. Overwrites if the id already exists. */
  register(command: PaletteCommand): void {
    this.commands.set(command.id, command);
  }

  /** Unregister a command by id. */
  unregister(id: string): void {
    this.commands.delete(id);
  }

  /** Get all registered commands. */
  getAll(): PaletteCommand[] {
    return Array.from(this.commands.values());
  }

  /** Get commands filtered by category. */
  getByCategory(category: string): PaletteCommand[] {
    return this.getAll().filter((cmd) => cmd.category === category);
  }

  /**
   * Search commands by query string.
   *
   * Uses case-insensitive substring matching on label and category.
   * Results where the label starts with the query are ranked first.
   */
  search(query: string): PaletteCommand[] {
    if (!query.trim()) {
      return this.getAll();
    }

    const q = query.toLowerCase();

    return this.getAll()
      .filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(q) ||
          cmd.category.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        const aStarts = a.label.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.label.toLowerCase().startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        return a.label.localeCompare(b.label);
      });
  }
}

/** Singleton command registry instance. */
export const commandRegistry = new CommandRegistry();
