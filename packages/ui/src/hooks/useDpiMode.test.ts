import { describe, expect, it } from "vitest";
import { resolveDpiMode } from "./useDpiMode";

describe("resolveDpiMode", () => {
  it("stays full at normal density with wide viewports", () => {
    expect(resolveDpiMode({ innerWidth: 1080, devicePixelRatio: 1 })).toBe("full");
  });

  it("switches to compact when high DPI reduces effective width", () => {
    expect(resolveDpiMode({ innerWidth: 1080, devicePixelRatio: 2 })).toBe("compact");
  });

  it("uses the visual viewport width when available", () => {
    expect(resolveDpiMode({ innerWidth: 1200, visualViewportWidth: 720, devicePixelRatio: 1 })).toBe("compact");
  });
});
