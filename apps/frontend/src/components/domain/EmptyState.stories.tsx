import { Button } from "@/components/primitives";
import { Folder } from "@/tokens/icons";
import type { Meta, StoryObj } from "@storybook/react";
import { EmptyState } from "./EmptyState";

const meta = {
  title: "Domain/EmptyState",
  component: EmptyState,
  tags: ["autodocs"],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "No items found",
    description: "Try adjusting your search or filter to find what you are looking for.",
  },
};

export const WithIcon: Story = {
  args: {
    icon: <Folder size={48} />,
    title: "No projects yet",
    description: "Create your first project to get started.",
  },
};

export const WithAction: Story = {
  args: {
    icon: <Folder size={48} />,
    title: "No projects yet",
    description: "Create your first project to get started.",
    action: <Button>Create Project</Button>,
  },
};
