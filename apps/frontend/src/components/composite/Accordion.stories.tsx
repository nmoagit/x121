import type { Meta, StoryObj } from "@storybook/react";
import { Accordion } from "./Accordion";

const SAMPLE_ITEMS = [
  {
    id: "section-1",
    title: "What is Trulience?",
    content: "Trulience is a platform for managing AI-powered digital experiences.",
  },
  {
    id: "section-2",
    title: "How does theming work?",
    content:
      "The theme system uses CSS custom properties with two axes: color scheme (dark/light) and brand palette (obsidian/neon).",
  },
  {
    id: "section-3",
    title: "Can I customize components?",
    content:
      "All components accept a className prop for customization via Tailwind utility classes.",
  },
];

const meta = {
  title: "Composites/Accordion",
  component: Accordion,
  tags: ["autodocs"],
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SingleMode: Story = {
  args: {
    items: SAMPLE_ITEMS,
    allowMultiple: false,
  },
};

export const MultipleMode: Story = {
  args: {
    items: SAMPLE_ITEMS,
    allowMultiple: true,
  },
};
