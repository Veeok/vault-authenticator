import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["crypto", "buffer"],
      globals: {
        Buffer: true,
      },
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },
  resolve: {
    alias: {
      "@authenticator/backup": path.resolve(__dirname, "../../packages/backup/src/index.ts"),
      "@authenticator/core": path.resolve(__dirname, "../../packages/core/src/index.ts"),
      "@authenticator/ui": path.resolve(__dirname, "../../packages/ui/src/index.ts"),
    },
  },
});
