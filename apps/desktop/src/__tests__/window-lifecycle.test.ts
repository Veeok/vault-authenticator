import { describe, expect, it } from "vitest";
import { shouldHideOnWindowClose } from "../main/window-lifecycle";

describe("window lifecycle close policy", () => {
  it("hides window on close when running in background", () => {
    expect(
      shouldHideOnWindowClose({
        isQuitting: false,
        runInBackground: true,
      })
    ).toBe(true);
  });

  it("allows close to proceed when run in background is disabled", () => {
    expect(
      shouldHideOnWindowClose({
        isQuitting: false,
        runInBackground: false,
      })
    ).toBe(false);
  });

  it("allows close to proceed during quit flow", () => {
    expect(
      shouldHideOnWindowClose({
        isQuitting: true,
        runInBackground: true,
      })
    ).toBe(false);
  });
});
