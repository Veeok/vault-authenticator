import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const argon2Mock = vi.hoisted(() => ({
  argon2id: 2,
  hash: vi.fn(async (value: string) => `$argon2$${value}`),
  verify: vi.fn(async (stored: string, value: string) => stored === `$argon2$${value}`),
}));

const secureState = vi.hoisted(() => ({
  lockMethod: "none" as const,
  quickUnlock: { windowsHello: false, passkey: false },
  pinCredential: undefined as { hash: string; salt?: string; digits: 4 | 6 } | undefined,
  passwordCredential: undefined as { hash: string; salt?: string } | undefined,
  patternCredential: undefined as { hash: string; salt?: string } | undefined,
  lockState: { failedCount: 0, lockUntilEpochMs: 0 },
  pinLockState: { failedCount: 0, lockUntilEpochMs: 0 },
  passwordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
  patternLockState: { failedCount: 0, lockUntilEpochMs: 0 },
}));

vi.mock("@node-rs/argon2", () => ({
  Algorithm: {
    Argon2id: argon2Mock.argon2id,
  },
  hash: argon2Mock.hash,
  verify: argon2Mock.verify,
}));

vi.mock("../main/secure-store", () => ({
  loadPinCredential: () => secureState.pinCredential,
  savePinCredential: (record: { hash: string; salt?: string; digits: 4 | 6 }) => {
    secureState.pinCredential = record;
  },
  clearPinCredential: () => {
    secureState.pinCredential = undefined;
  },
  loadPasswordCredential: () => secureState.passwordCredential,
  savePasswordCredential: (record: { hash: string; salt?: string }) => {
    secureState.passwordCredential = record;
  },
  clearPasswordCredential: () => {
    secureState.passwordCredential = undefined;
  },
  loadPatternCredential: () => secureState.patternCredential,
  savePatternCredential: (record: { hash: string; salt?: string }) => {
    secureState.patternCredential = record;
  },
  clearPatternCredential: () => {
    secureState.patternCredential = undefined;
  },
  loadLockMethod: () => secureState.lockMethod,
  saveLockMethod: (): void => undefined,
  loadQuickUnlock: () => secureState.quickUnlock,
  saveQuickUnlock: (): void => undefined,
  loadLockState: () => secureState.lockState,
  saveLockState: (state: { failedCount: number; lockUntilEpochMs: number }) => {
    secureState.lockState = state;
  },
  loadCredentialLockState: (type: "pin" | "password" | "pattern") => {
    if (type === "password") return secureState.passwordLockState;
    if (type === "pattern") return secureState.patternLockState;
    return secureState.pinLockState;
  },
  saveCredentialLockState: (type: "pin" | "password" | "pattern", state: { failedCount: number; lockUntilEpochMs: number; disabledAtEpochMs?: number }) => {
    if (type === "password") {
      secureState.passwordLockState = state;
      return;
    }
    if (type === "pattern") {
      secureState.patternLockState = state;
      return;
    }
    secureState.pinLockState = state;
    secureState.lockState = { failedCount: state.failedCount, lockUntilEpochMs: state.lockUntilEpochMs };
  },
}));

function legacySha(value: string, salt: string): string {
  return createHash("sha256")
    .update(`${value}${salt}`)
    .digest("hex");
}

