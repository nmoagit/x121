import type { Meta, StoryObj } from "@storybook/react";
import { Divider } from "./Divider";

const meta = {
  title: "Layout/Divider",
  component: Divider,
  tags: ["autodocs"],
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div>
      <p className="text-sm text-[var(--color-text-primary)] mb-3">Content above</p>
      <Divider />
      <p className="text-sm text-[var(--color-text-primary)] mt-3">Content below</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, height: 40 }}>
      <span className="text-sm text-[var(--color-text-primary)]">Left</span>
      <Divider orientation="vertical" />
      <span className="text-sm text-[var(--color-text-primary)]">Right</span>
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div>
      <p className="text-sm text-[var(--color-text-primary)] mb-3">Section one</p>
      <Divider label="OR" />
      <p className="text-sm text-[var(--color-text-primary)] mt-3">Section two</p>
    </div>
  ),
};
