import type { Meta, StoryObj } from "@storybook/react";
import { Toggle } from "./Toggle";

const meta = {
  title: "Primitives/Toggle",
  component: Toggle,
  tags: ["autodocs"],
} satisfies Meta<typeof Toggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { checked: false },
};

export const Small: Story = {
  args: { size: "sm", checked: true },
};

export const Disabled: Story = {
  args: { disabled: true, checked: false },
};

export const WithLabel: Story = {
  args: { label: "Enable notifications", checked: true },
};
