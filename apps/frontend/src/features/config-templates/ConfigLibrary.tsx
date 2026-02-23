/**
 * ConfigLibrary -- displays a catalog of project configuration templates (PRD-74).
 *
 * Shows config cards with name, description, version, source project,
 * recommended badge, and CRUD actions.
 */

import { useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
} from "@/components";
import { formatDateTime } from "@/lib/format";

import {
  useConfigTemplates,
  useCreateConfig,
  useDeleteConfig,
} from "./hooks/use-config-templates";
import type { CreateProjectConfig, ProjectConfig } from "./types";

/* --------------------------------------------------------------------------
   Props
   -------------------------------------------------------------------------- */

interface ConfigLibraryProps {
  /** When provided, the "Export" action uses this project ID. */
  projectId?: number;
}

/* --------------------------------------------------------------------------
   Component
   -------------------------------------------------------------------------- */

export function ConfigLibrary({ projectId }: ConfigLibraryProps) {
  const { data: configs = [], isLoading } = useConfigTemplates();
  const createConfig = useCreateConfig();
  const deleteConfig = useDeleteConfig();

  const [showForm, setShowForm] = useState(false);

  const handleDelete = (id: number) => {
    deleteConfig.mutate(id);
  };

  const handleCreate = (input: CreateProjectConfig) => {
    createConfig.mutate(input, {
      onSuccess: () => setShowForm(false),
    });
  };

  if (isLoading) {
    return (
      <div
        data-testid="configs-loading"
        className="p-4 text-sm text-[var(--color-text-secondary)]"
      >
        Loading configuration templates...
      </div>
    );
  }

  return (
    <div data-testid="config-library" className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
          Configuration Templates
        </h2>
        <Button
          data-testid="add-config-btn"
          onClick={() => setShowForm((v) => !v)}
        >
          {showForm ? "Cancel" : "New Template"}
        </Button>
      </div>

      {showForm && (
        <CreateConfigForm
          projectId={projectId}
          onSubmit={handleCreate}
          isSubmitting={createConfig.isPending}
        />
      )}

      {configs.length === 0 && !showForm && (
        <div
          data-testid="empty-state"
          className="rounded-lg border border-dashed border-[var(--color-border)] p-8 text-center text-sm text-[var(--color-text-secondary)]"
        >
          No configuration templates yet. Create one to get started.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {configs.map((config) => (
          <ConfigCard
            key={config.id}
            config={config}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Config Card
   -------------------------------------------------------------------------- */

interface ConfigCardProps {
  config: ProjectConfig;
  onDelete: (id: number) => void;
}

function ConfigCard({ config, onDelete }: ConfigCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h3
            data-testid={`config-name-${config.id}`}
            className="text-sm font-medium text-[var(--color-text-primary)]"
          >
            {config.name}
          </h3>
          <div className="flex items-center gap-2">
            {config.is_recommended && (
              <Badge
                data-testid={`recommended-badge-${config.id}`}
                variant="success"
              >
                Recommended
              </Badge>
            )}
            <Badge variant="info">v{config.version}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardBody>
        <div className="space-y-2">
          {config.description && (
            <p className="text-xs text-[var(--color-text-secondary)]">
              {config.description}
            </p>
          )}
          {config.source_project_id && (
            <p className="text-xs text-[var(--color-text-tertiary)]">
              Source project: #{config.source_project_id}
            </p>
          )}
          <p className="text-xs text-[var(--color-text-tertiary)]">
            Created {formatDateTime(config.created_at)}
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              data-testid={`delete-config-btn-${config.id}`}
              onClick={() => onDelete(config.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/* --------------------------------------------------------------------------
   Create Form
   -------------------------------------------------------------------------- */

interface CreateConfigFormProps {
  projectId?: number;
  onSubmit: (input: CreateProjectConfig) => void;
  isSubmitting: boolean;
}

function CreateConfigForm({
  projectId,
  onSubmit,
  isSubmitting,
}: CreateConfigFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [configText, setConfigText] = useState('{"scene_types": []}');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let configJson: Record<string, unknown>;
    try {
      configJson = JSON.parse(configText);
    } catch {
      return; // Invalid JSON -- do not submit
    }

    onSubmit({
      name,
      description: description || null,
      config_json: configJson,
      source_project_id: projectId,
    });
  };

  return (
    <Card>
      <CardBody>
        <form
          data-testid="create-config-form"
          onSubmit={handleSubmit}
          className="space-y-4"
        >
          <Input
            data-testid="config-name-input"
            placeholder="Template name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            data-testid="config-desc-input"
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <textarea
            data-testid="config-json-input"
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-2 font-mono text-xs text-[var(--color-text-primary)]"
            rows={6}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
          />
          <Button
            data-testid="submit-config-btn"
            type="submit"
            disabled={!name.trim() || isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Template"}
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
