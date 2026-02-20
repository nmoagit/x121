import { Plus } from "@/tokens/icons";
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "danger", "ghost"],
    },
    size: {
      control: "select",
      options: ["sm", "md", "lg"],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { variant: "primary", children: "Primary Button" },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "Secondary Button" },
};

export const Danger: Story = {
  args: { variant: "danger", children: "Danger Button" },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "Ghost Button" },
};

export const AllSizes: Story = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Button size="sm">Small</Button>
      <Button size="md">Medium</Button>
      <Button size="lg">Large</Button>
    </div>
  ),
};

export const Loading: Story = {
  args: { loading: true, children: "Loading..." },
};

export const WithIcon: Story = {
  args: { icon: <Plus size={16} />, children: "Add Item" },
};

export const Disabled: Story = {
  args: { disabled: true, children: "Disabled" },
};
