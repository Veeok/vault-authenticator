import path from "node:path";
import { defineConfig } from "vite";

const workspaceRoot = path.resolve(__dirname, "../..");
const APP_PROTOCOL_ORIGIN = "app://vault-authenticator";
const PROD_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  `frame-src 'self' ${APP_PROTOCOL_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export default defineConfig({
  plugins: [
    {
      name: "desktop-prod-csp-meta",
      apply: "build",
      transformIndexHtml(html) {
        if (html.includes("http-equiv=\"Content-Security-Policy\"")) {
          return html;
        }

        const meta = `<meta http-equiv="Content-Security-Policy" content="${PROD_CONTENT_SECURITY_POLICY}" />`;
        return html.replace("</head>", `  ${meta}\n  </head>`);
      },
    },
  ],
  resolve: {
    alias: {
      "@authenticator/backup": path.resolve(workspaceRoot, "packages/backup/src/index.ts"),
      "@authenticator/core": path.resolve(workspaceRoot, "packages/core/src/browser.ts"),
      "@authenticator/ui": path.resolve(workspaceRoot, "packages/ui/src/index.ts"),
    },
  },
  optimizeDeps: {
    exclude: ["@authenticator/backup", "@authenticator/core", "@authenticator/ui"],
  },
  server: {
    fs: {
      allow: [workspaceRoot],
    },
  },
});
