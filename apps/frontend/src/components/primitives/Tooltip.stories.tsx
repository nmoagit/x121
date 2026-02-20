import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";
import { Tooltip } from "./Tooltip";

const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ padding: 80, display: "flex", justifyContent: "center" }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Top: Story = {
  args: {
    content: "Tooltip on top",
    side: "top",
    delay: 0,
    children: <Button variant="secondary">Hover me (top)</Button>,
  },
};

export const Bottom: Story = {
  args: {
    content: "Tooltip on bottom",
    side: "bottom",
    delay: 0,
    children: <Button variant="secondary">Hover me (bottom)</Button>,
  },
};

export const Left: Story = {
  args: {
    content: "Tooltip on left",
    side: "left",
    delay: 0,
    children: <Button variant="secondary">Hover me (left)</Button>,
  },
};

export const Right: Story = {
  args: {
    content: "Tooltip on right",
    side: "right",
    delay: 0,
    children: <Button variant="secondary">Hover me (right)</Button>,
  },
};
