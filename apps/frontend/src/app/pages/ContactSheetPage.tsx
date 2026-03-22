/**
 * Avatar face contact sheet page (PRD-103).
 *
 * Provides a avatar selector, then renders the contact sheet grid.
 */

import { useState } from "react";

import { PageHeader, Stack } from "@/components/layout";
import { Button, Input } from "@/components/primitives";

import { ContactSheetPage as ContactSheet } from "@/features/contact-sheet";

export function ContactSheetPage() {
  const [avatarId, setAvatarId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");

  const handleLoad = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setAvatarId(parsed);
    }
  };

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <PageHeader
          title="Contact Sheet"
          description="View model face grids across scenes for consistency review."
        />

        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Input
              label="Avatar ID"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter model ID"
              min="1"
            />
          </div>
          <Button variant="primary" onClick={handleLoad} disabled={!inputValue.trim()}>
            Load
          </Button>
        </Stack>

        {avatarId !== null ? (
          <ContactSheet avatarId={avatarId} avatarName={`Model #${avatarId}`} />
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter a model ID above to generate a contact sheet.
          </p>
        )}
      </Stack>
    </div>
  );
}
