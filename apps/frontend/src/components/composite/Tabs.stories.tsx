import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { Tabs } from "./Tabs";

const SAMPLE_TABS = [
  { id: "overview", label: "Overview" },
  { id: "details", label: "Details" },
  { id: "settings", label: "Settings" },
  { id: "disabled", label: "Disabled Tab", disabled: true },
];

const noop = () => {};

const meta = {
  title: "Composites/Tabs",
  component: Tabs,
  tags: ["autodocs"],
  args: {
    tabs: SAMPLE_TABS,
    activeTab: "overview",
    onTabChange: noop,
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => {
    const [active, setActive] = useState("overview");
    return (
      <div>
        <Tabs tabs={SAMPLE_TABS} activeTab={active} onTabChange={setActive} />
        <div className="p-4 text-sm text-[var(--color-text-secondary)]">
          Active tab: <strong>{active}</strong>
        </div>
      </div>
    );
  },
};
