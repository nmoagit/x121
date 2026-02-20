import { Button } from "@/components/primitives";
import type { Meta, StoryObj } from "@storybook/react";
import { Card, CardBody, CardFooter, CardHeader } from "./Card";

const meta = {
  title: "Composites/Card",
  component: Card,
  tags: ["autodocs"],
  args: {
    children: "Card content",
  },
  argTypes: {
    elevation: {
      control: "select",
      options: ["flat", "sm", "md", "lg"],
    },
    padding: {
      control: "select",
      options: ["none", "sm", "md", "lg"],
    },
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: <p>Simple card content</p>,
  },
};

export const WithSections: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Card Title</h3>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-[var(--color-text-secondary)]">
          This is the body content of the card. It can contain any elements.
        </p>
      </CardBody>
      <CardFooter>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="ghost" size="sm">
            Cancel
          </Button>
          <Button size="sm">Save</Button>
        </div>
      </CardFooter>
    </Card>
  ),
};

export const Elevations: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
      <Card elevation="flat" className="w-48">
        <p className="text-sm text-[var(--color-text-secondary)]">Flat</p>
      </Card>
      <Card elevation="sm" className="w-48">
        <p className="text-sm text-[var(--color-text-secondary)]">Small</p>
      </Card>
      <Card elevation="md" className="w-48">
        <p className="text-sm text-[var(--color-text-secondary)]">Medium</p>
      </Card>
      <Card elevation="lg" className="w-48">
        <p className="text-sm text-[var(--color-text-secondary)]">Large</p>
      </Card>
    </div>
  ),
};
