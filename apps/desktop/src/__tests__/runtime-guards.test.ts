import { describe, expect, it, vi } from "vitest";
import { acquireSingleInstanceLock, ensureTraySingleton } from "../main/runtime-guards";

describe("runtime guards", () => {
  it("keeps tray creation singleton across repeated calls", () => {
    const createTray = vi.fn(() => ({ id: "tray-instance" }));

    const first = ensureTraySingleton(null, createTray);
    const second = ensureTraySingleton(first, createTray);

    expect(first).toBe(second);
    expect(createTray).toHaveBeenCalledTimes(1);
  });

  it("quits when single-instance lock is not acquired", () => {
    const quit = vi.fn();
    const on = vi.fn();
    const onSecondInstance = vi.fn();

    const acquired = acquireSingleInstanceLock(
      {
        requestSingleInstanceLock: () => false,
        quit,
        on,
      },
      onSecondInstance
    );

    expect(acquired).toBe(false);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(on).not.toHaveBeenCalled();
    expect(onSecondInstance).not.toHaveBeenCalled();
  });

  it("registers and forwards second-instance event when lock is acquired", () => {
    const quit = vi.fn();
    const on = vi.fn();
    const onSecondInstance = vi.fn();

    const acquired = acquireSingleInstanceLock(
      {
        requestSingleInstanceLock: () => true,
        quit,
        on,
      },
      onSecondInstance
    );

    expect(acquired).toBe(true);
    expect(quit).not.toHaveBeenCalled();
    expect(on).toHaveBeenCalledTimes(1);

    const [eventName, listener] = on.mock.calls[0] as [string, () => void];
    expect(eventName).toBe("second-instance");
    listener();

    expect(onSecondInstance).toHaveBeenCalledTimes(1);
  });
});
