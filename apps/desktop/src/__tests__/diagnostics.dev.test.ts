import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const appendFileSyncMock = vi.hoisted(() => vi.fn());
const mkdirSyncMock = vi.hoisted(() => vi.fn());
const appState = vi.hoisted(() => ({ isPackaged: false }));
const getPathMock = vi.hoisted(() => vi.fn(() => "C:/Users/Veok/AppData/Roaming/Vault Authenticator"));

vi.mock("electron", () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged;
    },
    getPath: getPathMock,
  },
}));

vi.mock("node:fs", () => ({
  appendFileSync: appendFileSyncMock,
  mkdirSync: mkdirSyncMock,
}));

describe("dev diagnostics logging", () => {
  beforeEach(() => {
    vi.resetModules();
    appendFileSyncMock.mockReset();
    mkdirSyncMock.mockReset();
    getPathMock.mockReset();
    getPathMock.mockReturnValue("C:/Users/Veok/AppData/Roaming/Vault Authenticator");
    appState.isPackaged = false;
  });

  it("writes only to the userData diagnostics log with redaction", async () => {
    const diagnostics = await import("../main/diagnostics.dev");
    diagnostics.logDesktopDebug("otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP", {
      sessionToken: "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456",
      recoverySecret: "ABCDEF-GHJKLM-NPQRST-UVWXYZ-234567-89ABCD-EFGHJK-LMNPQR",
      wrappedKey: "0123456789abcdef0123456789abcdef",
    });

    const expectedPath = path.join("C:/Users/Veok/AppData/Roaming/Vault Authenticator", "logs", "dev-diagnostics.log");
    expect(mkdirSyncMock).toHaveBeenCalledWith(path.dirname(expectedPath), { recursive: true });
    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    expect(appendFileSyncMock).toHaveBeenCalledWith(
      expectedPath,
      expect.stringContaining("[REDACTED_OTPAUTH_URI]"),
      "utf8"
    );

    const writtenLine = appendFileSyncMock.mock.calls[0]?.[1];
    expect(String(writtenLine)).toContain("[REDACTED_SESSIONTOKEN]");
    expect(String(writtenLine)).toContain("[REDACTED_RECOVERYSECRET]");
    expect(String(writtenLine)).toContain("[REDACTED_WRAPPEDKEY]");
  });

  it("skips file output entirely in packaged builds", async () => {
    appState.isPackaged = true;
    const diagnostics = await import("../main/diagnostics.dev");
    diagnostics.logDesktopDebug("test", { token: "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456" });

    expect(mkdirSyncMock).not.toHaveBeenCalled();
    expect(appendFileSyncMock).not.toHaveBeenCalled();
  });
});
