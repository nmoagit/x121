/**
 * Admin page for managing extensions (PRD-85).
 *
 * Lists installed extensions, provides install/uninstall, enable/disable,
 * settings editing, and permission review.
 */

import { useCallback, useState } from "react";

import { Card, Modal } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Badge, Button, Input, Spinner, Toggle } from "@/components/primitives";
import { cn } from "@/lib/cn";
import { AlertTriangle, Plus, Settings, Trash2 } from "@/tokens/icons";

import {
  useDisableExtension,
  useEnableExtension,
  useExtensions,
  useInstallExtension,
  useUninstallExtension,
  useUpdateExtensionSettings,
} from "./hooks/use-extensions";
import type { Extension, Permission } from "./types";

/* --------------------------------------------------------------------------
   Shared textarea styling
   -------------------------------------------------------------------------- */

/** Base classes for monospace JSON textarea fields. */
const TEXTAREA_BASE_CLASSES = [
  "w-full px-3 py-2 text-sm font-mono",
  "bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)]",
  "border rounded-[var(--radius-md)]",
  "placeholder:text-[var(--color-text-muted)]",
  "focus:outline-none focus:ring-2 focus:ring-offset-0",
] as const;

/** Returns the border class for a textarea based on whether there is a parse error. */
function textareaBorderClass(hasError: boolean): string {
  return hasError
    ? "border-[var(--color-border-error)] focus:ring-[var(--color-border-error)]"
    : "border-[var(--color-border-default)] focus:ring-[var(--color-border-focus)]";
}

/* --------------------------------------------------------------------------
   Sub-components
   -------------------------------------------------------------------------- */

