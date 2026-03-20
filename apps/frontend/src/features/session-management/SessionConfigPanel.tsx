/**
 * Session configuration editor panel (PRD-98).
 *
 * Lists all session config keys with editable values and description tooltips.
 */

import { useCallback, useState } from "react";

import { Card, CardBody, CardHeader } from "@/components/composite/Card";
import { Button, Input, Tooltip ,  WireframeLoader } from "@/components/primitives";
import { Info } from "@/tokens/icons";

import { useSessionConfigs, useUpdateConfig } from "./hooks/use-session-management";
import type { SessionConfig } from "./types";

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function SessionConfigPanel() {
  const { data: configs, isLoading, error } = useSessionConfigs();
  const updateMutation = useUpdateConfig();
  const [editState, setEditState] = useState<Record<string, string>>({});

  const handleChange = useCallback((key: string, value: string) => {
    setEditState((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(
    (config: SessionConfig) => {
      const newValue = editState[config.key];
      if (newValue === undefined || newValue === config.value) return;

      updateMutation.mutate(
        { key: config.key, value: newValue },
        {
          onSuccess: () => {
            setEditState((prev) => {
              const next = { ...prev };
              delete next[config.key];
              return next;
            });
          },
        },
      );
    },
    [editState, updateMutation],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <WireframeLoader size={64} />
      </div>
    );
  }

  if (error) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
        Failed to load session configuration.
      </p>
    );
  }

  if (!configs || configs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
        No configuration entries found.
      </p>
    );
  }

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
          Session Configuration
        </h3>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          {configs.map((config) => (
            <ConfigRow
              key={config.key}
              config={config}
              editValue={editState[config.key]}
              onChange={handleChange}
              onSave={handleSave}
              saving={updateMutation.isPending}
            />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Config row sub-component
   -------------------------------------------------------------------------- */

interface ConfigRowProps {
  config: SessionConfig;
  editValue: string | undefined;
  onChange: (key: string, value: string) => void;
  onSave: (config: SessionConfig) => void;
  saving: boolean;
}

function ConfigRow({ config, editValue, onChange, onSave, saving }: ConfigRowProps) {
  const currentValue = editValue ?? config.value;
  const isDirty = editValue !== undefined && editValue !== config.value;

  return (
    <div className="flex items-end gap-3">
      <div className="flex-1">
        <div className="mb-1 flex items-center gap-1">
          <span className="text-sm font-medium text-[var(--color-text-secondary)]">
            {config.key}
          </span>
          {config.description && (
            <Tooltip content={config.description} side="right">
              <Info size={14} className="text-[var(--color-text-muted)]" />
            </Tooltip>
          )}
        </div>
        <Input
          value={currentValue}
          onChange={(e) => onChange(config.key, e.target.value)}
        />
      </div>
      <Button
        variant="primary"
        size="sm"
        disabled={!isDirty}
        loading={saving}
        onClick={() => onSave(config)}
      >
        Save
      </Button>
    </div>
  );
}