describe("lock-store", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    secureState.pinCredential = undefined;
    secureState.passwordCredential = undefined;
    secureState.patternCredential = undefined;
    secureState.lockState = { failedCount: 0, lockUntilEpochMs: 0 };
    secureState.pinLockState = { failedCount: 0, lockUntilEpochMs: 0 };
    secureState.passwordLockState = { failedCount: 0, lockUntilEpochMs: 0 };
    secureState.patternLockState = { failedCount: 0, lockUntilEpochMs: 0 };
    argon2Mock.hash.mockClear();
    argon2Mock.verify.mockClear();
    process.env.NODE_ENV = "production";
  });

  it("hashes new 6-digit PIN credentials with Argon2id", async () => {
    const lockStore = await import("../main/lock-store");

    await lockStore.setCredential("pin", "123456");

    expect(argon2Mock.hash).toHaveBeenCalledWith(
      "123456",
      expect.objectContaining({
        algorithm: argon2Mock.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 1,
      })
    );
    expect(secureState.pinCredential?.hash).toBe("$argon2$123456");
    expect(secureState.pinCredential?.salt).toBeUndefined();
    expect(secureState.pinCredential?.digits).toBe(6);

    await expect(lockStore.verifyCredential("pin", "123456")).resolves.toBe(true);
    await expect(lockStore.verifyCredential("pin", "999999")).resolves.toBe(false);
  });

  it("rejects new 4-digit PIN setup when no legacy PIN exists", async () => {
    const lockStore = await import("../main/lock-store");

    await expect(lockStore.setCredential("pin", "1234")).rejects.toThrow("New PIN setup requires 6 digits.");
  });

  it("keeps existing 4-digit PIN users compatible", async () => {
    secureState.pinCredential = {
      hash: "$argon2$1234",
      digits: 4,
    };

    const lockStore = await import("../main/lock-store");

    await expect(lockStore.verifyCredential("pin", "1234")).resolves.toBe(true);
    await expect(lockStore.setCredential("pin", "4321")).resolves.toBeUndefined();
    expect(secureState.pinCredential?.digits).toBe(4);
  });

  it("migrates legacy SHA PIN hash to Argon2id on successful verify", async () => {
    const salt = "00112233445566778899aabbccddeeff";
    secureState.pinCredential = {
      hash: legacySha("1234", salt),
      salt,
      digits: 4,
    };

    const lockStore = await import("../main/lock-store");
    const ok = await lockStore.verifyCredential("pin", "1234");

    expect(ok).toBe(true);
    expect(argon2Mock.hash).toHaveBeenCalledWith(
      "1234",
      expect.objectContaining({
        algorithm: argon2Mock.argon2id,
      })
    );
    expect(secureState.pinCredential?.hash).toBe("$argon2$1234");
    expect(secureState.pinCredential?.salt).toBeUndefined();
    expect(secureState.pinCredential?.digits).toBe(4);
  });

  it("enforces persisted PIN attempt backoff and lockout", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T00:00:00.000Z"));

    const lockStore = await import("../main/lock-store");
    await lockStore.setCredential("pin", "123456");

    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 1,
    });

    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 2,
    });
    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 3,
    });

    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "LOCKED",
      attemptsUsed: 4,
      lockedUntil: Date.now() + 5000,
    });
    expect(secureState.pinLockState).toEqual({ failedCount: 4, lockUntilEpochMs: Date.now() + 5000 });

    vi.advanceTimersByTime(5000);
    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "LOCKED",
      attemptsUsed: 5,
      lockedUntil: Date.now() + 5000,
    });

    vi.advanceTimersByTime(5000);
    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "LOCKED",
      attemptsUsed: 6,
      lockedUntil: Date.now() + 5000,
    });

    vi.advanceTimersByTime(5000);
    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "LOCKED",
      attemptsUsed: 7,
      lockedUntil: Date.now() + 30000,
    });

    vi.advanceTimersByTime(30000);
    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "LOCKED",
      attemptsUsed: 8,
      lockedUntil: Date.now() + 30000,
    });

    vi.advanceTimersByTime(30000);
    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "LOCKED",
      attemptsUsed: 9,
      lockedUntil: Date.now() + 30000,
    });

    vi.advanceTimersByTime(30000);
    await expect(lockStore.verifyCredentialWithLimit("pin", "000000")).resolves.toEqual({
      result: "LOCKED",
      attemptsUsed: 10,
      lockedUntil: 0,
      disabled: true,
    });
    expect(secureState.pinLockState).toEqual({ failedCount: 10, lockUntilEpochMs: 0, disabledAtEpochMs: Date.now() });
  });

  it("clears lock state after successful PIN verification", async () => {
    const lockStore = await import("../main/lock-store");
    await lockStore.setCredential("pin", "123456");

    secureState.pinLockState = {
      failedCount: 3,
      lockUntilEpochMs: 0,
    };

    await expect(lockStore.verifyCredentialWithLimit("pin", "123456")).resolves.toEqual({ result: "OK" });
    expect(secureState.pinLockState).toEqual({ failedCount: 0, lockUntilEpochMs: 0 });
  });

  it("applies the persisted lockout policy to password verification", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T00:00:00.000Z"));

    const lockStore = await import("../main/lock-store");
    await lockStore.setCredential("password", "hunter2!3456");

    await expect(lockStore.verifyCredentialWithLimit("password", "wrong-pass")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 1,
    });
    await expect(lockStore.verifyCredentialWithLimit("password", "wrong-pass")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 2,
    });
    await expect(lockStore.verifyCredentialWithLimit("password", "wrong-pass")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 3,
    });
    expect(secureState.passwordLockState).toEqual({ failedCount: 3, lockUntilEpochMs: 0 });

    await expect(lockStore.verifyCredentialWithLimit("password", "hunter2!3456")).resolves.toEqual({ result: "OK" });
    expect(secureState.passwordLockState).toEqual({ failedCount: 0, lockUntilEpochMs: 0 });
  });

  it("applies the persisted lockout policy to pattern verification", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T00:00:00.000Z"));

    const lockStore = await import("../main/lock-store");
    await lockStore.setCredential("pattern", "0,1,2,5");

    await expect(lockStore.verifyCredentialWithLimit("pattern", "0,1,2,3")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 1,
    });
    await expect(lockStore.verifyCredentialWithLimit("pattern", "0,1,2,3")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 2,
    });
    await expect(lockStore.verifyCredentialWithLimit("pattern", "0,1,2,3")).resolves.toEqual({
      result: "INCORRECT",
      attemptsUsed: 3,
    });

    await expect(lockStore.verifyCredentialWithLimit("pattern", "0,1,2,5")).resolves.toEqual({ result: "OK" });
    expect(secureState.patternLockState).toEqual({ failedCount: 0, lockUntilEpochMs: 0 });
  });
});
