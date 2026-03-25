/**
 * Reusable terminal-style section panel with header and body.
 *
 * Composes the TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, and
 * TERMINAL_BODY constants from ui-classes into a single component.
 * Supports optional collapsible behavior.
 */

import { useState } from "react";

import { cn } from "@/lib/cn";
import { ChevronDown, ChevronRight } from "@/tokens/icons";
import {
  TERMINAL_BODY,
  TERMINAL_HEADER,
  TERMINAL_HEADER_TITLE,
  TERMINAL_PANEL,
} from "@/lib/ui-classes";

interface TerminalSectionProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** When true, section can be collapsed/expanded by clicking the header. */
  collapsible?: boolean;
  /** Initial collapsed state (only used when collapsible). @default false */
  defaultCollapsed?: boolean;
}

export function TerminalSection({ title, actions, children, className, collapsible, defaultCollapsed = false }: TerminalSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className={cn(TERMINAL_PANEL, className)}>
      <div
        className={cn(TERMINAL_HEADER, "flex items-center justify-between", collapsible && "cursor-pointer select-none")}
        onClick={collapsible ? () => setCollapsed((v) => !v) : undefined}
      >
        <span className={cn(TERMINAL_HEADER_TITLE, "flex items-center gap-1.5")}>
          {collapsible && (collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />)}
          {title}
        </span>
        {actions && <div onClick={(e) => e.stopPropagation()}>{actions}</div>}
      </div>
      {(!collapsible || !collapsed) && (
        <div className={TERMINAL_BODY}>{children}</div>
      )}
    </div>
  );
}
