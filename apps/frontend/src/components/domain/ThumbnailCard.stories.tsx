import type { Meta, StoryObj } from "@storybook/react";
import { ThumbnailCard } from "./ThumbnailCard";

const meta = {
  title: "Domain/ThumbnailCard",
  component: ThumbnailCard,
  tags: ["autodocs"],
} satisfies Meta<typeof ThumbnailCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithImage: Story = {
  args: {
    src: "https://picsum.photos/seed/trulience/400/225",
    title: "AI Character Alpha",
    subtitle: "Created 2 days ago",
  },
};

export const WithoutImage: Story = {
  args: {
    title: "Untitled Project",
    subtitle: "No thumbnail available",
  },
};

export const WithStatus: Story = {
  args: {
    src: "https://picsum.photos/seed/status/400/225",
    title: "Pipeline Run #42",
    subtitle: "Finished 5 minutes ago",
    status: "success",
  },
};

export const Interactive: Story = {
  args: {
    src: "https://picsum.photos/seed/click/400/225",
    title: "Click Me",
    subtitle: "This card is interactive",
    status: "active",
    onClick: () => console.log("Card clicked"),
  },
};
