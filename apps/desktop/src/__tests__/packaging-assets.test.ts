import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const forgeConfigSource = readFileSync(path.resolve(__dirname, "../../forge.config.ts"), "utf8");

describe("desktop packaging assets", () => {
  it("copies assets folder into packaged resources", () => {
    expect(forgeConfigSource).toContain('extraResource: ["./assets"]');
  });
});
