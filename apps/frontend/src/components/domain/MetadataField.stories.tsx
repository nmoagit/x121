import type { Meta, StoryObj } from "@storybook/react";
import { MetadataField } from "./MetadataField";

const meta = {
  title: "Domain/MetadataField",
  component: MetadataField,
  tags: ["autodocs"],
  args: {
    label: "Label",
    value: "Value",
  },
} satisfies Meta<typeof MetadataField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
  args: {
    label: "Created",
    value: "February 20, 2026",
    orientation: "vertical",
  },
};

export const Horizontal: Story = {
  args: {
    label: "Status",
    value: "Active",
    orientation: "horizontal",
  },
};

export const MultipleFields: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <MetadataField label="Name" value="AI Character Alpha" />
      <MetadataField label="Type" value="Conversational Agent" />
      <MetadataField label="Created" value="February 20, 2026" />
      <MetadataField label="Last Modified" value="2 hours ago" />
    </div>
  ),
};
