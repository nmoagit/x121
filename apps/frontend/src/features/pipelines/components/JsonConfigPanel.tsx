/**
 * Terminal-styled panel for editing a JSON configuration field.
 */

import { Stack } from "@/components/layout";
import { TERMINAL_BODY, TERMINAL_HEADER, TERMINAL_HEADER_TITLE, TERMINAL_LABEL, TERMINAL_PANEL, TERMINAL_TEXTAREA } from "@/lib/ui-classes";

interface JsonConfigPanelProps {
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}

export function JsonConfigPanel({ title, value, onChange, placeholder, rows = 6 }: JsonConfigPanelProps) {
  return (
    <div className={TERMINAL_PANEL}>
      <div className={TERMINAL_HEADER}>
        <h2 className={TERMINAL_HEADER_TITLE}>{title}</h2>
      </div>
      <div className={TERMINAL_BODY}>
        <Stack gap={2}>
          <span className={TERMINAL_LABEL}>JSON configuration</span>
          <textarea
            className={TERMINAL_TEXTAREA}
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
        </Stack>
      </div>
    </div>
  );
}
