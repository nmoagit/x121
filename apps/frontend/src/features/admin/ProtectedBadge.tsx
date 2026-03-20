interface ProtectedBadgeProps {
  isActive: boolean;
}

/**
 * Small terminal-style status indicator for protection rules.
 */
export function ProtectedBadge({ isActive }: ProtectedBadgeProps) {
  return (
    <span className={`font-mono text-[10px] uppercase ${isActive ? "text-green-400" : "text-[var(--color-text-muted)]"}`}>
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}
