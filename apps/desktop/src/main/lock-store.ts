import { Algorithm, hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { createHash, timingSafeEqual } from "node:crypto";
import { getVaultPasswordPolicyIssue, getVaultPasswordPolicyMessage, VAULT_PASSWORD_MAX_LENGTH } from "@authenticator/core";
import {
  clearPasswordCredential,
  clearPatternCredential,
  clearPinCredential,
  loadCredentialLockState,
  loadLockMethodsConfig,
  loadLockMethod,
  loadLockState,
  loadPasskeyCredentials,
  loadPasswordCredential,
  loadPatternCredential,
  loadPinCredential,
  loadQuickUnlock,
  saveLockMethodsConfig,
  saveLockMethod,
  saveCredentialLockState,
  saveLockState,
  savePasswordCredential,
  savePatternCredential,
  savePinCredential,
  saveQuickUnlock,
  type LockMethodsConfig,
  type LockMethodKind,
  type LockMethod,
  type LockState,
  type QuickUnlockConfig,
  type SecureLockMethodKind,
} from "./secure-store";

export type CredentialType = "pin" | "password" | "pattern";
export type CredentialLockMethod = "pin4" | "pin6" | "password" | "pattern";
export type MultiLockMethod = LockMethodKind;
export type MultiSecureLockMethod = SecureLockMethodKind;
export type MultiLockMethodsConfig = LockMethodsConfig;

export type VerifyCredentialResult =
  | { result: "OK" }
  | { result: "INCORRECT"; attemptsUsed: number }
  | { result: "LOCKED"; lockedUntil: number; attemptsUsed: number; disabled?: boolean };

const DEFAULT_LOCK_STATE: LockState = {
  failedCount: 0,
  lockUntilEpochMs: 0,
};

const ARGON2_OPTIONS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
} as const;

let benchLogged = false;

async function benchmarkArgon2IfNeeded(): Promise<void> {
  if (benchLogged || process.env.NODE_ENV === "production") return;
  benchLogged = true;
  try {
    const start = Date.now();
    await argon2Hash("test", ARGON2_OPTIONS);
    console.log(`[bench] Argon2id hash time: ${Date.now() - start}ms`);
  } catch {
    // no-op
  }
}

void benchmarkArgon2IfNeeded();

function hashLegacyValue(value: string, salt: string): string {
  return createHash("sha256")
    .update(`${value}${salt}`)
    .digest("hex");
}

function compareHexHashes(expectedHex: string, actualHex: string): boolean {
  const expectedBuffer = Buffer.from(expectedHex, "hex");
  const actualBuffer = Buffer.from(actualHex, "hex");
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

function normalizePin(value: string): { normalized: string; digits: 4 | 6 } {
  const normalized = value.replace(/\D/g, "");
  if (normalized.length !== 4 && normalized.length !== 6) {
    throw new Error("PIN must be exactly 4 or 6 numeric digits.");
  }
  return { normalized, digits: normalized.length as 4 | 6 };
}

function normalizePasswordForVerify(value: string): string {
  if (typeof value !== "string") {
    throw new Error("Password is required.");
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > VAULT_PASSWORD_MAX_LENGTH) {
    throw new Error(`Password must be 1-${VAULT_PASSWORD_MAX_LENGTH} characters.`);
  }
  return normalized;
}

function normalizePasswordForSet(value: string): string {
  const normalized = normalizePasswordForVerify(value);
  const issue = getVaultPasswordPolicyIssue(normalized);
  if (issue) {
    throw new Error(getVaultPasswordPolicyMessage(issue));
  }
  return normalized;
}

function normalizePattern(value: string): string {
  if (typeof value !== "string") {
    throw new Error("Pattern is required.");
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (parts.length < 4 || parts.length > 9) {
    throw new Error("Pattern must connect at least 4 nodes.");
  }

  const unique = new Set<number>();
  const nodes: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      throw new Error("Pattern format is invalid.");
    }
    const node = Number(part);
    if (!Number.isInteger(node) || node < 0 || node > 8) {
      throw new Error("Pattern nodes must be between 0 and 8.");
    }
    if (unique.has(node)) {
      throw new Error("Pattern nodes cannot repeat.");
    }
    unique.add(node);
    nodes.push(node);
  }

  return nodes.join(",");
}

