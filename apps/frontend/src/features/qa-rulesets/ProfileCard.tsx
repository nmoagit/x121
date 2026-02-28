/**
 * ProfileCard — displays a single QA profile (PRD-91).
 *
 * Shows name, description, builtin badge, threshold summary count,
 * and optional edit/delete action buttons.
 */

import { Badge, Button } from "@/components/primitives";
import { Card, CardBody } from "@/components/composite";

import type { QaProfile } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ProfileCardProps {
  profile: QaProfile;
  onEdit?: () => void;
  onDelete?: () => void;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ProfileCard({ profile, onEdit, onDelete }: ProfileCardProps) {
  const thresholdCount = Object.keys(profile.thresholds).length;

  return (
    <div data-testid={`profile-card-${profile.id}`}>
      <Card elevation="flat" padding="sm">
        <CardBody className="space-y-2">
          {/* Header row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h4
                data-testid={`profile-name-${profile.id}`}
                className="text-sm font-semibold text-[var(--color-text-primary)] truncate"
              >
                {profile.name}
              </h4>
              {profile.is_builtin && (
                <span data-testid={`builtin-badge-${profile.id}`}>
                  <Badge variant="info" size="sm">
                    Built-in
                  </Badge>
                </span>
              )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onEdit && (
              <Button
                data-testid={`profile-edit-${profile.id}`}
                variant="ghost"
                size="sm"
                onClick={onEdit}
              >
                Edit
              </Button>
            )}
            {onDelete && !profile.is_builtin && (
              <Button
                data-testid={`profile-delete-${profile.id}`}
                variant="ghost"
                size="sm"
                onClick={onDelete}
              >
                Delete
              </Button>
            )}
          </div>
        </div>

        {/* Description */}
        {profile.description && (
          <p className="text-xs text-[var(--color-text-muted)] line-clamp-2">
            {profile.description}
          </p>
        )}

        {/* Threshold summary */}
        <p
          data-testid={`profile-threshold-count-${profile.id}`}
          className="text-xs text-[var(--color-text-secondary)]"
        >
          {thresholdCount} {thresholdCount === 1 ? "metric" : "metrics"}{" "}
          configured
        </p>
        </CardBody>
      </Card>
    </div>
  );
}
