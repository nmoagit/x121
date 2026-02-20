import { Button } from "@/components/primitives";
import { Copy, Edit3, Trash2 } from "@/tokens/icons";
import type { Meta, StoryObj } from "@storybook/react";
import { Dropdown } from "./Dropdown";

const SAMPLE_ITEMS = [
  { value: "edit", label: "Edit", icon: <Edit3 size={16} /> },
  { value: "copy", label: "Duplicate", icon: <Copy size={16} /> },
  { value: "disabled", label: "Unavailable", disabled: true },
  { value: "delete", label: "Delete", icon: <Trash2 size={16} />, danger: true },
];

const noop = (_value: string) => {};

const meta = {
  title: "Composites/Dropdown",
  component: Dropdown,
  tags: ["autodocs"],
  args: {
    trigger: "Open",
    items: SAMPLE_ITEMS,
    onSelect: noop,
  },
} satisfies Meta<typeof Dropdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    trigger: <Button variant="secondary">Actions</Button>,
    items: SAMPLE_ITEMS,
    onSelect: (value: string) => console.log("Selected:", value),
  },
};

export const RightAligned: Story = {
  render: () => (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <Dropdown
        trigger={<Button variant="secondary">Right-aligned</Button>}
        items={SAMPLE_ITEMS}
        onSelect={(value) => console.log("Selected:", value)}
        align="right"
      />
    </div>
  ),
};
