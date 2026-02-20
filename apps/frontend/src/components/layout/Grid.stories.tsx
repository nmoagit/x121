import { Card } from "@/components/composite";
import type { Meta, StoryObj } from "@storybook/react";
import { Grid } from "./Grid";

function PlaceholderCard({ label }: { label: string }) {
  return (
    <Card padding="md">
      <p className="text-sm text-[var(--color-text-primary)]">{label}</p>
    </Card>
  );
}

const meta = {
  title: "Layout/Grid",
  component: Grid,
  tags: ["autodocs"],
  args: {
    children: "Grid content",
  },
} satisfies Meta<typeof Grid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TwoColumns: Story = {
  render: () => (
    <Grid cols={2} gap={4}>
      <PlaceholderCard label="Cell 1" />
      <PlaceholderCard label="Cell 2" />
      <PlaceholderCard label="Cell 3" />
      <PlaceholderCard label="Cell 4" />
    </Grid>
  ),
};

export const ThreeColumns: Story = {
  render: () => (
    <Grid cols={3} gap={4}>
      <PlaceholderCard label="Cell 1" />
      <PlaceholderCard label="Cell 2" />
      <PlaceholderCard label="Cell 3" />
      <PlaceholderCard label="Cell 4" />
      <PlaceholderCard label="Cell 5" />
      <PlaceholderCard label="Cell 6" />
    </Grid>
  ),
};

export const FourColumns: Story = {
  render: () => (
    <Grid cols={4} gap={3}>
      <PlaceholderCard label="1" />
      <PlaceholderCard label="2" />
      <PlaceholderCard label="3" />
      <PlaceholderCard label="4" />
      <PlaceholderCard label="5" />
      <PlaceholderCard label="6" />
      <PlaceholderCard label="7" />
      <PlaceholderCard label="8" />
    </Grid>
  ),
};
