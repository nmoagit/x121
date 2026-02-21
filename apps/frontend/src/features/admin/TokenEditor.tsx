import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Card, CardBody, CardFooter, CardHeader, Tabs } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input, Select, Spinner } from "@/components/primitives";
import { api } from "@/lib/api";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

interface CustomTheme {
  id: number;
  name: string;
  description: string | null;
  status_id: number;
  tokens: TokenSet;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

interface TokenSet {
  surface?: SurfaceTokens;
  text?: TextTokens;
  action?: ActionTokens;
  border?: BorderTokens;
  font?: FontTokens;
  spacing?: SpacingTokens;
}

interface SurfaceTokens {
  primary?: string;
  secondary?: string;
  tertiary?: string;
}

interface TextTokens {
  primary?: string;
  secondary?: string;
  muted?: string;
  inverse?: string;
}

interface ActionTokens {
  primary?: string;
  primaryHover?: string;
  danger?: string;
  dangerHover?: string;
}

interface BorderTokens {
  default?: string;
  focus?: string;
  error?: string;
}

interface FontTokens {
  family?: string;
  sizeBase?: string;
  weightNormal?: string;
  weightMedium?: string;
  weightBold?: string;
}

interface SpacingTokens {
  unit?: string;
  scale?: string[];
}

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const EMPTY_TOKENS: TokenSet = {
  surface: { primary: "#0a0a0f", secondary: "#12121a", tertiary: "#1a1a26" },
  text: { primary: "#e4e4eb", secondary: "#a0a0b0", muted: "#6b6b80", inverse: "#0a0a0f" },
  action: { primary: "#6366f1", primaryHover: "#818cf8", danger: "#ef4444", dangerHover: "#f87171" },
  border: { default: "#2a2a3a", focus: "#6366f1", error: "#ef4444" },
  font: { family: "Inter, system-ui, sans-serif", sizeBase: "16px", weightNormal: "400", weightMedium: "500", weightBold: "700" },
  spacing: { unit: "4px", scale: ["0", "4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"] },
};

const STATUS_OPTIONS = [
  { value: "1", label: "Draft" },
  { value: "2", label: "Active" },
  { value: "3", label: "Archived" },
];

/* --------------------------------------------------------------------------
   Color Picker Field
   -------------------------------------------------------------------------- */

interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorField({ label, value, onChange }: ColorFieldProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 cursor-pointer rounded border border-[var(--color-border-default)] bg-transparent p-0"
        aria-label={label}
      />
      <div className="flex-1">
        <Input
          label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono text-sm"
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Section Components
   -------------------------------------------------------------------------- */

interface SurfaceSectionProps {
  tokens: SurfaceTokens;
  onChange: (tokens: SurfaceTokens) => void;
}

function SurfaceSection({ tokens, onChange }: SurfaceSectionProps) {
  return (
    <Stack gap={3}>
      <ColorField
        label="Primary"
        value={tokens.primary ?? "#000000"}
        onChange={(v) => onChange({ ...tokens, primary: v })}
      />
      <ColorField
        label="Secondary"
        value={tokens.secondary ?? "#000000"}
        onChange={(v) => onChange({ ...tokens, secondary: v })}
      />
      <ColorField
        label="Tertiary"
        value={tokens.tertiary ?? "#000000"}
        onChange={(v) => onChange({ ...tokens, tertiary: v })}
      />
    </Stack>
  );
}

interface TextSectionProps {
  tokens: TextTokens;
  onChange: (tokens: TextTokens) => void;
}

function TextSection({ tokens, onChange }: TextSectionProps) {
  return (
    <Stack gap={3}>
      <ColorField
        label="Primary"
        value={tokens.primary ?? "#ffffff"}
        onChange={(v) => onChange({ ...tokens, primary: v })}
      />
      <ColorField
        label="Secondary"
        value={tokens.secondary ?? "#aaaaaa"}
        onChange={(v) => onChange({ ...tokens, secondary: v })}
      />
      <ColorField
        label="Muted"
        value={tokens.muted ?? "#666666"}
        onChange={(v) => onChange({ ...tokens, muted: v })}
      />
      <ColorField
        label="Inverse"
        value={tokens.inverse ?? "#000000"}
        onChange={(v) => onChange({ ...tokens, inverse: v })}
      />
    </Stack>
  );
}

interface ActionSectionProps {
  tokens: ActionTokens;
  onChange: (tokens: ActionTokens) => void;
}

function ActionSection({ tokens, onChange }: ActionSectionProps) {
  return (
    <Stack gap={3}>
      <ColorField
        label="Primary"
        value={tokens.primary ?? "#6366f1"}
        onChange={(v) => onChange({ ...tokens, primary: v })}
      />
      <ColorField
        label="Primary Hover"
        value={tokens.primaryHover ?? "#818cf8"}
        onChange={(v) => onChange({ ...tokens, primaryHover: v })}
      />
      <ColorField
        label="Danger"
        value={tokens.danger ?? "#ef4444"}
        onChange={(v) => onChange({ ...tokens, danger: v })}
      />
      <ColorField
        label="Danger Hover"
        value={tokens.dangerHover ?? "#f87171"}
        onChange={(v) => onChange({ ...tokens, dangerHover: v })}
      />
    </Stack>
  );
}

interface BorderSectionProps {
  tokens: BorderTokens;
  onChange: (tokens: BorderTokens) => void;
}

function BorderSection({ tokens, onChange }: BorderSectionProps) {
  return (
    <Stack gap={3}>
      <ColorField
        label="Default"
        value={tokens.default ?? "#2a2a3a"}
        onChange={(v) => onChange({ ...tokens, default: v })}
      />
      <ColorField
        label="Focus"
        value={tokens.focus ?? "#6366f1"}
        onChange={(v) => onChange({ ...tokens, focus: v })}
      />
      <ColorField
        label="Error"
        value={tokens.error ?? "#ef4444"}
        onChange={(v) => onChange({ ...tokens, error: v })}
      />
    </Stack>
  );
}

interface FontSectionProps {
  tokens: FontTokens;
  onChange: (tokens: FontTokens) => void;
}

function FontSection({ tokens, onChange }: FontSectionProps) {
  return (
    <Stack gap={3}>
      <Input
        label="Font Family"
        value={tokens.family ?? ""}
        onChange={(e) => onChange({ ...tokens, family: e.target.value })}
      />
      <Input
        label="Base Size"
        value={tokens.sizeBase ?? "16px"}
        onChange={(e) => onChange({ ...tokens, sizeBase: e.target.value })}
      />
      <Select
        label="Normal Weight"
        options={[
          { value: "300", label: "300 (Light)" },
          { value: "400", label: "400 (Normal)" },
          { value: "500", label: "500 (Medium)" },
        ]}
        value={tokens.weightNormal ?? "400"}
        onChange={(v) => onChange({ ...tokens, weightNormal: v })}
      />
      <Select
        label="Medium Weight"
        options={[
          { value: "400", label: "400 (Normal)" },
          { value: "500", label: "500 (Medium)" },
          { value: "600", label: "600 (Semi-Bold)" },
        ]}
        value={tokens.weightMedium ?? "500"}
        onChange={(v) => onChange({ ...tokens, weightMedium: v })}
      />
      <Select
        label="Bold Weight"
        options={[
          { value: "600", label: "600 (Semi-Bold)" },
          { value: "700", label: "700 (Bold)" },
          { value: "800", label: "800 (Extra-Bold)" },
        ]}
        value={tokens.weightBold ?? "700"}
        onChange={(v) => onChange({ ...tokens, weightBold: v })}
      />
    </Stack>
  );
}

interface SpacingSectionProps {
  tokens: SpacingTokens;
  onChange: (tokens: SpacingTokens) => void;
}

function SpacingSection({ tokens, onChange }: SpacingSectionProps) {
  const scale = tokens.scale ?? EMPTY_TOKENS.spacing!.scale!;

  function handleScaleChange(index: number, value: string) {
    const newScale = [...scale];
    newScale[index] = value;
    onChange({ ...tokens, scale: newScale });
  }

  return (
    <Stack gap={3}>
      <Input
        label="Base Unit"
        value={tokens.unit ?? "4px"}
        onChange={(e) => onChange({ ...tokens, unit: e.target.value })}
      />
      <p className="text-sm font-medium text-[var(--color-text-secondary)]">Scale</p>
      <div className="grid grid-cols-3 gap-2">
        {scale.map((val, i) => (
          <Input
            key={i}
            label={`Step ${i}`}
            value={val}
            onChange={(e) => handleScaleChange(i, e.target.value)}
          />
        ))}
      </div>
    </Stack>
  );
}

/* --------------------------------------------------------------------------
   Preview Panel
   -------------------------------------------------------------------------- */

interface PreviewPanelProps {
  tokens: TokenSet;
}

function PreviewPanel({ tokens }: PreviewPanelProps) {
  const surface = tokens.surface ?? {};
  const text = tokens.text ?? {};
  const action = tokens.action ?? {};
  const border = tokens.border ?? {};

  return (
    <div
      className="rounded-[var(--radius-lg)] border p-4"
      style={{
        backgroundColor: surface.primary,
        borderColor: border.default,
        color: text.primary,
        fontFamily: tokens.font?.family,
      }}
    >
      <h3 className="mb-3 text-lg font-semibold">Live Preview</h3>

      {/* Surface layers */}
      <div className="mb-3 space-y-2">
        <div className="rounded p-3" style={{ backgroundColor: surface.secondary, borderColor: border.default, border: "1px solid" }}>
          <p style={{ color: text.secondary }} className="text-sm">Secondary surface with secondary text</p>
        </div>
        <div className="rounded p-3" style={{ backgroundColor: surface.tertiary }}>
          <p style={{ color: text.muted }} className="text-sm">Tertiary surface with muted text</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded px-4 py-2 text-sm font-medium transition-colors"
          style={{ backgroundColor: action.primary, color: text.inverse }}
        >
          Primary Action
        </button>
        <button
          type="button"
          className="rounded px-4 py-2 text-sm font-medium transition-colors"
          style={{ backgroundColor: action.danger, color: text.inverse }}
        >
          Danger Action
        </button>
      </div>

      {/* Input preview */}
      <div className="mt-3">
        <input
          readOnly
          value="Sample input field"
          className="w-full rounded px-3 py-2 text-sm"
          style={{
            backgroundColor: surface.secondary,
            color: text.primary,
            borderColor: border.default,
            border: "1px solid",
          }}
        />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
   Main Component
   -------------------------------------------------------------------------- */

export function TokenEditor() {
  const [themes, setThemes] = useState<CustomTheme[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState("1");
  const [tokens, setTokens] = useState<TokenSet>({ ...EMPTY_TOKENS });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("surface");

  /* ---- Load themes ---- */
  const loadThemes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.get<CustomTheme[]>("/admin/themes");
      setThemes(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load themes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  /* ---- Select a theme for editing ---- */
  function handleSelect(theme: CustomTheme) {
    setSelectedId(theme.id);
    setName(theme.name);
    setDescription(theme.description ?? "");
    setStatusId(String(theme.status_id));
    setTokens(theme.tokens && typeof theme.tokens === "object" ? theme.tokens : { ...EMPTY_TOKENS });
    setError(null);
  }

  /* ---- New theme ---- */
  function handleNew() {
    setSelectedId(null);
    setName("");
    setDescription("");
    setStatusId("1");
    setTokens({ ...EMPTY_TOKENS });
    setError(null);
  }

  /* ---- Save ---- */
  async function handleSave() {
    if (!name.trim()) {
      setError("Theme name is required");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (selectedId) {
        await api.put<CustomTheme>(`/admin/themes/${selectedId}`, {
          name,
          description: description || null,
          status_id: Number(statusId),
          tokens,
        });
      } else {
        const created = await api.post<CustomTheme>("/admin/themes", {
          name,
          description: description || null,
          tokens,
        });
        setSelectedId(created.id);
      }
      await loadThemes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save theme");
    } finally {
      setSaving(false);
    }
  }

  /* ---- Export ---- */
  async function handleExport() {
    if (!selectedId) return;

    try {
      const data = await api.get<unknown>(`/admin/themes/${selectedId}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name || "theme"}-tokens.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export theme");
    }
  }

  /* ---- Token updaters ---- */
  function updateSurface(surface: SurfaceTokens) {
    setTokens((prev) => ({ ...prev, surface }));
  }
  function updateText(text: TextTokens) {
    setTokens((prev) => ({ ...prev, text }));
  }
  function updateAction(action: ActionTokens) {
    setTokens((prev) => ({ ...prev, action }));
  }
  function updateBorder(border: BorderTokens) {
    setTokens((prev) => ({ ...prev, border }));
  }
  function updateFont(font: FontTokens) {
    setTokens((prev) => ({ ...prev, font }));
  }
  function updateSpacing(spacing: SpacingTokens) {
    setTokens((prev) => ({ ...prev, spacing }));
  }

  /* ---- Render ---- */
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner size="lg" />
      </div>
    );
  }

  const tabDefs = [
    { id: "surface", label: "Surface" },
    { id: "text", label: "Text" },
    { id: "action", label: "Action" },
    { id: "border", label: "Border" },
    { id: "font", label: "Font" },
    { id: "spacing", label: "Spacing" },
  ];

  const tabContent: Record<string, ReactNode> = {
    surface: <SurfaceSection tokens={tokens.surface ?? {}} onChange={updateSurface} />,
    text: <TextSection tokens={tokens.text ?? {}} onChange={updateText} />,
    action: <ActionSection tokens={tokens.action ?? {}} onChange={updateAction} />,
    border: <BorderSection tokens={tokens.border ?? {}} onChange={updateBorder} />,
    font: <FontSection tokens={tokens.font ?? {}} onChange={updateFont} />,
    spacing: <SpacingSection tokens={tokens.spacing ?? {}} onChange={updateSpacing} />,
  };

  return (
    <div className="flex gap-6 p-6">
      {/* Theme list sidebar */}
      <Card className="w-64 shrink-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
              Themes
            </h2>
            <Button size="sm" variant="secondary" onClick={handleNew}>
              New
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          <Stack gap={1}>
            {themes.length === 0 && (
              <p className="text-sm text-[var(--color-text-muted)]">No themes yet</p>
            )}
            {themes.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleSelect(t)}
                className={`w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors ${
                  selectedId === t.id
                    ? "bg-[var(--color-action-primary)] text-[var(--color-text-inverse)]"
                    : "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]"
                }`}
              >
                {t.name}
              </button>
            ))}
          </Stack>
        </CardBody>
      </Card>

      {/* Editor */}
      <div className="flex flex-1 flex-col gap-6">
        {/* Meta fields */}
        <Card>
          <CardBody>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Theme name"
              />
              <Input
                label="Description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
              <Select
                label="Status"
                options={STATUS_OPTIONS}
                value={statusId}
                onChange={setStatusId}
              />
            </div>
          </CardBody>
        </Card>

        {/* Token editor + preview side by side */}
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Token Editor
              </h3>
            </CardHeader>
            <CardBody>
              <Tabs tabs={tabDefs} activeTab={activeTab} onTabChange={setActiveTab} />
              <div className="mt-4">{tabContent[activeTab]}</div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">
                Preview
              </h3>
            </CardHeader>
            <CardBody>
              <PreviewPanel tokens={tokens} />
            </CardBody>
          </Card>
        </div>

        {/* Error + actions */}
        {error && (
          <p className="text-sm text-[var(--color-action-danger)]">{error}</p>
        )}

        <Card>
          <CardFooter>
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} loading={saving}>
                {selectedId ? "Save Changes" : "Create Theme"}
              </Button>
              {selectedId && (
                <Button variant="secondary" onClick={handleExport}>
                  Export Tokens
                </Button>
              )}
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
