import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@authenticator/backup": path.resolve(__dirname, "../../packages/backup/src/index.ts"),
      "@authenticator/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@authenticator/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
