import type { Preview } from "@storybook/react-vite";
import "../src/app/index.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "dark",
      values: [
        { name: "dark", value: "#1a1a2e" }, // Must match --color-surface-primary in tokens/colors.css
        { name: "light", value: "#ffffff" },
      ],
    },
  },
};

export default preview;
