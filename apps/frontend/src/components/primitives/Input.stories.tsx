import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta = {
  title: "Primitives/Input",
  component: Input,
  tags: ["autodocs"],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { placeholder: "Enter text..." },
};

export const WithLabel: Story = {
  args: { label: "Email address", placeholder: "you@example.com" },
};

export const WithError: Story = {
  args: {
    label: "Email address",
    placeholder: "you@example.com",
    error: "Please enter a valid email address",
    defaultValue: "invalid-email",
  },
};

export const WithHelperText: Story = {
  args: {
    label: "Password",
    type: "password",
    placeholder: "Enter password",
    helperText: "Must be at least 8 characters",
  },
};

export const Password: Story = {
  args: {
    label: "Password",
    type: "password",
    placeholder: "Enter password",
  },
};

export const Disabled: Story = {
  args: {
    label: "Disabled field",
    disabled: true,
    defaultValue: "Cannot edit this",
  },
};