function normalizeCredentialForSet(type: CredentialType, value: string): { normalized: string; pinDigits?: 4 | 6 } {
  if (type === "pin") {
    const pin = normalizePin(value);
    return { normalized: pin.normalized, pinDigits: pin.digits };
  }
  if (type === "password") {
    return { normalized: normalizePasswordForSet(value) };
  }
  return { normalized: normalizePattern(value) };
}

function normalizeCredentialForVerify(type: CredentialType, value: string): { normalized: string; pinDigits?: 4 | 6 } {
  if (type === "pin") {
    const pin = normalizePin(value);
    return { normalized: pin.normalized, pinDigits: pin.digits };
  }
  if (type === "password") {
    return { normalized: normalizePasswordForVerify(value) };
  }
  return { normalized: normalizePattern(value) };
}

function pickStoredCredential(type: CredentialType): { hash: string; salt?: string; digits?: 4 | 6 } | undefined {
  if (type === "pin") return loadPinCredential();
  if (type === "password") return loadPasswordCredential();
  return loadPatternCredential();
}

async function saveNormalizedCredential(type: CredentialType, normalized: string, pinDigits?: 4 | 6): Promise<void> {
  const hash = await argon2Hash(normalized, ARGON2_OPTIONS);
  if (type === "pin") {
    savePinCredential({ hash, digits: pinDigits === 6 ? 6 : 4 });
    saveCredentialLockState("pin", DEFAULT_LOCK_STATE);
    return;
  }
  if (type === "password") {
    savePasswordCredential({ hash });
    saveCredentialLockState("password", DEFAULT_LOCK_STATE);
    return;
  }
  savePatternCredential({ hash });
  saveCredentialLockState("pattern", DEFAULT_LOCK_STATE);
}

export async function setCredential(type: CredentialType, value: string, digitsOverride?: 4 | 6): Promise<void> {
  const { normalized, pinDigits } = normalizeCredentialForSet(type, value);
  const nextDigits = digitsOverride === 6 ? 6 : digitsOverride === 4 ? 4 : pinDigits;
  if (type === "pin" && nextDigits === 4) {
    const existingDigits = loadPinCredential()?.digits;
    if (existingDigits !== 4) {
      throw new Error("New PIN setup requires 6 digits.");
    }
  }
  await saveNormalizedCredential(type, normalized, nextDigits);
}

export async function verifyCredential(type: CredentialType, input: string): Promise<boolean> {
  const stored = pickStoredCredential(type);
  if (!stored || typeof stored.hash !== "string") return false;

  let normalized = "";
  let normalizedPinDigits: 4 | 6 | undefined;
  try {
    const normalizedPayload = normalizeCredentialForVerify(type, input);
    normalized = normalizedPayload.normalized;
    normalizedPinDigits = normalizedPayload.pinDigits;
    if (type === "pin" && stored.digits && normalized.length !== stored.digits) {
      return false;
    }
  } catch {
    return false;
  }

  if (!stored.hash.startsWith("$argon2")) {
    if (!stored.salt) return false;
    const legacyHash = hashLegacyValue(normalized, stored.salt);
    if (!compareHexHashes(stored.hash, legacyHash)) {
      return false;
    }
    const migrationDigits = type === "pin" ? stored.digits ?? normalizedPinDigits ?? 4 : undefined;
    await saveNormalizedCredential(type, normalized, migrationDigits);
    return true;
  }

  try {
    return await argon2Verify(stored.hash, normalized);
  } catch {
    return false;
  }
}

function delaySecondsForFailure(failedCount: number): number {
  if (failedCount <= 3) return 0;
  if (failedCount <= 6) return 5;
  if (failedCount <= 9) return 30;
  return 0;
}

export function getCredentialLockState(): LockState {
  const currentType = lockMethodCredentialType(getLockMethod());
  return currentType ? loadCredentialLockState(currentType) : loadLockState();
}

export function setCredentialLockState(state: LockState): void {
  saveLockState(state);
}

export function clearCredentialLockState(): void {
  saveCredentialLockState("pin", DEFAULT_LOCK_STATE);
  saveCredentialLockState("password", DEFAULT_LOCK_STATE);
  saveCredentialLockState("pattern", DEFAULT_LOCK_STATE);
}

