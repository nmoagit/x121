/**
 * Iframe-based sandbox for rendering extension panels (PRD-85).
 *
 * Renders extension content in a sandboxed iframe with `allow-scripts allow-forms`
 * (no allow-same-origin for security). Communicates with the extension via postMessage
 * for design tokens, context, settings, and API calls routed through ExtensionApiBridge.
 */

import { cn } from "@/lib/cn";
import { AlertCircle } from "@/tokens/icons";
import { useCallback, useEffect, useRef, useState } from "react";

import { ExtensionApiBridge } from "./ExtensionApiBridge";
import type { Permission, PlatformContext } from "./types";

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const SANDBOX_ALLOW = "allow-scripts allow-forms";

const DESIGN_TOKEN_PREFIX = "--color-";
const SPACING_TOKEN_PREFIX = "--spacing-";
const RADIUS_TOKEN_PREFIX = "--radius-";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ExtensionSandboxProps {
  extensionId: number;
  extensionName: string;
  entryPoint: string;
  permissions: Permission[];
  settings?: Record<string, unknown>;
  context?: PlatformContext;
  className?: string;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Collect design tokens from the document root to forward to the iframe. */
function collectDesignTokens(): Record<string, string> {
  const tokens: Record<string, string> = {};
  const root = getComputedStyle(document.documentElement);

  // Iterate over declared CSS custom properties on :root.
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) {
        if (
          rule instanceof CSSStyleRule &&
          rule.selectorText === ":root"
        ) {
          for (const prop of rule.style) {
            if (
              prop.startsWith(DESIGN_TOKEN_PREFIX) ||
              prop.startsWith(SPACING_TOKEN_PREFIX) ||
              prop.startsWith(RADIUS_TOKEN_PREFIX)
            ) {
              tokens[prop] = root.getPropertyValue(prop).trim();
            }
          }
        }
      }
    } catch {
      // Cross-origin stylesheets will throw -- skip safely.
    }
  }

  return tokens;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ExtensionSandbox({
  extensionId,
  extensionName,
  entryPoint,
  permissions,
  settings,
  context,
  className,
}: ExtensionSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const bridgeRef = useRef<ExtensionApiBridge | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sendInitMessage = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    try {
      const designTokens = collectDesignTokens();

      iframe.contentWindow.postMessage(
        {
          type: "extension_init",
          extensionId,
          extensionName,
          designTokens,
          context: context ?? {},
          settings: settings ?? {},
        },
        "*",
      );
    } catch {
      setError(`Failed to initialize extension: ${extensionName}`);
    }
  }, [extensionId, extensionName, context, settings]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const bridge = new ExtensionApiBridge(iframe, extensionId, permissions);
    bridgeRef.current = bridge;
    bridge.start();

    return () => {
      bridge.stop();
      bridgeRef.current = null;
    };
  }, [extensionId, permissions]);

  const handleIframeLoad = useCallback(() => {
    sendInitMessage();
  }, [sendInitMessage]);

  const handleIframeError = useCallback(() => {
    setError(`Failed to load extension: ${extensionName}`);
  }, [extensionName]);

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 p-4",
          "bg-[var(--color-surface-secondary)] rounded-[var(--radius-md)]",
          "border border-[var(--color-border-error)]",
          className,
        )}
      >
        <AlertCircle
          size={24}
          className="text-[var(--color-action-danger)]"
          aria-hidden="true"
        />
        <p className="text-sm text-[var(--color-text-secondary)] text-center">
          {error}
        </p>
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      src={entryPoint}
      sandbox={SANDBOX_ALLOW}
      title={`Extension: ${extensionName}`}
      onLoad={handleIframeLoad}
      onError={handleIframeError}
      className={cn("w-full h-full border-0", className)}
    />
  );
}
