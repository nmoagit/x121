import type { Preview } from "@storybook/react";
import "../src/app/index.css";
import { THEME_IDS } from "../src/tokens/types";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Design system theme",
      toolbar: {
        title: "Theme",
        icon: "paintbrush",
        items: THEME_IDS.map((id) => ({ value: id, title: id })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "dark-obsidian",
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme || "dark-obsidian";
      document.documentElement.setAttribute("data-theme", theme);
      return <Story />;
    },
  ],
  parameters: {
    backgrounds: { disable: true },
  },
};

export default preview;
