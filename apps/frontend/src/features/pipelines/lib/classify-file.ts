/**
 * File classification using pipeline import rules (PRD-141).
 *
 * Mirrors the backend classify_file logic but in TypeScript.
 * When import rules are available, uses regex patterns for matching.
 * Falls back to simple substring matching against slot names.
 */

import type { ImportRules } from "../types";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface FileClassification {
  type: "seed" | "video" | "metadata" | "unknown";
  /** The matched slot name (for seed) or metadata type (for metadata). */
  slot?: string;
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

/** Test a filename against a regex pattern string, respecting case sensitivity. */
function testPattern(filename: string, pattern: string, caseSensitive: boolean): boolean {
  try {
    const flags = caseSensitive ? "" : "i";
    return new RegExp(pattern, flags).test(filename);
  } catch {
    // Invalid regex — fall back to substring match
    const a = caseSensitive ? filename : filename.toLowerCase();
    const b = caseSensitive ? pattern : pattern.toLowerCase();
    return a.includes(b);
  }
}

/** Check if a filename has one of the given extensions. */
function hasExtension(filename: string, extensions: string[]): boolean {
  if (extensions.length === 0) return true;
  const lower = filename.toLowerCase();
  return extensions.some((ext) => {
    const normalized = ext.startsWith(".") ? ext.toLowerCase() : `.${ext.toLowerCase()}`;
    return lower.endsWith(normalized);
  });
}

/* --------------------------------------------------------------------------
   Main classifier
   -------------------------------------------------------------------------- */

/**
 * Classify a file using pipeline import rules.
 * Returns the classification type and optional slot/type name.
 */
export function classifyFileWithRules(filename: string, rules: ImportRules): FileClassification {
  const caseSensitive = rules.case_sensitive;

  // Check seed patterns first (most specific)
  for (const sp of rules.seed_patterns) {
    if (hasExtension(filename, sp.extensions) && testPattern(filename, sp.pattern, caseSensitive)) {
      return { type: "seed", slot: sp.slot };
    }
  }

  // Check metadata patterns
  for (const mp of rules.metadata_patterns) {
    if (testPattern(filename, mp.pattern, caseSensitive)) {
      return { type: "metadata", slot: mp.type };
    }
  }

  // Check video patterns
  for (const vp of rules.video_patterns) {
    if (hasExtension(filename, vp.extensions) && testPattern(filename, vp.pattern, caseSensitive)) {
      return { type: "video" };
    }
  }

  return { type: "unknown" };
}
