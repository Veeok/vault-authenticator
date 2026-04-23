import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "@authenticator/backup": path.resolve(__dirname, "../../packages/backup/src/index.ts"),
      "@authenticator/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@desktop-diagnostics": path.resolve(
        __dirname,
        mode === "production" ? "src/main/diagnostics.prod.ts" : "src/main/diagnostics.dev.ts"
      ),
    },
  },
  build: {
    rollupOptions: {
      external: ["@node-rs/argon2"],
    },
  },
}));
