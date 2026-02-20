import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: "jsdom",
      setupFiles: ["./src/app/vitest.setup.ts"],
      include: ["src/**/*.test.{ts,tsx}"],
    },
  }),
);
