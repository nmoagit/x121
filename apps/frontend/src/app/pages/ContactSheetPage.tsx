/**
 * Character face contact sheet page (PRD-103).
 *
 * Provides a character selector, then renders the contact sheet grid.
 */

import { useState } from "react";

import { Stack } from "@/components/layout";
import { Button, Input } from "@/components/primitives";

import { ContactSheetPage as ContactSheet } from "@/features/contact-sheet";

export function ContactSheetPage() {
  const [characterId, setCharacterId] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");

  const handleLoad = () => {
    const parsed = Number.parseInt(inputValue, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setCharacterId(parsed);
    }
  };

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Contact Sheet</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            View character face grids across scenes for consistency review.
          </p>
        </div>

        <Stack direction="horizontal" gap={3} align="end">
          <div className="w-48">
            <Input
              label="Character ID"
              type="number"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Enter character ID"
              min="1"
            />
          </div>
          <Button variant="primary" onClick={handleLoad} disabled={!inputValue.trim()}>
            Load
          </Button>
        </Stack>

        {characterId !== null ? (
          <ContactSheet characterId={characterId} characterName={`Character #${characterId}`} />
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">
            Enter a character ID above to generate a contact sheet.
          </p>
        )}
      </Stack>
    </div>
  );
}
