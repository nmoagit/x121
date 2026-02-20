import type { Meta, StoryObj } from "@storybook/react";
import { Spacer } from "./Spacer";

const meta = {
  title: "Layout/Spacer",
  component: Spacer,
  tags: ["autodocs"],
} satisfies Meta<typeof Spacer>;

export default meta;
type Story = StoryObj<typeof meta>;

function ColorBlock({ color, label }: { color: string; label: string }) {
  return (
    <div
      style={{ background: color, padding: "8px 16px", borderRadius: 4 }}
      className="text-sm text-white"
    >
      {label}
    </div>
  );
}

export const Default: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <ColorBlock color="#3b82f6" label="Above" />
      <Spacer size={4} />
      <ColorBlock color="#8b5cf6" label="Below (size=4)" />
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {([1, 2, 3, 4, 6, 8, 12, 16] as const).map((size) => (
        <div key={size}>
          <p className="text-xs text-[var(--color-text-muted)] mb-1">size={size}</p>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <ColorBlock color="#3b82f6" label="Top" />
            <Spacer size={size} />
            <ColorBlock color="#8b5cf6" label="Bottom" />
          </div>
        </div>
      ))}
    </div>
  ),
};
