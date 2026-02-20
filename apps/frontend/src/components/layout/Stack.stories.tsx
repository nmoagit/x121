import type { Meta, StoryObj } from "@storybook/react";
import { Stack } from "./Stack";

function Placeholder({ children }: { children: string }) {
  return (
    <div className="px-4 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-tertiary)] text-sm text-[var(--color-text-primary)]">
      {children}
    </div>
  );
}

const meta = {
  title: "Layout/Stack",
  component: Stack,
  tags: ["autodocs"],
  args: {
    children: "Stack content",
  },
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
  render: () => (
    <Stack direction="vertical" gap={3}>
      <Placeholder>Item 1</Placeholder>
      <Placeholder>Item 2</Placeholder>
      <Placeholder>Item 3</Placeholder>
    </Stack>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <Stack direction="horizontal" gap={3}>
      <Placeholder>Item 1</Placeholder>
      <Placeholder>Item 2</Placeholder>
      <Placeholder>Item 3</Placeholder>
    </Stack>
  ),
};

export const DifferentGaps: Story = {
  render: () => (
    <Stack direction="vertical" gap={6}>
      <div>
        <p className="text-xs text-[var(--color-text-muted)] mb-2">gap=1</p>
        <Stack direction="horizontal" gap={1}>
          <Placeholder>A</Placeholder>
          <Placeholder>B</Placeholder>
          <Placeholder>C</Placeholder>
        </Stack>
      </div>
      <div>
        <p className="text-xs text-[var(--color-text-muted)] mb-2">gap=4</p>
        <Stack direction="horizontal" gap={4}>
          <Placeholder>A</Placeholder>
          <Placeholder>B</Placeholder>
          <Placeholder>C</Placeholder>
        </Stack>
      </div>
      <div>
        <p className="text-xs text-[var(--color-text-muted)] mb-2">gap=8</p>
        <Stack direction="horizontal" gap={8}>
          <Placeholder>A</Placeholder>
          <Placeholder>B</Placeholder>
          <Placeholder>C</Placeholder>
        </Stack>
      </div>
    </Stack>
  ),
};
