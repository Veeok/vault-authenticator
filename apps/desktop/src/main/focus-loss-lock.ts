let suppressedFocusLossLocks = 0;

export function suppressFocusLossLock(): () => void {
  suppressedFocusLossLocks += 1;

  let released = false;
  return () => {
    if (released) {
      return;
    }
    released = true;
    suppressedFocusLossLocks = Math.max(0, suppressedFocusLossLocks - 1);
  };
}

export function isFocusLossLockSuppressed(): boolean {
  return suppressedFocusLossLocks > 0;
}

export function resetFocusLossLockSuppressionForTests(): void {
  suppressedFocusLossLocks = 0;
}
