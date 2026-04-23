import { afterEach, describe, expect, it } from "vitest";
import { isFocusLossLockSuppressed, resetFocusLossLockSuppressionForTests, suppressFocusLossLock } from "../main/focus-loss-lock";

afterEach(() => {
  resetFocusLossLockSuppressionForTests();
});

describe("focus loss lock suppression", () => {
  it("stays suppressed until the release callback runs", () => {
    expect(isFocusLossLockSuppressed()).toBe(false);

    const release = suppressFocusLossLock();

    expect(isFocusLossLockSuppressed()).toBe(true);

    release();

    expect(isFocusLossLockSuppressed()).toBe(false);
  });

  it("keeps nested suppressions active until all are released", () => {
    const releaseFirst = suppressFocusLossLock();
    const releaseSecond = suppressFocusLossLock();

    releaseFirst();
    expect(isFocusLossLockSuppressed()).toBe(true);

    releaseSecond();
    expect(isFocusLossLockSuppressed()).toBe(false);
  });
});
