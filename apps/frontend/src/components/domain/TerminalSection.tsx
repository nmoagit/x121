/**
 * Reusable terminal-style section panel with header and body.
 *
 * Composes the TERMINAL_PANEL, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, and
 * TERMINAL_BODY constants from ui-classes into a single component.
 */

import { cn } from "@/lib/cn";
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
}

export function TerminalSection({ title, actions, children, className }: TerminalSectionProps) {
  return (
    <div className={cn(TERMINAL_PANEL, className)}>
      <div className={cn(TERMINAL_HEADER, actions != null && "flex items-center justify-between")}>
        <span className={TERMINAL_HEADER_TITLE}>{title}</span>
        {actions}
      </div>
      <div className={TERMINAL_BODY}>{children}</div>
    </div>
  );
}
