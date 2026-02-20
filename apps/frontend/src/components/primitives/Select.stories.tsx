import type { Meta, StoryObj } from "@storybook/react";
import { Select } from "./Select";

const SAMPLE_OPTIONS = [
  { value: "react", label: "React" },
  { value: "vue", label: "Vue" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte" },
];

const meta = {
  title: "Primitives/Select",
  component: Select,
  tags: ["autodocs"],
  args: {
    options: SAMPLE_OPTIONS,
  },
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: "Framework" },
};

export const WithPlaceholder: Story = {
  args: { label: "Framework", placeholder: "Choose a framework..." },
};

export const WithError: Story = {
  args: {
    label: "Framework",
    placeholder: "Choose a framework...",
    error: "Selection is required",
  },
};

export const Disabled: Story = {
  args: {
    label: "Framework",
    value: "react",
    disabled: true,
  },
};
