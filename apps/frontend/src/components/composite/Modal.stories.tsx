import { Button } from "@/components/primitives";
import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Modal } from "./Modal";

const noop = () => {};

const meta = {
  title: "Composites/Modal",
  component: Modal,
  tags: ["autodocs"],
  args: {
    open: false,
    onClose: noop,
    children: "Modal content",
  },
  parameters: {
    docs: {
      description: {
        component: "A dialog overlay that blocks interaction with the page behind it.",
      },
    },
  },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open Modal</Button>
        <Modal open={open} onClose={() => setOpen(false)} title="Example Modal">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This is the modal body content. Press Escape or click the backdrop to close.
          </p>
        </Modal>
      </>
    );
  },
};

export const Sizes: Story = {
  render: () => {
    const [size, setSize] = useState<"sm" | "md" | "lg" | "xl" | null>(null);
    return (
      <>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" onClick={() => setSize("sm")}>
            Small
          </Button>
          <Button variant="secondary" onClick={() => setSize("md")}>
            Medium
          </Button>
          <Button variant="secondary" onClick={() => setSize("lg")}>
            Large
          </Button>
          <Button variant="secondary" onClick={() => setSize("xl")}>
            Extra Large
          </Button>
        </div>
        <Modal
          open={size !== null}
          onClose={() => setSize(null)}
          title={`${size?.toUpperCase()} Modal`}
          size={size ?? "md"}
        >
          <p className="text-sm text-[var(--color-text-secondary)]">
            This modal uses the <strong>{size}</strong> size variant.
          </p>
        </Modal>
      </>
    );
  },
};