export async function verifyCredentialWithLimit(type: CredentialType, input: string): Promise<VerifyCredentialResult> {
  const state = loadCredentialLockState(type);
  const now = Date.now();
  if ((state.disabledAtEpochMs ?? 0) > 0) {
    return { result: "LOCKED", lockedUntil: state.lockUntilEpochMs, attemptsUsed: state.failedCount, disabled: true };
  }
  if (state.lockUntilEpochMs > now) {
    return { result: "LOCKED", lockedUntil: state.lockUntilEpochMs, attemptsUsed: state.failedCount };
  }

  const correct = await verifyCredential(type, input);
  if (correct) {
    saveCredentialLockState(type, DEFAULT_LOCK_STATE);
    return { result: "OK" };
  }

  const newCount = Math.min(state.failedCount + 1, 10);
  if (newCount >= 10) {
    saveCredentialLockState(type, { failedCount: newCount, lockUntilEpochMs: 0, disabledAtEpochMs: now });
    return { result: "LOCKED", lockedUntil: 0, attemptsUsed: newCount, disabled: true };
  }
  const delaySeconds = delaySecondsForFailure(newCount);
  const lockUntil = delaySeconds > 0 ? now + delaySeconds * 1000 : 0;
  saveCredentialLockState(type, { failedCount: newCount, lockUntilEpochMs: lockUntil });

  if (lockUntil > now) {
    return { result: "LOCKED", lockedUntil: lockUntil, attemptsUsed: newCount };
  }
  return { result: "INCORRECT", attemptsUsed: newCount };
}

export function hasCredential(type: CredentialType): boolean {
  return !!pickStoredCredential(type);
}

export function clearCredential(type: CredentialType): void {
  if (type === "pin") {
    clearPinCredential();
    saveCredentialLockState("pin", DEFAULT_LOCK_STATE);
    return;
  }
  if (type === "password") {
    clearPasswordCredential();
    saveCredentialLockState("password", DEFAULT_LOCK_STATE);
    return;
  }
  clearPatternCredential();
  saveCredentialLockState("pattern", DEFAULT_LOCK_STATE);
}

function normalizeMethod(method: string): LockMethod {
  if (method === "none") return "none";
  if (method === "swipe") return "swipe";
  if (method === "pin4") return "pin4";
  if (method === "pin6") return "pin6";
  if (method === "pin") return "pin4";
  if (method === "password") return "password";
  if (method === "pattern") return "pattern";
  if (method === "passkey") return "passkey";
  throw new Error("Unsupported lock method.");
}

export function setLockMethod(method: string): void {
  saveLockMethod(normalizeMethod(method));
}

export function getLockMethod(): LockMethod {
  return loadLockMethod();
}

export function getLockMethodsConfig(): MultiLockMethodsConfig {
  return loadLockMethodsConfig();
}

export function setLockMethodsConfig(config: MultiLockMethodsConfig): void {
  saveLockMethodsConfig(config);
}

export function methodUsesCredential(method: LockMethod): method is CredentialLockMethod {
  return method === "pin4" || method === "pin6" || method === "password" || method === "pattern";
}

export function lockMethodCredentialType(method: LockMethod): CredentialType | null {
  if (method === "pin4" || method === "pin6") return "pin";
  if (method === "password") return "password";
  if (method === "pattern") return "pattern";
  return null;
}

export function lockMethodSupportsQuickUnlock(method: LockMethod): boolean {
  return method === "pin4" || method === "pin6" || method === "password" || method === "pattern" || method === "passkey";
}

export function shouldRequireLockOnStartup(): boolean {
  const method = getLockMethod();
  if (method === "none" || method === "swipe") return false;
  if (method === "passkey") {
    return loadPasskeyCredentials().length > 0;
  }

  const credentialType = lockMethodCredentialType(method);
  if (!credentialType) return false;
  if (!hasCredential(credentialType)) return false;

  if (credentialType === "pin") {
    const digits = getPinDigits();
    return method === "pin6" ? digits === 6 : digits === 4;
  }

  return true;
}

export function getPinDigits(): 4 | 6 {
  return loadPinCredential()?.digits ?? 4;
}

export function getQuickUnlock(): QuickUnlockConfig {
  return loadQuickUnlock();
}

export function setQuickUnlock(update: Partial<QuickUnlockConfig>): void {
  const current = loadQuickUnlock();
  saveQuickUnlock({
    windowsHello: update.windowsHello === undefined ? current.windowsHello : !!update.windowsHello,
    passkey: update.passkey === undefined ? current.passkey : !!update.passkey,
  });
}
