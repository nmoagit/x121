import { Button } from "@/components/primitives";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Drawer } from "./Drawer";

const noop = () => {};

const meta = {
  title: "Composites/Drawer",
  component: Drawer,
  tags: ["autodocs"],
  args: {
    open: false,
    onClose: noop,
    children: "Drawer content",
  },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Right: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Right Drawer</Button>
        <Drawer open={open} onClose={() => setOpen(false)} position="right" title="Right Drawer">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Drawer content slides in from the right.
          </p>
        </Drawer>
      </>
    );
  },
};

export const Left: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Left Drawer</Button>
        <Drawer open={open} onClose={() => setOpen(false)} position="left" title="Left Drawer">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Drawer content slides in from the left.
          </p>
        </Drawer>
      </>
    );
  },
};