function PermissionList({ permissions }: { permissions: Permission[] }) {
  if (permissions.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">No permissions declared.</p>;
  }

  return (
    <ul className="flex flex-wrap gap-1.5">
      {permissions.map((p) => (
        <li key={`${p.resource}-${p.access}`}>
          <Badge variant="info" size="sm">
            {p.resource}: {p.access}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------------------
   Settings editor
   -------------------------------------------------------------------------- */

interface SettingsEditorProps {
  extensionId: number;
  currentSettings: Record<string, unknown>;
  onClose: () => void;
}

function SettingsEditor({ extensionId, currentSettings, onClose }: SettingsEditorProps) {
  const [rawJson, setRawJson] = useState(JSON.stringify(currentSettings, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const updateMutation = useUpdateExtensionSettings(extensionId);

  const handleSave = useCallback(() => {
    try {
      const parsed = JSON.parse(rawJson) as Record<string, unknown>;
      setParseError(null);
      updateMutation.mutate({ settings_json: parsed }, { onSuccess: () => onClose() });
    } catch {
      setParseError("Invalid JSON. Please check the syntax.");
    }
  }, [rawJson, updateMutation, onClose]);

  return (
    <Stack gap={4}>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="settings-json"
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          Settings JSON
        </label>
        <textarea
          id="settings-json"
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          rows={12}
          className={cn(...TEXTAREA_BASE_CLASSES, textareaBorderClass(parseError !== null))}
        />
        {parseError && (
          <p className="text-sm text-[var(--color-action-danger)]" role="alert">
            {parseError}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={handleSave} loading={updateMutation.isPending}>
          Save Settings
        </Button>
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Install form
   -------------------------------------------------------------------------- */

interface InstallFormProps {
  onClose: () => void;
}

function InstallForm({ onClose }: InstallFormProps) {
  const [manifestJson, setManifestJson] = useState("");
  const [sourcePath, setSourcePath] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const installMutation = useInstallExtension();

  const handleInstall = useCallback(() => {
    try {
      const parsed = JSON.parse(manifestJson) as Record<string, unknown>;
      setParseError(null);

      if (!sourcePath.trim()) {
        setParseError("Source path is required.");
        return;
      }

      installMutation.mutate(
        { manifest_json: parsed, source_path: sourcePath.trim() },
        { onSuccess: () => onClose() },
      );
    } catch {
      setParseError("Invalid JSON manifest. Please check the syntax.");
    }
  }, [manifestJson, sourcePath, installMutation, onClose]);

  return (
    <Stack gap={4}>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="manifest-json"
          className="text-sm font-medium text-[var(--color-text-secondary)]"
        >
          Extension Manifest (JSON)
        </label>
        <textarea
          id="manifest-json"
          value={manifestJson}
          onChange={(e) => setManifestJson(e.target.value)}
          placeholder='{"name": "my-extension", "version": "1.0.0", ...}'
          rows={10}
          className={cn(...TEXTAREA_BASE_CLASSES, textareaBorderClass(parseError !== null))}
        />
        {parseError && (
          <p className="text-sm text-[var(--color-action-danger)]" role="alert">
            {parseError}
          </p>
        )}
      </div>

      <Input
        label="Source Path"
        value={sourcePath}
        onChange={(e) => setSourcePath(e.target.value)}
        placeholder="/extensions/my-extension/index.html"
      />

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleInstall}
          loading={installMutation.isPending}
        >
          Install Extension
        </Button>
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Extension row
   -------------------------------------------------------------------------- */

interface ExtensionRowProps {
  extension: Extension;
  onSettings: (ext: Extension) => void;
  onUninstall: (ext: Extension) => void;
}

function ExtensionRow({ extension, onSettings, onUninstall }: ExtensionRowProps) {
  const enableMutation = useEnableExtension();
  const disableMutation = useDisableExtension();
  const isToggling = enableMutation.isPending || disableMutation.isPending;

  const handleToggle = useCallback(
    (checked: boolean) => {
      if (checked) {
        enableMutation.mutate(extension.id);
      } else {
        disableMutation.mutate(extension.id);
      }
    },
    [extension.id, enableMutation, disableMutation],
  );

  return (
    <tr className="border-b border-[var(--color-border-default)]">
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">
            {extension.name}
          </span>
          {extension.description && (
            <span className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {extension.description}
            </span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">{extension.version}</td>
      <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
        {extension.author ?? "-"}
      </td>
      <td className="px-4 py-3">
        <Badge variant={extension.enabled ? "success" : "default"} size="sm">
          {extension.enabled ? "Enabled" : "Disabled"}
        </Badge>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Toggle
            checked={extension.enabled}
            onChange={handleToggle}
            disabled={isToggling}
            size="sm"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSettings(extension)}
            icon={<Settings size={16} />}
            aria-label={`Settings for ${extension.name}`}
          >
            Settings
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => onUninstall(extension)}
            icon={<Trash2 size={16} />}
            aria-label={`Uninstall ${extension.name}`}
          >
            Uninstall
          </Button>
        </div>
      </td>
    </tr>
  );
}

/* --------------------------------------------------------------------------
   Main component
   -------------------------------------------------------------------------- */

export function ExtensionManager() {
  const { data: extensions, isLoading } = useExtensions();
  const uninstallMutation = useUninstallExtension();

  const [showInstall, setShowInstall] = useState(false);
  const [settingsTarget, setSettingsTarget] = useState<Extension | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<Extension | null>(null);
  const [permissionReview, setPermissionReview] = useState<Extension | null>(null);

  const handleConfirmUninstall = useCallback(() => {
    if (!uninstallTarget) return;
    uninstallMutation.mutate(uninstallTarget.id, {
      onSuccess: () => setUninstallTarget(null),
    });
  }, [uninstallTarget, uninstallMutation]);

  if (isLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Stack gap={6}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">
              Extension Manager
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              Install, configure, and manage UI extensions.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={<Plus size={20} />}
            onClick={() => setShowInstall(true)}
          >
            Install Extension
          </Button>
        </div>

        {/* Extensions table */}
        <Card elevation="sm" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                    Extension
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                    Author
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-[var(--color-text-muted)]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {!extensions || extensions.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]"
                    >
                      No extensions installed. Click "Install Extension" to add one.
                    </td>
                  </tr>
                ) : (
                  extensions.map((ext) => (
                    <ExtensionRow
                      key={ext.id}
                      extension={ext}
                      onSettings={(e) => {
                        setPermissionReview(e);
                        setSettingsTarget(e);
                      }}
                      onUninstall={setUninstallTarget}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </Stack>

      {/* Install modal */}
      <Modal
        open={showInstall}
        onClose={() => setShowInstall(false)}
        title="Install Extension"
        size="lg"
      >
        <InstallForm onClose={() => setShowInstall(false)} />
      </Modal>

      {/* Settings modal */}
      <Modal
        open={settingsTarget !== null}
        onClose={() => setSettingsTarget(null)}
        title={settingsTarget ? `Settings: ${settingsTarget.name}` : ""}
        size="lg"
      >
        {settingsTarget && (
          <Stack gap={4}>
            {/* Permission review */}
            {permissionReview && (
              <div>
                <h3 className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">
                  Declared Permissions
                </h3>
                <PermissionList permissions={permissionReview.manifest_json.permissions} />
              </div>
            )}

            <SettingsEditor
              extensionId={settingsTarget.id}
              currentSettings={settingsTarget.settings_json}
              onClose={() => {
                setSettingsTarget(null);
                setPermissionReview(null);
              }}
            />
          </Stack>
        )}
      </Modal>

      {/* Uninstall confirmation modal */}
      <Modal
        open={uninstallTarget !== null}
        onClose={() => setUninstallTarget(null)}
        title="Confirm Uninstall"
        size="sm"
      >
        {uninstallTarget && (
          <Stack gap={4}>
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={24}
                className="text-[var(--color-action-warning)] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-sm text-[var(--color-text-secondary)]">
                Are you sure you want to uninstall{" "}
                <strong className="text-[var(--color-text-primary)]">{uninstallTarget.name}</strong>
                ? This action cannot be undone.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setUninstallTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleConfirmUninstall}
                loading={uninstallMutation.isPending}
              >
                Uninstall
              </Button>
            </div>
          </Stack>
        )}
      </Modal>
    </div>
  );
}
