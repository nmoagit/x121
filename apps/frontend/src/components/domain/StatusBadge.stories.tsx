import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "./StatusBadge";

const meta = {
  title: "Domain/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
  args: {
    status: "active",
  },
} satisfies Meta<typeof StatusBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllStatuses: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <StatusBadge status="active" />
      <StatusBadge status="success" />
      <StatusBadge status="pending" />
      <StatusBadge status="processing" />
      <StatusBadge status="failed" />
      <StatusBadge status="error" />
      <StatusBadge status="archived" />
      <StatusBadge status="draft" />
      <StatusBadge status="review" />
      <StatusBadge status="unknown" />
    </div>
  ),
};

export const SmallSize: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8 }}>
      <StatusBadge status="active" size="sm" />
      <StatusBadge status="pending" size="sm" />
      <StatusBadge status="failed" size="sm" />
    </div>
  ),
};
