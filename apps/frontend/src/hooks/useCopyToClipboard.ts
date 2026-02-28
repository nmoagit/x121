/**
 * Hook that copies text to the clipboard and shows a temporary "copied" state.
 *
 * Returns `{ copied, copy }` where `copied` resets to false after `resetMs`
 * (default 2000 ms).
 */

import { useCallback, useRef, useState } from "react";

const DEFAULT_RESET_MS = 2000;

export function useCopyToClipboard(resetMs = DEFAULT_RESET_MS) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => setCopied(false), resetMs);
      });
    },
    [resetMs],
  );

  return { copied, copy } as const;
}
