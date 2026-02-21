import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import { Card, CardBody, CardFooter, CardHeader, Tabs } from "@/components/composite";
import { Stack } from "@/components/layout";
import { Button, Input, Select, Spinner } from "@/components/primitives";
import { api } from "@/lib/api";

import {
  ActionSection,
  BorderSection,
  EMPTY_TOKENS,
  FontSection,
  PreviewPanel,
  SpacingSection,
  SurfaceSection,
  TextSection,
} from "./token-editor/TokenSections";
import type { TokenSet } from "./token-editor/TokenSections";

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

/* --------------------------------------------------------------------------
   Constants
   -------------------------------------------------------------------------- */

const STATUS_OPTIONS = [
  { value: "1", label: "Draft" },
  { value: "2", label: "Active" },
  { value: "3", label: "Archived" },
];

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
    setTokens(
      theme.tokens && typeof theme.tokens === "object" ? theme.tokens : { ...EMPTY_TOKENS },
    );
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

  /* ---- Generic token section updater ---- */
  function updateTokenSection<K extends keyof TokenSet>(key: K) {
    return (value: NonNullable<TokenSet[K]>) => {
      setTokens((prev) => ({ ...prev, [key]: value }));
    };
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
    surface: (
      <SurfaceSection tokens={tokens.surface ?? {}} onChange={updateTokenSection("surface")} />
    ),
    text: <TextSection tokens={tokens.text ?? {}} onChange={updateTokenSection("text")} />,
    action: <ActionSection tokens={tokens.action ?? {}} onChange={updateTokenSection("action")} />,
    border: <BorderSection tokens={tokens.border ?? {}} onChange={updateTokenSection("border")} />,
    font: <FontSection tokens={tokens.font ?? {}} onChange={updateTokenSection("font")} />,
    spacing: (
      <SpacingSection tokens={tokens.spacing ?? {}} onChange={updateTokenSection("spacing")} />
    ),
  };

  return (
    <div className="flex gap-6 p-6">
      {/* Theme list sidebar */}
      <Card className="w-64 shrink-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Themes</h2>
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
              <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Preview</h3>
            </CardHeader>
            <CardBody>
              <PreviewPanel tokens={tokens} />
            </CardBody>
          </Card>
        </div>

        {/* Error + actions */}
        {error && <p className="text-sm text-[var(--color-action-danger)]">{error}</p>}

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
