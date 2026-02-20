import { Button } from "@/components/primitives";
import type { Meta, StoryObj } from "@storybook/react";
import { ToastContainer } from "./Toast";
import { useToast } from "./useToast";

function ToastDemo() {
  const { addToast } = useToast();

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Button
        variant="primary"
        onClick={() =>
          addToast({ message: "Operation completed successfully!", variant: "success" })
        }
      >
        Success Toast
      </Button>
      <Button
        variant="danger"
        onClick={() => addToast({ message: "Something went wrong.", variant: "error" })}
      >
        Error Toast
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          addToast({ message: "Please review before continuing.", variant: "warning" })
        }
      >
        Warning Toast
      </Button>
      <Button
        variant="ghost"
        onClick={() => addToast({ message: "Here is some information.", variant: "info" })}
      >
        Info Toast
      </Button>
      <ToastContainer />
    </div>
  );
}

const meta = {
  title: "Composites/Toast",
  component: ToastContainer,
  tags: ["autodocs"],
} satisfies Meta<typeof ToastContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllVariants: Story = {
  render: () => <ToastDemo />,
};
