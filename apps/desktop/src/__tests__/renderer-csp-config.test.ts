import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import rendererConfig from "../../vite.renderer.config";

describe("renderer CSP config", () => {
  it("injects prod CSP meta during build", async () => {
    const plugins = ((rendererConfig as { plugins?: unknown[] }).plugins ?? []) as Array<Record<string, unknown>>;
    const cspPlugin = plugins.find((entry) => entry && entry.name === "desktop-prod-csp-meta");

    expect(cspPlugin).toBeTruthy();
    expect(cspPlugin?.apply).toBe("build");
    expect(typeof cspPlugin?.transformIndexHtml).toBe("function");

    const inputHtml = "<!doctype html><html><head><title>Vault Authenticator</title></head><body><div id=\"app\"></div></body></html>";
    const transformed = await (cspPlugin?.transformIndexHtml as (html: string) => string | Promise<string>)(inputHtml);

    expect(transformed).toContain("http-equiv=\"Content-Security-Policy\"");
    expect(transformed).toContain("default-src 'self'");
    expect(transformed).toContain("connect-src 'self'");
  });

  it("keeps the development index template free of a hardcoded CSP meta tag", () => {
    const sourceIndexHtml = readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
    expect(sourceIndexHtml).not.toContain("http-equiv=\"Content-Security-Policy\"");
  });
});
