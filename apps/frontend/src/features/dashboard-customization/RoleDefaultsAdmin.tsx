/**
 * RoleDefaultsAdmin -- admin panel for managing role-based default
 * dashboard layouts (PRD-89).
 *
 * Lists roles with their defaults. Click a role to edit its layout.
 */

import { useState } from "react";

import { Badge, Button, Input } from "@/components/primitives";
import { Card, CardBody, CardHeader } from "@/components/composite";
import { Edit3 } from "@/tokens/icons";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

import type { DashboardRoleDefault } from "./types";

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function RoleDefaultRow({
  roleDefault,
  onEdit,
}: {
  roleDefault: DashboardRoleDefault;
  onEdit: (roleName: string) => void;
}) {
  const widgetCount = roleDefault.layout_json.length;

  return (
    <div
      data-testid={`role-default-${roleDefault.role_name}`}
      className={cn(
        "flex items-center justify-between gap-4 px-4 py-3",
        "border-b border-[var(--color-border-default)] last:border-b-0",
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <Badge variant="info" size="sm">
          {roleDefault.role_name}
        </Badge>
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
          {widgetCount} widget{widgetCount !== 1 ? "s" : ""}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">
          Updated {formatDateTime(roleDefault.updated_at)}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={<Edit3 size={14} aria-hidden="true" />}
        onClick={() => onEdit(roleDefault.role_name)}
      >
        Edit
      </Button>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

interface RoleDefaultsAdminProps {
  roleDefaults: DashboardRoleDefault[];
  onEditRole: (roleName: string) => void;
}

export function RoleDefaultsAdmin({
  roleDefaults,
  onEditRole,
}: RoleDefaultsAdminProps) {
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? roleDefaults.filter((rd) =>
        rd.role_name.toLowerCase().includes(filter.toLowerCase()),
      )
    : roleDefaults;

  return (
    <div data-testid="role-defaults-admin">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">
              Role Default Layouts
            </span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {roleDefaults.length} role{roleDefaults.length !== 1 ? "s" : ""}
            </span>
          </div>
        </CardHeader>
        <CardBody>
          {/* Filter input */}
          {roleDefaults.length > 5 && (
            <div className="mb-3">
              <Input
                placeholder="Filter roles..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] py-4">
              {roleDefaults.length === 0
                ? "No role defaults configured."
                : "No roles match the filter."}
            </p>
          ) : (
            <div className="flex flex-col">
              {filtered.map((rd) => (
                <RoleDefaultRow
                  key={rd.id}
                  roleDefault={rd}
                  onEdit={onEditRole}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
