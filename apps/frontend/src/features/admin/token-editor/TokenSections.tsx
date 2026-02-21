import { Stack } from "@/components/layout";
import { Input, Select } from "@/components/primitives";

/* --------------------------------------------------------------------------
   Types
   -------------------------------------------------------------------------- */

export interface SurfaceTokens {
  primary?: string;
  secondary?: string;
  tertiary?: string;
}

export interface TextTokens {
  primary?: string;
  secondary?: string;
  muted?: string;
  inverse?: string;
}

export interface ActionTokens {
  primary?: string;
  primaryHover?: string;
  danger?: string;
  dangerHover?: string;
}

export interface BorderTokens {
  default?: string;
  focus?: string;
  error?: string;
}

export interface FontTokens {
  family?: string;
  sizeBase?: string;
  weightNormal?: string;
  weightMedium?: string;
  weightBold?: string;
}

export interface SpacingTokens {
  unit?: string;
  scale?: string[];
}

export interface TokenSet {
  surface?: SurfaceTokens;
  text?: TextTokens;
  action?: ActionTokens;
  border?: BorderTokens;
  font?: FontTokens;
  spacing?: SpacingTokens;
}

/** Default token values used as fallbacks when creating a new theme. */
export const EMPTY_TOKENS: TokenSet = {
  surface: { primary: "#0a0a0f", secondary: "#12121a", tertiary: "#1a1a26" },
  text: { primary: "#e4e4eb", secondary: "#a0a0b0", muted: "#6b6b80", inverse: "#0a0a0f" },
  action: {
    primary: "#6366f1",
    primaryHover: "#818cf8",
    danger: "#ef4444",
    dangerHover: "#f87171",
  },
  border: { default: "#2a2a3a", focus: "#6366f1", error: "#ef4444" },
  font: {
    family: "Inter, system-ui, sans-serif",
    sizeBase: "16px",
    weightNormal: "400",
    weightMedium: "500",
    weightBold: "700",
  },
  spacing: {
    unit: "4px",
    scale: ["0", "4px", "8px", "12px", "16px", "24px", "32px", "48px", "64px"],
  },
};

/* --------------------------------------------------------------------------
   Color Picker Field (shared by all color sections)
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

export function SurfaceSection({ tokens, onChange }: SurfaceSectionProps) {
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

export function TextSection({ tokens, onChange }: TextSectionProps) {
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

export function ActionSection({ tokens, onChange }: ActionSectionProps) {
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

export function BorderSection({ tokens, onChange }: BorderSectionProps) {
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

export function FontSection({ tokens, onChange }: FontSectionProps) {
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

export function SpacingSection({ tokens, onChange }: SpacingSectionProps) {
  const defaultScale = EMPTY_TOKENS.spacing?.scale ?? [];
  const scale = tokens.scale ?? defaultScale;

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
            key={`step-${i}`}
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

export function PreviewPanel({ tokens }: PreviewPanelProps) {
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
        <div
          className="rounded p-3"
          style={{
            backgroundColor: surface.secondary,
            borderColor: border.default,
            border: "1px solid",
          }}
        >
          <p style={{ color: text.secondary }} className="text-sm">
            Secondary surface with secondary text
          </p>
        </div>
        <div className="rounded p-3" style={{ backgroundColor: surface.tertiary }}>
          <p style={{ color: text.muted }} className="text-sm">
            Tertiary surface with muted text
          </p>
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
