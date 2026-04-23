import { describe, expect, it, vi } from "vitest";
import { normalizeUnhandledRejectionReason, registerCrashGuards } from "../main/crash-guards";

type ListenerMap = Map<string, (...args: unknown[]) => void>;

function registerListener(map: ListenerMap, event: string, listener: (...args: unknown[]) => void): void {
  map.set(event, listener);
}

describe("crash guards", () => {
  it("normalizes unhandled rejection error objects", () => {
    const normalized = normalizeUnhandledRejectionReason(new Error("boom"));
    expect(normalized.message).toBe("boom");
    expect(normalized.stack).toBeTypeOf("string");
  });

  it("normalizes unhandled rejection non-error values", () => {
    const normalized = normalizeUnhandledRejectionReason({ type: "unknown" });
    expect(normalized).toEqual({ message: "[object Object]" });
  });

  it("registers process and app crash handlers with diagnostic logging", () => {
    const processListeners: ListenerMap = new Map();
    const appListeners: ListenerMap = new Map();
    const log = vi.fn();

    registerCrashGuards({
      processLike: {
        on: (event, listener) => {
          registerListener(processListeners, event, listener as (...args: unknown[]) => void);
        },
      },
      appLike: {
        on: (event, listener) => {
          registerListener(appListeners, event, listener as (...args: unknown[]) => void);
        },
      },
      log,
    });

    const uncaughtException = processListeners.get("uncaughtException");
    const unhandledRejection = processListeners.get("unhandledRejection");
    const renderGone = appListeners.get("render-process-gone");
    const childGone = appListeners.get("child-process-gone");

    expect(uncaughtException).toBeTypeOf("function");
    expect(unhandledRejection).toBeTypeOf("function");
    expect(renderGone).toBeTypeOf("function");
    expect(childGone).toBeTypeOf("function");

    uncaughtException?.(new Error("uncaught"));
    unhandledRejection?.("rejected");
    renderGone?.(
      undefined,
      {
        getURL: () => "file://index.html",
      },
      {
        reason: "crashed",
        exitCode: 1,
      }
    );
    childGone?.(undefined, {
      type: "Utility",
      reason: "crashed",
      exitCode: 2,
      serviceName: "network-service",
      name: "utility-process",
    });

    expect(log).toHaveBeenCalledWith(
      "process uncaughtException",
      expect.objectContaining({ message: "uncaught", name: "Error" })
    );
    expect(log).toHaveBeenCalledWith("process unhandledRejection", { message: "rejected" });
    expect(log).toHaveBeenCalledWith("render-process-gone", {
      reason: "crashed",
      exitCode: 1,
      url: "file://index.html",
    });
    expect(log).toHaveBeenCalledWith("child-process-gone", {
      type: "Utility",
      reason: "crashed",
      exitCode: 2,
      serviceName: "network-service",
      name: "utility-process",
    });
  });
});
