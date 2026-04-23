/// <reference types="vitest/config" />

import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@desktop-diagnostics": path.resolve(__dirname, "src/main/diagnostics.prod.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
  },
});
