/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcMainInvokeEvent } from "electron";

type LockMethod = "none" | "swipe" | "pin4" | "pin6" | "password" | "pattern" | "passkey";
type IpcHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown | Promise<unknown>;

const handlers = vi.hoisted(() => new Map<string, IpcHandler>());
const fromWebContentsMock = vi.hoisted(() => vi.fn());
const senderWindowMap = vi.hoisted(() => new Map<object, object>());
const getAppPathMock = vi.hoisted(() => vi.fn(() => "C:/trusted-app"));
const appIsPackagedState = vi.hoisted(() => ({ value: false }));
const canPromptTouchIDMock = vi.hoisted(() => vi.fn(() => false));
const promptTouchIDMock = vi.hoisted(() => vi.fn(async () => false));
const getUserDefaultMock = vi.hoisted(() => vi.fn(() => false));
const showSaveDialogMock = vi.hoisted(() => vi.fn(async () => ({ canceled: true })));
const showOpenDialogMock = vi.hoisted(() => vi.fn(async () => ({ canceled: true, filePaths: [] })));
const writeFileMock = vi.hoisted(() => vi.fn(async () => undefined));
const readFileMock = vi.hoisted(() => vi.fn(async () => "{}"));
const setLockMethodMock = vi.hoisted(() => vi.fn());
const setCredentialMock = vi.hoisted(() => vi.fn(async () => undefined));
const clearCredentialMock = vi.hoisted(() => vi.fn());
const clearCredentialLockStateMock = vi.hoisted(() => vi.fn());
const clearPasskeyCredentialMock = vi.hoisted(() => vi.fn());
const saveAccountsMock = vi.hoisted(() => vi.fn());
const setQuickUnlockMock = vi.hoisted(() => vi.fn());
const getQuickUnlockMock = vi.hoisted(() => vi.fn(() => ({ windowsHello: false, passkey: false })));
const setLockMethodsConfigMock = vi.hoisted(() => vi.fn());
const loadAccountsMock = vi.hoisted(() => vi.fn(() => []));
const clearDecryptedCacheMock = vi.hoisted(() => vi.fn());
const unlockHardenedVaultWithPasswordMock = vi.hoisted(() => vi.fn(async () => ({ result: "OK" } as const)));
const unlockVaultWithBiometricMock = vi.hoisted(() => vi.fn(async () => true));
const validateAndBurnRecoverySecretMock = vi.hoisted(() => vi.fn(async () => true));
const setPasswordAfterRecoveryMock = vi.hoisted(() => vi.fn(async () => true));
const hasPendingRecoveryResetMock = vi.hoisted(() => vi.fn(() => false));
const initializeVaultWithPasswordMock = vi.hoisted(() => vi.fn(async () => undefined));
const enrollBiometricUnlockMock = vi.hoisted(() => vi.fn(async () => true));
const removeBiometricUnlockMock = vi.hoisted(() => vi.fn(async () => undefined));
const generateRecoverySecretMock = vi.hoisted(() => vi.fn(async () => "RECOVERY-SECRET"));
const rotateHardenedVaultPasswordMock = vi.hoisted(() => vi.fn(async () => undefined));
const requiresVaultPasswordSetupMock = vi.hoisted(() => vi.fn(() => false));
const ensureOuterVaultMetadataMock = vi.hoisted(() =>
  vi.fn(() => ({
    rawVaultMode: "hardened",
    resolvedVaultMode: "hardened",
    hasLegacyBlob: false,
    hasLegacyHardenedEnvelope: false,
    hasVaultEnvelope: true,
    hasAuthUiSettings: true,
    migrated: false,
  }))
);
const verifyCredentialMock = vi.hoisted(() => vi.fn(async () => true));
const verifyCredentialWithLimitMock = vi.hoisted(() => vi.fn(async () => ({ result: "INCORRECT", attemptsUsed: 1 })));
const totpCodeSyncMock = vi.hoisted(() => vi.fn(() => ({ code: "123456", remainingSeconds: 30 })));
const scanQrFromScreenMock = vi.hoisted(() => vi.fn(async () => ({ status: "cancelled" as const })));
const isOtpauthUriMock = vi.hoisted(() => vi.fn(() => false));
const getVaultProtectionStatusMock = vi.hoisted(() =>
  vi.fn(() => ({
    mode: "hardened",
    requiresMasterPassword: false,
    hardenedSessionUnlocked: true,
    masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
    biometricEnrolled: false,
    recoveryGenerated: false,
    requiresPasswordSetup: false,
  }))
);
const hasProvisionedVaultMock = vi.hoisted(() => vi.fn(() => true));
const isHardenedVaultUnlockedMock = vi.hoisted(() => vi.fn(() => false));
const getPasskeyCredentialMock = vi.hoisted(() => vi.fn(() => null));
const hasPasskeyCredentialMock = vi.hoisted(() => vi.fn(() => false));
const listPasskeyCredentialsMock = vi.hoisted(() => vi.fn(() => []));
const listPasskeySummariesMock = vi.hoisted(() => vi.fn(() => []));
const removePasskeyCredentialMock = vi.hoisted(() => vi.fn(() => false));
const renamePasskeyCredentialMock = vi.hoisted(() => vi.fn(() => false));
const savePasskeyCredentialMock = vi.hoisted(() => vi.fn());
const updatePasskeyCredentialSignCountMock = vi.hoisted(() => vi.fn(() => true));
const encryptBackupMock = vi.hoisted(() =>
  vi.fn(async () => ({
    version: 3,
    kdf: "argon2id",
    argon2Params: { m: 65536, t: 3, p: 1 },
    algorithm: "aes-256-gcm",
    salt: "salt",
    iv: "iv",
    ciphertext: "ciphertext",
    authTag: "authTag",
  }))
);
const decryptBackupMock = vi.hoisted(() => vi.fn(async () => ({ version: 1, accounts: [] })));

const lockState = vi.hoisted(() => ({
  startLocked: true,
  method: "pin6" as LockMethod,
  pinDigits: 6 as 4 | 6,
  hasPin: true,
  hasPassword: false,
  hasPattern: false,
  methodsPrimary: "pin" as "none" | "swipe" | "pin" | "password" | "pattern" | "passkey",
  methodsSecondary: null as "pin" | "password" | "pattern" | "passkey" | null,
}));

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: IpcHandler) => {
      handlers.set(channel, handler);
    },
  },
  app: {
    getAppPath: getAppPathMock,
    get isPackaged() {
      return appIsPackagedState.value;
    },
  },
  BrowserWindow: {
    fromWebContents: (...args: unknown[]) => fromWebContentsMock(...args),
  },
  clipboard: {
    readText: vi.fn(() => ""),
    clear: vi.fn(),
  },
  dialog: {
    showSaveDialog: showSaveDialogMock,
    showOpenDialog: showOpenDialogMock,
  },
  systemPreferences: {
    canPromptTouchID: canPromptTouchIDMock,
    promptTouchID: promptTouchIDMock,
    getUserDefault: getUserDefaultMock,
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
  writeFile: writeFileMock,
}));

vi.mock("@authenticator/core", () => ({
  VAULT_PASSWORD_MAX_LENGTH: 128,
  getVaultPasswordPolicyIssue: vi.fn((password: string) => (password.trim().length < 12 ? "too_short" : null)),
  getVaultPasswordPolicyMessage: vi.fn((issue: string) => (issue === "too_short" ? "Use at least 12 characters." : "Enter a password.")),
  parseOtpauthUri: vi.fn(() => ({
    issuer: "Issuer",
    label: "Label",
    secretBase32: "JBSWY3DPEHPK3PXP",
    digits: 6,
    period: 30,
    algorithm: "SHA1",
  })),
  totpCodeSync: totpCodeSyncMock,
}));

vi.mock("@authenticator/backup", () => ({
  encryptBackup: encryptBackupMock,
  decryptBackup: decryptBackupMock,
}));

vi.mock("../main/secure-store", () => ({
  clearDecryptedCache: clearDecryptedCacheMock,
  disableHardenedMode: vi.fn(async () => undefined),
  enableHardenedMode: vi.fn(async () => undefined),
  ensureOuterVaultMetadata: ensureOuterVaultMetadataMock,
  enrollBiometricUnlock: enrollBiometricUnlockMock,
  generateRecoverySecret: generateRecoverySecretMock,
  getVaultProtectionStatus: getVaultProtectionStatusMock,
  hasProvisionedVault: hasProvisionedVaultMock,
  initializeVaultWithPassword: initializeVaultWithPasswordMock,
  isHardenedVaultUnlocked: isHardenedVaultUnlockedMock,
  loadAccounts: loadAccountsMock,
  loadSettings: vi.fn(() => ({
    defaultDigits: 6,
    defaultPeriod: 30,
    hideLabelsOnSmall: false,
    privacyScreen: true,
    clipboardSafetyEnabled: true,
    runInBackground: true,
    startWithSystem: false,
    trayMenuStyle: "native",
    trayMenuAnimations: "off",
    trayMenuThemeSync: true,
    trayIconStyle: "auto",
    alwaysOnTop: false,
    baseMode: "dark",
    themeColor: "neutral",
    accentOverride: "none",
    motionMode: "system",
    pauseWhenBackground: true,
    accountsLayoutMode: "auto",
    accountsGridColumns: "auto",
    accountsDensity: "comfortable",
    biometricEnabled: true,
    autoLockSeconds: 300,
    lockOnFocusLoss: false,
  })),
  saveAccounts: saveAccountsMock,
  saveSettings: vi.fn(),
  removeBiometricUnlock: removeBiometricUnlockMock,
  requiresVaultPasswordSetup: requiresVaultPasswordSetupMock,
  rotateHardenedVaultPassword: rotateHardenedVaultPasswordMock,
  setPasswordAfterRecovery: setPasswordAfterRecoveryMock,
  unlockHardenedVaultWithPassword: unlockHardenedVaultWithPasswordMock,
  unlockVaultWithBiometric: unlockVaultWithBiometricMock,
  validateAndBurnRecoverySecret: validateAndBurnRecoverySecretMock,
  hasPendingRecoveryReset: hasPendingRecoveryResetMock,
}));

vi.mock("../main/lock-store", () => ({
  clearCredential: clearCredentialMock,
  clearCredentialLockState: clearCredentialLockStateMock,
  getCredentialLockState: vi.fn(() => ({ failedCount: 0, lockUntilEpochMs: 0 })),
  getQuickUnlock: getQuickUnlockMock,
  getLockMethod: vi.fn(() => lockState.method),
  getLockMethodsConfig: vi.fn(() => ({
    primaryLockMethod: lockState.methodsPrimary,
    secondaryLockMethod: lockState.methodsSecondary,
  })),
  getPinDigits: vi.fn(() => lockState.pinDigits),
  hasCredential: vi.fn((type: string) => {
    if (type === "pin") return lockState.hasPin;
    if (type === "password") return lockState.hasPassword;
    if (type === "pattern") return lockState.hasPattern;
    return false;
  }),
  lockMethodCredentialType: vi.fn((method: LockMethod) => {
    if (method === "pin4" || method === "pin6") return "pin";
    if (method === "password") return "password";
    if (method === "pattern") return "pattern";
    return null;
  }),
  lockMethodSupportsQuickUnlock: vi.fn(() => true),
  setQuickUnlock: setQuickUnlockMock,
  setLockMethodsConfig: setLockMethodsConfigMock,
  setCredential: setCredentialMock,
  setLockMethod: setLockMethodMock,
  shouldRequireLockOnStartup: vi.fn(() => lockState.startLocked),
  verifyCredential: verifyCredentialMock,
  verifyCredentialWithLimit: verifyCredentialWithLimitMock,
}));

vi.mock("../main/passkey-store", () => ({
  clearPasskeyCredential: clearPasskeyCredentialMock,
  getPasskeyCredential: getPasskeyCredentialMock,
  hasPasskeyCredential: hasPasskeyCredentialMock,
  listPasskeyCredentials: listPasskeyCredentialsMock,
  listPasskeySummaries: listPasskeySummariesMock,
  removePasskeyCredential: removePasskeyCredentialMock,
  renamePasskeyCredential: renamePasskeyCredentialMock,
  savePasskeyCredential: savePasskeyCredentialMock,
  updatePasskeyCredentialSignCount: updatePasskeyCredentialSignCountMock,
}));

vi.mock("../main/screen-qr", () => ({
  isOtpauthUri: isOtpauthUriMock,
  scanQrFromScreen: scanQrFromScreenMock,
}));

vi.mock("../main/diagnostics", () => ({
  logDesktopDebug: vi.fn(),
}));

function makeTrustedEvent(
  url = trustedRendererUrl(),
  winOverrides: Partial<{
    isDestroyed: () => boolean;
    getParentWindow: () => null;
    minimize: () => void;
    restore: () => void;
    isMinimized: () => boolean;
    focus: () => void;
  }> = {},
  senderId = 1
): IpcMainInvokeEvent {
  const sender: { id: number; getURL: () => string; send: (channel: string) => void } = {
    id: senderId,
    getURL: (): string => url,
    send: vi.fn(),
  };
  const win: {
    isDestroyed: () => boolean;
    webContents: unknown;
    getParentWindow: () => null;
    minimize?: () => void;
    restore?: () => void;
    isMinimized?: () => boolean;
    focus?: () => void;
  } = {
    isDestroyed: (): boolean => false,
    webContents: sender,
    getParentWindow: (): null => null,
    ...winOverrides,
  };
  senderWindowMap.set(sender, win);
  fromWebContentsMock.mockImplementation((webContents: unknown) => senderWindowMap.get(webContents as object) ?? null);
  return { sender } as unknown as IpcMainInvokeEvent;
}

function makeUntrustedEvent(url = "data:text/html,overlay"): IpcMainInvokeEvent {
  const sender: { getURL: () => string } = {
    getURL: (): string => url,
  };
  const win: {
    isDestroyed: () => boolean;
    webContents: unknown;
    getParentWindow: () => { id: number };
  } = {
    isDestroyed: (): boolean => false,
    webContents: sender,
    getParentWindow: (): { id: number } => ({ id: 1 }),
  };
  senderWindowMap.set(sender, win);
  fromWebContentsMock.mockImplementation((webContents: unknown) => senderWindowMap.get(webContents as object) ?? null);
  return { sender } as unknown as IpcMainInvokeEvent;
}

async function registerHandlers(): Promise<typeof import("../main/ipc-handlers")> {
  handlers.clear();
  vi.resetModules();
  const module = await import("../main/ipc-handlers");
  module.registerIpc();
  return module;
}

function getHandler(channel: string): IpcHandler {
  const handler = handlers.get(channel);
  if (!handler) {
    throw new Error(`Missing IPC handler for ${channel}`);
  }
  return handler;
}

function toBase64url(value: Uint8Array | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function unwrapIpcOk<T>(value: unknown): T {
  expect(value).toMatchObject({ ok: true });
  return (value as { ok: true; data: T }).data;
}

function unwrapIpcError(value: unknown): { code: string; message: string } {
  expect(value).toMatchObject({ ok: false, error: expect.any(Object) });
  return (value as { ok: false; error: { code: string; message: string } }).error;
}

function trustedRendererUrl(): string {
  return "app://vault-authenticator/index.html";
}

function trustedRendererOrigin(): string {
  return "app://vault-authenticator";
}

function trustedRendererRpId(): string {
  return "vault-authenticator";
}

function makeAuthenticatorData(rpId: string, flags = 0x05, signCount = 1): Uint8Array {
  const rpIdHash = createHash("sha256").update(rpId).digest();
  const bytes = Buffer.alloc(37);
  rpIdHash.copy(bytes, 0);
  bytes[32] = flags;
  bytes.writeUInt32BE(signCount, 33);
  return new Uint8Array(bytes);
}

function toBase64(value: Uint8Array | Buffer): string {
  return Buffer.from(value).toString("base64");
}

function encodeCborLength(major: number, length: number): Buffer {
  if (length < 24) {
    return Buffer.from([(major << 5) | length]);
  }
  if (length < 0x100) {
    return Buffer.from([(major << 5) | 24, length]);
  }
  return Buffer.from([(major << 5) | 25, (length >> 8) & 0xff, length & 0xff]);
}

function encodeCborInt(value: number): Buffer {
  if (value >= 0) {
    return encodeCborLength(0, value);
  }
  return encodeCborLength(1, -1 - value);
}

function encodeCborText(value: string): Buffer {
  const encoded = Buffer.from(value, "utf8");
  return Buffer.concat([encodeCborLength(3, encoded.length), encoded]);
}

function encodeCborBytes(value: Uint8Array | Buffer): Buffer {
  const encoded = Buffer.from(value);
  return Buffer.concat([encodeCborLength(2, encoded.length), encoded]);
}

function encodeCborMap(entries: Array<[Buffer, Buffer]>): Buffer {
  return Buffer.concat([encodeCborLength(5, entries.length), ...entries.flat()]);
}

function makeCoseEc2PublicKey(x = Buffer.alloc(32, 1), y = Buffer.alloc(32, 2)): Buffer {
  return encodeCborMap([
    [encodeCborInt(1), encodeCborInt(2)],
    [encodeCborInt(3), encodeCborInt(-7)],
    [encodeCborInt(-1), encodeCborInt(1)],
    [encodeCborInt(-2), encodeCborBytes(x)],
    [encodeCborInt(-3), encodeCborBytes(y)],
  ]);
}

function makeAttestedAuthenticatorData(
  rpId: string,
  credentialIdBytes: Uint8Array = Buffer.from([1, 2, 3]),
  credentialPublicKey: Uint8Array = makeCoseEc2PublicKey(),
  flags = 0x45,
  signCount = 1
): Uint8Array {
  const base = Buffer.from(Array.from(makeAuthenticatorData(rpId, flags, signCount)));
  const credentialIdLength = Buffer.alloc(2);
  credentialIdLength.writeUInt16BE(credentialIdBytes.length, 0);
  return new Uint8Array(
    Buffer.concat([
      base,
      Buffer.alloc(16, 0),
      credentialIdLength,
      Buffer.from(credentialIdBytes),
      Buffer.from(credentialPublicKey),
    ])
  );
}

function makeAttestationObject(authenticatorData: Uint8Array): Uint8Array {
  return new Uint8Array(
    encodeCborMap([
      [encodeCborText("fmt"), encodeCborText("none")],
      [encodeCborText("authData"), encodeCborBytes(authenticatorData)],
      [encodeCborText("attStmt"), encodeCborMap([])],
    ])
  );
}

function makePasskeyRegistrationPayload(options: {
  challenge: number[];
  origin?: string;
  rpId?: string;
  type?: string;
  credentialIdBytes?: Uint8Array;
  credentialPublicKey?: Uint8Array;
  credentialIdHint?: string;
  callerPublicKeyHint?: string;
  name?: string;
}) {
  const credentialIdBytes = options.credentialIdBytes ?? Buffer.from([1, 2, 3]);
  const credentialPublicKey = options.credentialPublicKey ?? makeCoseEc2PublicKey();
  const clientDataJSON = Buffer.from(
    JSON.stringify({
      type: options.type ?? "webauthn.create",
      challenge: toBase64url(Uint8Array.from(options.challenge)),
      origin: options.origin ?? trustedRendererOrigin(),
    }),
    "utf8"
  );
  const authenticatorData = makeAttestedAuthenticatorData(options.rpId ?? trustedRendererRpId(), credentialIdBytes, credentialPublicKey);
  return {
    payload: {
      challengeId: "",
      credentialId: options.credentialIdHint ?? toBase64url(credentialIdBytes),
      attestationObject: toBase64(makeAttestationObject(authenticatorData)),
      clientDataJSON: toBase64(clientDataJSON),
      publicKey: options.callerPublicKeyHint ?? "forged_public_key",
      name: options.name ?? "Work key",
    },
    expectedCredentialId: toBase64url(credentialIdBytes),
    expectedPublicKey: toBase64url(credentialPublicKey),
  };
}

function makeLifecycleWindow(url = trustedRendererUrl(), senderId = 1) {
  const webContentsListeners = new Map<string, () => void>();
  const windowListeners = new Map<string, () => void>();
  const sender = {
    id: senderId,
    getURL: (): string => url,
    send: vi.fn(),
    on: (event: string, listener: () => void) => {
      webContentsListeners.set(event, listener);
    },
  };
  const win = {
    isDestroyed: (): boolean => false,
    webContents: sender,
    getParentWindow: (): null => null,
    on: (event: string, listener: () => void) => {
      windowListeners.set(event, listener);
    },
  };
  fromWebContentsMock.mockImplementation((webContents: unknown) => (webContents === sender ? win : null));
  return {
    event: { sender } as unknown as IpcMainInvokeEvent,
    win: win as never,
    emitWebContents: (eventName: string) => webContentsListeners.get(eventName)?.(),
    emitWindow: (eventName: string) => windowListeners.get(eventName)?.(),
  };
}

describe("ipc lock-admin hardening", () => {
  beforeEach(() => {
    lockState.startLocked = true;
    lockState.method = "pin6";
    lockState.pinDigits = 6;
    lockState.hasPin = true;
    lockState.hasPassword = false;
    lockState.hasPattern = false;
    lockState.methodsPrimary = "pin";
    lockState.methodsSecondary = null;

    appIsPackagedState.value = false;
    handlers.clear();
    fromWebContentsMock.mockReset();
    senderWindowMap.clear();
    getAppPathMock.mockReset();
    getAppPathMock.mockReturnValue("C:/trusted-app");
    canPromptTouchIDMock.mockReset();
    canPromptTouchIDMock.mockReturnValue(false);
    promptTouchIDMock.mockReset();
    promptTouchIDMock.mockResolvedValue(false);
    getUserDefaultMock.mockReset();
    getUserDefaultMock.mockReturnValue(false);
    showSaveDialogMock.mockReset();
    showSaveDialogMock.mockResolvedValue({ canceled: true });
    showOpenDialogMock.mockReset();
    showOpenDialogMock.mockResolvedValue({ canceled: true, filePaths: [] });
    writeFileMock.mockReset();
    writeFileMock.mockResolvedValue(undefined);
    readFileMock.mockReset();
    readFileMock.mockResolvedValue("{}");
    setLockMethodMock.mockReset();
    setCredentialMock.mockReset();
    setCredentialMock.mockResolvedValue(undefined);
    clearCredentialMock.mockReset();
    clearCredentialLockStateMock.mockReset();
    clearPasskeyCredentialMock.mockReset();
    saveAccountsMock.mockReset();
    setQuickUnlockMock.mockReset();
    getQuickUnlockMock.mockReset();
    getQuickUnlockMock.mockReturnValue({ windowsHello: false, passkey: false });
    setLockMethodsConfigMock.mockReset();
    loadAccountsMock.mockReset();
    loadAccountsMock.mockReturnValue([]);
    clearDecryptedCacheMock.mockReset();
    verifyCredentialWithLimitMock.mockReset();
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "INCORRECT", attemptsUsed: 1 });
    verifyCredentialMock.mockReset();
    verifyCredentialMock.mockResolvedValue(true);
    unlockHardenedVaultWithPasswordMock.mockReset();
    unlockHardenedVaultWithPasswordMock.mockResolvedValue({ result: "OK" } as any);
    validateAndBurnRecoverySecretMock.mockReset();
    validateAndBurnRecoverySecretMock.mockResolvedValue(true);
    setPasswordAfterRecoveryMock.mockReset();
    setPasswordAfterRecoveryMock.mockResolvedValue(true);
    hasPendingRecoveryResetMock.mockReset();
    hasPendingRecoveryResetMock.mockReturnValue(false);
    totpCodeSyncMock.mockReset();
    totpCodeSyncMock.mockReturnValue({ code: "123456", remainingSeconds: 30 });
    scanQrFromScreenMock.mockReset();
    scanQrFromScreenMock.mockResolvedValue({ status: "cancelled" });
    isOtpauthUriMock.mockReset();
    isOtpauthUriMock.mockReturnValue(false);
    getVaultProtectionStatusMock.mockReset();
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: false,
      hardenedSessionUnlocked: true,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    hasProvisionedVaultMock.mockReset();
    hasProvisionedVaultMock.mockReturnValue(true);
    requiresVaultPasswordSetupMock.mockReset();
    requiresVaultPasswordSetupMock.mockReturnValue(false);
    ensureOuterVaultMetadataMock.mockReset();
    ensureOuterVaultMetadataMock.mockReturnValue({
      rawVaultMode: "hardened",
      resolvedVaultMode: "hardened",
      hasLegacyBlob: false,
      hasLegacyHardenedEnvelope: false,
      hasVaultEnvelope: true,
      hasAuthUiSettings: true,
      migrated: false,
    });
    rotateHardenedVaultPasswordMock.mockReset();
    rotateHardenedVaultPasswordMock.mockResolvedValue(undefined);
    isHardenedVaultUnlockedMock.mockReset();
    isHardenedVaultUnlockedMock.mockReturnValue(false);
    getPasskeyCredentialMock.mockReset();
    getPasskeyCredentialMock.mockReturnValue(null);
    hasPasskeyCredentialMock.mockReset();
    hasPasskeyCredentialMock.mockReturnValue(false);
    listPasskeyCredentialsMock.mockReset();
    listPasskeyCredentialsMock.mockReturnValue([]);
    listPasskeySummariesMock.mockReset();
    listPasskeySummariesMock.mockReturnValue([]);
    removePasskeyCredentialMock.mockReset();
    removePasskeyCredentialMock.mockReturnValue(false);
    renamePasskeyCredentialMock.mockReset();
    renamePasskeyCredentialMock.mockReturnValue(false);
    savePasskeyCredentialMock.mockReset();
    updatePasskeyCredentialSignCountMock.mockReset();
    updatePasskeyCredentialSignCountMock.mockReturnValue(true);
    encryptBackupMock.mockReset();
    encryptBackupMock.mockResolvedValue({
      version: 3,
      kdf: "argon2id",
      argon2Params: { m: 65536, t: 3, p: 1 },
      algorithm: "aes-256-gcm",
      salt: "salt",
      iv: "iv",
      ciphertext: "ciphertext",
      authTag: "authTag",
    });
    decryptBackupMock.mockReset();
    decryptBackupMock.mockResolvedValue({ version: 1, accounts: [] });
  });

  it("requires an open security session for lock:setMethod while unlocked", async () => {
    lockState.startLocked = false;
    await registerHandlers();

    const handler = getHandler("lock:setMethod");
    expect(() => handler(makeTrustedEvent(), "password")).toThrowError("A security session is required. Open one first.");
    expect(setLockMethodMock).not.toHaveBeenCalled();
  });

  it("blocks lock:resetAppLock while locked with configured credentials", async () => {
    await registerHandlers();

    const handler = getHandler("lock:resetAppLock");
    const error = unwrapIpcError(await handler(makeTrustedEvent()));
    expect(error.code).toBe("E_LOCKED");
    expect(error.message).toBe("Unlock the app before using this feature.");
    expect(saveAccountsMock).not.toHaveBeenCalled();
  });

  it("allows first-run setup when locked but no credentials are configured", async () => {
    lockState.startLocked = true;
    lockState.method = "pin6";
    lockState.hasPin = false;
    lockState.hasPassword = false;
    lockState.hasPattern = false;

    await registerHandlers();

    const handler = getHandler("lock:setMethod");
    const result = await Promise.resolve(handler(makeTrustedEvent(), "pin6"));
    expect(result).toBeUndefined();
    expect(setLockMethodMock).toHaveBeenCalledWith("pin6");
  });

  it("rejects lock-admin calls from unexpected renderer contexts", async () => {
    lockState.startLocked = false;
    await registerHandlers();

    const handler = getHandler("lock:setMethod");
    expect(() => handler(makeUntrustedEvent(), "password")).toThrowError("This security action was rejected.");
    expect(setLockMethodMock).not.toHaveBeenCalled();
  });

  it("rejects file senders outside the packaged renderer entry path", async () => {
    await registerHandlers();

    const handler = getHandler("lock:getLockState");
    expect(() => handler(makeTrustedEvent("file:///some/other/path/evil.html"))).toThrowError("This security action was rejected.");
  });

  it("accepts the exact packaged renderer file url", async () => {
    await registerHandlers();

    const handler = getHandler("lock:getLockState");
    expect(handler(makeTrustedEvent(trustedRendererUrl()))).toEqual({ failedCount: 0, lockUntilEpochMs: 0 });
  });

  it("keeps localhost dev origins trusted", async () => {
    await registerHandlers();

    const handler = getHandler("lock:getLockState");
    expect(handler(makeTrustedEvent("http://localhost:5173/"))).toEqual({ failedCount: 0, lockUntilEpochMs: 0 });
  });

  it("rejects localhost origins in packaged builds", async () => {
    appIsPackagedState.value = true;
    await registerHandlers();

    const handler = getHandler("lock:getLockState");
    expect(() => handler(makeTrustedEvent("http://localhost:5173/"))).toThrowError("This security action was rejected.");
  });

  it("does not register unused legacy auth channels", async () => {
    await registerHandlers();

    expect(handlers.has("auth:setPin")).toBe(false);
    expect(handlers.has("auth:unlock")).toBe(false);
    expect(handlers.has("auth:promptBiometric")).toBe(false);
  });

  it("requires an open security session for lock:setMethodsConfig while unlocked", async () => {
    lockState.startLocked = false;
    lockState.hasPassword = true;
    await registerHandlers();

    const handler = getHandler("lock:setMethodsConfig");
    expect(() => handler(makeTrustedEvent(), { primaryLockMethod: "password", secondaryLockMethod: null })).toThrowError(
      "A security session is required. Open one first."
    );
    expect(setLockMethodsConfigMock).not.toHaveBeenCalled();
  });

  it("requires an open security session for lock:setCredential while unlocked", async () => {
    lockState.startLocked = false;
    await registerHandlers();

    const handler = getHandler("lock:setCredential");
    await expect(handler(makeTrustedEvent(), "password", "CurrentPass!234")).rejects.toThrowError(
      "A security session is required. Open one first."
    );
    expect(setCredentialMock).not.toHaveBeenCalled();
  });

  it("allows lock method changes after opening a security session", async () => {
    lockState.startLocked = false;
    lockState.hasPassword = true;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const setMethod = getHandler("lock:setMethod");
    const setMethodsConfig = getHandler("lock:setMethodsConfig");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    expect(() => setMethod(event, "password")).not.toThrow();
    expect(setLockMethodMock).toHaveBeenCalledWith("password");

    expect(() => setMethodsConfig(event, { primaryLockMethod: "password", secondaryLockMethod: null })).not.toThrow();
    expect(setLockMethodsConfigMock).toHaveBeenCalledWith({ primaryLockMethod: "password", secondaryLockMethod: null });
  });

  it("allows credential replacement after opening a security session", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const setCredential = getHandler("lock:setCredential");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    await expect(setCredential(event, "password", "CurrentPass!234")).resolves.toBeUndefined();
    expect(setCredentialMock).toHaveBeenCalledWith("password", "CurrentPass!234");
  });

  it("requires step-up verification before opening a security session", async () => {
    lockState.startLocked = false;
    await registerHandlers();

    const openSecuritySession = getHandler("lock:openSecuritySession");
    const error = unwrapIpcError(await openSecuritySession(makeTrustedEvent()));

    expect(error.code).toBe("E_STEP_UP_REQUIRED");
    expect(error.message).toBe("This action requires you to verify your identity.");
  });

  it("expires security sessions after 60 seconds", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-03-31T00:00:00.000Z"));
      lockState.startLocked = false;
      lockState.hasPassword = true;
      verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
      await registerHandlers();

      const stepUpVerify = getHandler("lock:stepUpVerify");
      const openSecuritySession = getHandler("lock:openSecuritySession");
      const setMethod = getHandler("lock:setMethod");
      const event = makeTrustedEvent(trustedRendererUrl(), {}, 11);

      unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
      unwrapIpcOk<void>(await openSecuritySession(event));
      expect(() => setMethod(event, "password")).not.toThrow();

      vi.setSystemTime(new Date("2026-03-31T00:01:00.001Z"));
      expect(() => setMethod(event, "password")).toThrowError("A security session is required. Open one first.");
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes security sessions explicitly", async () => {
    lockState.startLocked = false;
    lockState.hasPassword = true;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const closeSecuritySession = getHandler("lock:closeSecuritySession");
    const setMethod = getHandler("lock:setMethod");
    const event = makeTrustedEvent(trustedRendererUrl(), {}, 12);

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));
    unwrapIpcOk<void>(await closeSecuritySession(event));

    expect(() => setMethod(event, "password")).toThrowError("A security session is required. Open one first.");
  });

  it("keeps security sessions scoped to the originating renderer", async () => {
    lockState.startLocked = false;
    lockState.hasPassword = true;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const setMethod = getHandler("lock:setMethod");
    const firstEvent = makeTrustedEvent(trustedRendererUrl(), {}, 13);
    const secondEvent = makeTrustedEvent(trustedRendererUrl(), {}, 14);

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(firstEvent, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(firstEvent));

    expect(() => setMethod(secondEvent, "password")).toThrowError("A security session is required. Open one first.");
  });

  it("allows multiple destructive actions inside one open security session", async () => {
    lockState.startLocked = false;
    lockState.hasPassword = true;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const setCredential = getHandler("lock:setCredential");
    const setMethod = getHandler("lock:setMethod");
    const setMethodsConfig = getHandler("lock:setMethodsConfig");
    const event = makeTrustedEvent(trustedRendererUrl(), {}, 15);

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    await expect(setCredential(event, "password", "CurrentPass!234")).resolves.toBeUndefined();
    expect(() => setMethod(event, "password")).not.toThrow();
    expect(() => setMethodsConfig(event, { primaryLockMethod: "password", secondaryLockMethod: null })).not.toThrow();
  });

  it("invalidates security sessions when the app is locked", async () => {
    lockState.startLocked = false;
    lockState.hasPassword = true;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const lockHandler = getHandler("lock:lock");
    const setMethod = getHandler("lock:setMethod");
    const event = makeTrustedEvent(trustedRendererUrl(), {}, 16);

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));
    lockHandler(event);

    expect(clearDecryptedCacheMock).toHaveBeenCalledTimes(1);
    expect(() => setMethod(event, "password")).toThrowError("A security session is required. Open one first.");
  });

  it("clears the decrypted cache on crash and background lifecycle events", async () => {
    const module = await registerHandlers();
    const lifecycle = makeLifecycleWindow(trustedRendererUrl(), 117);
    module.attachSecuritySessionLifecycle(lifecycle.win);

    lifecycle.emitWebContents("render-process-gone");
    expect(clearDecryptedCacheMock).toHaveBeenCalledTimes(1);

    lifecycle.emitWindow("blur");
    expect(clearDecryptedCacheMock).toHaveBeenCalledTimes(2);

    lifecycle.emitWindow("minimize");
    expect(clearDecryptedCacheMock).toHaveBeenCalledTimes(3);

    lifecycle.emitWindow("hide");
    expect(clearDecryptedCacheMock).toHaveBeenCalledTimes(4);

    lifecycle.emitWebContents("destroyed");
    expect(clearDecryptedCacheMock).toHaveBeenCalledTimes(5);

    lifecycle.emitWindow("closed");
    expect(clearDecryptedCacheMock).toHaveBeenCalledTimes(6);
  });

  it("invalidates security sessions on renderer navigation, reload, crash, backgrounding, destroy, and window close", async () => {
    lockState.startLocked = false;
    lockState.hasPassword = true;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    const module = await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const setMethod = getHandler("lock:setMethod");
    const lifecycle = makeLifecycleWindow(trustedRendererUrl(), 17);
    module.attachSecuritySessionLifecycle(lifecycle.win);

    const reopenSession = async () => {
      unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(lifecycle.event, { method: "pin", input: "123456" }));
      unwrapIpcOk<void>(await openSecuritySession(lifecycle.event));
    };

    await reopenSession();
    lifecycle.emitWebContents("did-navigate");
    expect(() => setMethod(lifecycle.event, "password")).toThrowError("A security session is required. Open one first.");

    await reopenSession();
    lifecycle.emitWebContents("did-finish-load");
    expect(() => setMethod(lifecycle.event, "password")).toThrowError("A security session is required. Open one first.");

    await reopenSession();
    lifecycle.emitWebContents("render-process-gone");
    expect(() => setMethod(lifecycle.event, "password")).toThrowError("A security session is required. Open one first.");

    await reopenSession();
    lifecycle.emitWindow("blur");
    expect(() => setMethod(lifecycle.event, "password")).toThrowError("A security session is required. Open one first.");

    await reopenSession();
    lifecycle.emitWindow("minimize");
    expect(() => setMethod(lifecycle.event, "password")).toThrowError("A security session is required. Open one first.");

    await reopenSession();
    lifecycle.emitWindow("hide");
    expect(() => setMethod(lifecycle.event, "password")).toThrowError("A security session is required. Open one first.");

    await reopenSession();
    lifecycle.emitWebContents("destroyed");
    expect(() => setMethod(lifecycle.event, "password")).toThrowError("A security session is required. Open one first.");

    await reopenSession();
    lifecycle.emitWindow("closed");
    expect(() => setMethod(lifecycle.event, "password")).toThrowError("A security session is required. Open one first.");
  });

  it("denies biometric unlock when quick-unlock policy disables it", async () => {
    lockState.startLocked = false;
    getQuickUnlockMock.mockReturnValue({ windowsHello: false, passkey: false });
    await registerHandlers();

    const promptBiometric = getHandler("lock:promptBiometric");
    await expect(promptBiometric(makeTrustedEvent())).rejects.toThrowError(
      "Biometric unlock is disabled by quick-unlock policy."
    );
    expect(promptTouchIDMock).not.toHaveBeenCalled();
  });

  it("allows biometric unlock when quick-unlock policy enables it", async () => {
    lockState.startLocked = false;
    getQuickUnlockMock.mockReturnValue({ windowsHello: true, passkey: false });
    canPromptTouchIDMock.mockReturnValue(true);
    promptTouchIDMock.mockResolvedValue(undefined);
    await registerHandlers();

    const promptBiometric = getHandler("lock:promptBiometric");
    await expect(promptBiometric(makeTrustedEvent())).resolves.toBe(true);
    expect(promptTouchIDMock).toHaveBeenCalledTimes(1);
  });

  it("does not throw when lock:lock is called before a hardened vault is unlocked", async () => {
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    isHardenedVaultUnlockedMock.mockReturnValue(false);
    lockState.startLocked = true;
    await registerHandlers();

    const handler = getHandler("lock:lock");
    const sender: { getURL: () => string } = { getURL: () => trustedRendererUrl() };
    fromWebContentsMock.mockReturnValue({
      isDestroyed: () => false,
      webContents: { send: vi.fn() },
      getParentWindow: (): null => null,
    });

    expect(() => handler({ sender } as unknown as IpcMainInvokeEvent)).not.toThrow();
  });

  it("treats a successful hardened password decrypt as a successful unlock", async () => {
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    isHardenedVaultUnlockedMock.mockReturnValue(false);
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "INCORRECT", attemptsUsed: 99 });
    unlockHardenedVaultWithPasswordMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const handler = getHandler("lock:verify");
    await expect(handler(makeTrustedEvent(), "password", "12345678")).resolves.toEqual({ result: "OK" });
    expect(unlockHardenedVaultWithPasswordMock).toHaveBeenCalledWith("12345678");
    expect(verifyCredentialWithLimitMock).not.toHaveBeenCalled();
  });

  it("exposes password-only unlock options while the vault is cold-start locked", async () => {
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    isHardenedVaultUnlockedMock.mockReturnValue(false);
    lockState.hasPassword = true;
    lockState.hasPin = true;
    lockState.hasPattern = true;
    listPasskeySummariesMock.mockReturnValue([{ id: "cred1", name: "Work key", credentialId: "credential_id" }]);
    await registerHandlers();

    expect(getHandler("lock:getMethod")(makeTrustedEvent())).toBe("password");
    expect(getHandler("lock:getMethodsConfig")(makeTrustedEvent())).toEqual({ primaryLockMethod: "password", secondaryLockMethod: null });
    expect(getHandler("lock:hasCredential")(makeTrustedEvent(), "password")).toBe(true);
    expect(getHandler("lock:hasCredential")(makeTrustedEvent(), "pin")).toBe(false);
    expect(getHandler("lock:hasCredential")(makeTrustedEvent(), "pattern")).toBe(false);
    expect(getHandler("passkey:listCredentials")(makeTrustedEvent())).toEqual([]);
    expect(getHandler("lock:biometricAvailable")(makeTrustedEvent())).toBe(false);
  });

  it("initializes the vault when enabling v4 protection on an unprovisioned install", async () => {
    lockState.startLocked = false;
    lockState.hasPin = false;
    lockState.hasPassword = false;
    lockState.hasPattern = false;
    lockState.methodsPrimary = "none";
    lockState.methodsSecondary = null;
    hasProvisionedVaultMock.mockReturnValue(false);
    await registerHandlers();

    const openSecuritySession = getHandler("lock:openSecuritySession");
    const handler = getHandler("vault:enableHardenedMode");
    const event = makeTrustedEvent();

    unwrapIpcOk<void>(await openSecuritySession(event));
    const result = unwrapIpcOk<{ mode: string }>(await handler(event, "current-password-123"));

    expect(result.mode).toBe("hardened");
    expect(initializeVaultWithPasswordMock).toHaveBeenCalledWith("current-password-123");
  });

  it("exposes extended vault protection status and consumes recovery unlock state once", async () => {
    lockState.startLocked = true;
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 2, lockUntilEpochMs: 12345 },
      biometricEnrolled: true,
      recoveryGenerated: true,
      requiresPasswordSetup: false,
    });
    ensureOuterVaultMetadataMock.mockReturnValue({
      rawVaultMode: "hardened",
      resolvedVaultMode: "hardened",
      hasLegacyBlob: true,
      hasLegacyHardenedEnvelope: false,
      hasVaultEnvelope: false,
      hasAuthUiSettings: true,
      migrated: false,
    });
    validateAndBurnRecoverySecretMock.mockResolvedValue(true);
    await registerHandlers();

    const statusHandler = getHandler("vault:getProtectionStatus");
    const recoveryUnlock = getHandler("lock:validateAndBurnRecoverySecret");
    const event = makeTrustedEvent();

    expect(unwrapIpcOk<any>(await statusHandler(event))).toMatchObject({
      vaultFormat: "vault-v4",
      recoveryGenerated: true,
      biometricEnrolled: true,
      migrationRequired: true,
      requiresPasswordSetup: false,
      justUnlockedViaRecovery: false,
      appLockRequired: true,
      mode: "vault-v4",
    });

    expect(unwrapIpcOk<{ valid: boolean }>(await recoveryUnlock(event, "RECOVERY-SECRET"))).toEqual({ valid: true });
    expect(unwrapIpcOk<any>(await statusHandler(event))).toMatchObject({ justUnlockedViaRecovery: false });
  });

  it("returns false for incorrect recovery-secret validation", async () => {
    lockState.startLocked = true;
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: true,
      requiresPasswordSetup: false,
    });
    validateAndBurnRecoverySecretMock.mockResolvedValue(false);
    await registerHandlers();

    const recoveryUnlock = getHandler("lock:validateAndBurnRecoverySecret");
    const statusHandler = getHandler("vault:getProtectionStatus");
    const event = makeTrustedEvent();

    expect(unwrapIpcOk<{ valid: boolean }>(await recoveryUnlock(event, "WRONG-SECRET"))).toEqual({ valid: false });
    expect(unwrapIpcOk<any>(await statusHandler(event))).toMatchObject({ justUnlockedViaRecovery: false });
  });

  it("only allows setting a password immediately after a burned recovery secret", async () => {
    lockState.startLocked = true;
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    hasPendingRecoveryResetMock.mockReturnValue(true);
    await registerHandlers();

    const handler = getHandler("lock:setPasswordAfterRecovery");
    const event = makeTrustedEvent();

    expect(unwrapIpcOk<{ success: boolean }>(await handler(event, "CurrentPass!234"))).toEqual({ success: true });
    expect(setPasswordAfterRecoveryMock).toHaveBeenCalledWith("CurrentPass!234");
  });

  it("marks the first normal unlock after recovery reset so the renderer can prompt for a new secret", async () => {
    lockState.startLocked = true;
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    hasPendingRecoveryResetMock.mockReturnValue(true);
    unlockHardenedVaultWithPasswordMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const setRecoveryPassword = getHandler("lock:setPasswordAfterRecovery");
    const verify = getHandler("lock:verify");
    const statusHandler = getHandler("vault:getProtectionStatus");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ success: boolean }>(await setRecoveryPassword(event, "CurrentPass!234"));
    hasPendingRecoveryResetMock.mockReturnValue(false);

    expect(await verify(event, "password", "CurrentPass!234")).toEqual({ result: "OK" });
    expect(unwrapIpcOk<any>(await statusHandler(event))).toMatchObject({ justUnlockedViaRecovery: true });
    expect(unwrapIpcOk<any>(await statusHandler(event))).toMatchObject({ justUnlockedViaRecovery: false });
  });

  it("rejects recovery password reset when no burned recovery session exists", async () => {
    lockState.startLocked = true;
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    hasPendingRecoveryResetMock.mockReturnValue(false);
    await registerHandlers();

    const handler = getHandler("lock:setPasswordAfterRecovery");
    const error = unwrapIpcError(await handler(makeTrustedEvent(), "CurrentPass!234"));

    expect(error.code).toBe("E_RECOVERY_CODE_INVALID");
  });

  it("returns the generated recovery secret through the vault recovery channel", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const handler = getHandler("vault:generateRecoverySecret");
    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));
    expect(unwrapIpcOk<string>(await handler(event))).toBe("RECOVERY-SECRET");
    expect(generateRecoverySecretMock).toHaveBeenCalledTimes(1);
  });

  it("returns updated status when enrolling biometric vault unlock", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: false,
      hardenedSessionUnlocked: true,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: true,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    await registerHandlers();

    const handler = getHandler("vault:enrollBiometric");
    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));
    expect(unwrapIpcOk<any>(await handler(event))).toMatchObject({ biometricEnrolled: true });
    expect(enrollBiometricUnlockMock).toHaveBeenCalledTimes(1);
  });

  it("removes biometric vault unlock after an open security session", async () => {
    lockState.startLocked = false;
    lockState.hasPassword = true;
    lockState.methodsPrimary = "password";
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const handler = getHandler("vault:removeBiometric");
    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "password", input: "current-password-123" }));
    unwrapIpcOk<void>(await openSecuritySession(event));
    expect(unwrapIpcOk<any>(await handler(event))).toMatchObject({ biometricEnrolled: false });
    expect(removeBiometricUnlockMock).toHaveBeenCalledTimes(1);
  });

  it("migrates a legacy vault with an existing password credential", async () => {
    lockState.startLocked = true;
    ensureOuterVaultMetadataMock.mockReturnValue({
      rawVaultMode: "hardened",
      resolvedVaultMode: "hardened",
      hasLegacyBlob: true,
      hasLegacyHardenedEnvelope: false,
      hasVaultEnvelope: false,
      hasAuthUiSettings: true,
      migrated: false,
    });
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    unlockHardenedVaultWithPasswordMock.mockResolvedValue({ result: "OK" } as const);
    await registerHandlers();

    const handler = getHandler("vault:migrateWithPassword");
    expect(unwrapIpcOk<boolean>(await handler(makeTrustedEvent(), "current-password-123"))).toBe(true);
    expect(unlockHardenedVaultWithPasswordMock).toHaveBeenCalledWith("current-password-123");
  });

  it("returns false when password migration is attempted with the wrong password", async () => {
    ensureOuterVaultMetadataMock.mockReturnValue({
      rawVaultMode: "hardened",
      resolvedVaultMode: "hardened",
      hasLegacyBlob: true,
      hasLegacyHardenedEnvelope: false,
      hasVaultEnvelope: false,
      hasAuthUiSettings: true,
      migrated: false,
    });
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: false,
    });
    unlockHardenedVaultWithPasswordMock.mockResolvedValue({ result: "INCORRECT", attemptsUsed: 1 } as any);
    await registerHandlers();

    const handler = getHandler("vault:migrateWithPassword");
    expect(unwrapIpcOk<boolean>(await handler(makeTrustedEvent(), "wrong-password"))).toBe(false);
  });

  it("initializes password setup migration when no legacy password credential exists", async () => {
    ensureOuterVaultMetadataMock.mockReturnValue({
      rawVaultMode: "hardened",
      resolvedVaultMode: "hardened",
      hasLegacyBlob: true,
      hasLegacyHardenedEnvelope: false,
      hasVaultEnvelope: false,
      hasAuthUiSettings: true,
      migrated: false,
    });
    getVaultProtectionStatusMock.mockReturnValue({
      mode: "hardened",
      requiresMasterPassword: true,
      hardenedSessionUnlocked: false,
      masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
      biometricEnrolled: false,
      recoveryGenerated: false,
      requiresPasswordSetup: true,
    });
    requiresVaultPasswordSetupMock.mockReturnValue(true);
    await registerHandlers();

    const handler = getHandler("vault:migrateSetPassword");
    expect(unwrapIpcOk<boolean>(await handler(makeTrustedEvent(), "current-password-123"))).toBe(true);
    expect(initializeVaultWithPasswordMock).toHaveBeenCalledWith("current-password-123");
  });

  it("allows repeated backup exports inside one security session", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const exportBackup = getHandler("backup:export");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));
    expect(unwrapIpcOk<boolean>(await exportBackup(event, "long-passphrase"))).toBe(false);
    expect(unwrapIpcOk<boolean>(await exportBackup(event, "long-passphrase"))).toBe(false);
  });

  it("requires an open security session for backup import in every mode", async () => {
    lockState.startLocked = false;
    readFileMock.mockResolvedValue(
      JSON.stringify({
        version: 3,
        kdf: "argon2id",
        argon2Params: { m: 65536, t: 3, p: 1 },
        algorithm: "aes-256-gcm",
        salt: "salt",
        iv: "iv",
        ciphertext: "ciphertext",
        authTag: "authTag",
      })
    );
    await registerHandlers();

    const importBackup = getHandler("backup:import");
    const mergeError = unwrapIpcError(await importBackup(makeTrustedEvent(), "long-passphrase", "merge"));
    const replaceError = unwrapIpcError(await importBackup(makeTrustedEvent(), "long-passphrase", "replace"));

    expect(mergeError.code).toBe("E_STEP_UP_REQUIRED");
    expect(replaceError.code).toBe("E_STEP_UP_REQUIRED");
    expect(showOpenDialogMock).not.toHaveBeenCalled();
    expect(saveAccountsMock).not.toHaveBeenCalled();
  });

  it("allows backup import merge mode after opening a security session", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    const importedAccounts = [
      {
        id: "imported-1",
        issuer: "Issuer",
        label: "Label",
        secretBase32: "JBSWY3DPEHPK3PXP",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
    ];
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ["C:/tmp/authenticator-backup.enc.json"] });
    readFileMock.mockResolvedValue(
      JSON.stringify({
        version: 3,
        kdf: "argon2id",
        argon2Params: { m: 65536, t: 3, p: 1 },
        algorithm: "aes-256-gcm",
        salt: "salt",
        iv: "iv",
        ciphertext: "ciphertext",
        authTag: "authTag",
      })
    );
    decryptBackupMock.mockResolvedValue({ version: 1, accounts: importedAccounts });
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const importBackup = getHandler("backup:import");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    expect(unwrapIpcOk<boolean>(await importBackup(event, "long-passphrase", "merge"))).toBe(true);
    expect(saveAccountsMock).toHaveBeenCalledWith(importedAccounts);
  });

  it("allows backup import replace mode after opening a security session", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    const importedAccounts = [
      {
        id: "imported-2",
        issuer: "Issuer",
        label: "Label",
        secretBase32: "GEZDGNBVGY3TQOJQ",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
    ];
    showOpenDialogMock.mockResolvedValue({ canceled: false, filePaths: ["C:/tmp/authenticator-backup.enc.json"] });
    readFileMock.mockResolvedValue(
      JSON.stringify({
        version: 3,
        kdf: "argon2id",
        argon2Params: { m: 65536, t: 3, p: 1 },
        algorithm: "aes-256-gcm",
        salt: "salt",
        iv: "iv",
        ciphertext: "ciphertext",
        authTag: "authTag",
      })
    );
    decryptBackupMock.mockResolvedValue({ version: 1, accounts: importedAccounts });
    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const importBackup = getHandler("backup:import");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    expect(unwrapIpcOk<boolean>(await importBackup(event, "long-passphrase", "replace"))).toBe(true);
    expect(saveAccountsMock).toHaveBeenCalledWith(importedAccounts);
  });

  it("aborts backup export if the app locks before the save dialog returns", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK", attemptsUsed: 0 });

    let resolveSaveDialog: ((value: { canceled: boolean; filePath?: string }) => void) | null = null;
    showSaveDialogMock.mockImplementationOnce(
      () =>
        new Promise<{ canceled: boolean; filePath?: string }>((resolve) => {
          resolveSaveDialog = resolve;
        })
    );

    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const exportBackup = getHandler("backup:export");
    const lockHandler = getHandler("lock:lock");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    const exportPromise = Promise.resolve(exportBackup(event, "long-passphrase"));
    await Promise.resolve();

    expect(resolveSaveDialog).toBeTruthy();
    lockHandler(event);
    resolveSaveDialog?.({ canceled: false, filePath: "C:/tmp/authenticator-backup.enc.json" });

    const error = unwrapIpcError(await exportPromise);
    expect(error.code).toBe("E_LOCKED");
    expect(error.message).toBe("Unlock the app before using this feature.");
    expect(loadAccountsMock).not.toHaveBeenCalled();
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  it("aborts backup import if the app locks before the open dialog returns", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);

    let resolveOpenDialog: ((value: { canceled: boolean; filePaths: string[] }) => void) | null = null;
    showOpenDialogMock.mockImplementationOnce(
      () =>
        new Promise<{ canceled: boolean; filePaths: string[] }>((resolve) => {
          resolveOpenDialog = resolve;
        })
    );

    await registerHandlers();

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const importBackup = getHandler("backup:import");
    const lockHandler = getHandler("lock:lock");
    const event = makeTrustedEvent();

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    const importPromise = Promise.resolve(importBackup(event, "long-passphrase", "merge"));
    await Promise.resolve();

    expect(resolveOpenDialog).toBeTruthy();
    lockHandler(event);
    resolveOpenDialog?.({ canceled: false, filePaths: ["C:/tmp/authenticator-backup.enc.json"] });

    const error = unwrapIpcError(await importPromise);
    expect(error.code).toBe("E_LOCKED");
    expect(error.message).toBe("Unlock the app before using this feature.");
    expect(readFileMock).not.toHaveBeenCalled();
    expect(saveAccountsMock).not.toHaveBeenCalled();
  });

  it("blocks passkey mutation channels while locked", async () => {
    await registerHandlers();

    const saveCredential = getHandler("passkey:saveCredential");
    const renameCredential = getHandler("passkey:renameCredential");
    const removeCredential = getHandler("passkey:removeCredential");
    const clearCredential = getHandler("passkey:clearCredential");

    const registration = makePasskeyRegistrationPayload({ challenge: [1, 2, 3, 4] });

    expect(unwrapIpcError(await saveCredential(makeTrustedEvent(), {
      challengeId: "challengeid",
      credentialId: registration.expectedCredentialId,
      attestationObject: registration.payload.attestationObject,
      clientDataJSON: registration.payload.clientDataJSON,
    }))).toMatchObject({ code: "E_LOCKED", message: "Unlock the app before using this feature." });
    expect(unwrapIpcError(await renameCredential(makeTrustedEvent(), { id: "cred1", name: "Renamed" }))).toMatchObject({
      code: "E_LOCKED",
      message: "Unlock the app before using this feature.",
    });
    expect(unwrapIpcError(await removeCredential(makeTrustedEvent(), { id: "cred1" }))).toMatchObject({
      code: "E_LOCKED",
      message: "Unlock the app before using this feature.",
    });
    expect(unwrapIpcError(await clearCredential(makeTrustedEvent()))).toMatchObject({
      code: "E_LOCKED",
      message: "Unlock the app before using this feature.",
    });

    expect(savePasskeyCredentialMock).not.toHaveBeenCalled();
    expect(renamePasskeyCredentialMock).not.toHaveBeenCalled();
    expect(removePasskeyCredentialMock).not.toHaveBeenCalled();
    expect(clearPasskeyCredentialMock).not.toHaveBeenCalled();
  });

  it("requires a security session for destructive passkey management when unlocked", async () => {
    lockState.startLocked = false;
    renamePasskeyCredentialMock.mockReturnValue(true);
    removePasskeyCredentialMock.mockReturnValue(true);
    await registerHandlers();

    const challengePacket = getHandler("passkey:getChallenge")(makeTrustedEvent()) as {
      challengeId: string;
      challenge: number[];
    };
    expect(challengePacket.challengeId.length).toBeGreaterThan(0);
    expect(challengePacket.challenge.length).toBe(32);

    const saveCredential = getHandler("passkey:saveCredential");
    const renameCredential = getHandler("passkey:renameCredential");
    const removeCredential = getHandler("passkey:removeCredential");
    const clearCredential = getHandler("passkey:clearCredential");
    const registration = makePasskeyRegistrationPayload({
      challenge: challengePacket.challenge,
      credentialIdHint: "forged_credential_id",
    });

    expect(unwrapIpcError(await saveCredential(makeTrustedEvent(), {
      challengeId: challengePacket.challengeId,
      credentialId: registration.payload.credentialId,
      attestationObject: registration.payload.attestationObject,
      clientDataJSON: registration.payload.clientDataJSON,
      name: "Work key",
    }))).toMatchObject({ code: "E_STEP_UP_REQUIRED", message: "A security session is required. Open one first." });
    expect(unwrapIpcError(await renameCredential(makeTrustedEvent(), { id: "cred1", name: "Renamed" }))).toMatchObject({
      code: "E_STEP_UP_REQUIRED",
    });
    expect(unwrapIpcError(await removeCredential(makeTrustedEvent(), { id: "cred1" }))).toMatchObject({
      code: "E_STEP_UP_REQUIRED",
      message: "A security session is required. Open one first.",
    });
    expect(unwrapIpcError(await clearCredential(makeTrustedEvent()))).toMatchObject({
      code: "E_STEP_UP_REQUIRED",
      message: "A security session is required. Open one first.",
    });

    expect(savePasskeyCredentialMock).not.toHaveBeenCalled();
    expect(renamePasskeyCredentialMock).not.toHaveBeenCalled();
    expect(removePasskeyCredentialMock).not.toHaveBeenCalled();
    expect(clearPasskeyCredentialMock).not.toHaveBeenCalled();
  });

  it("allows passkey management after opening a security session", async () => {
    lockState.startLocked = false;
    renamePasskeyCredentialMock.mockReturnValue(true);
    removePasskeyCredentialMock.mockReturnValue(true);
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const challengePacket = getHandler("passkey:getChallenge")(makeTrustedEvent()) as {
      challengeId: string;
      challenge: number[];
    };

    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const saveCredential = getHandler("passkey:saveCredential");
    const renameCredential = getHandler("passkey:renameCredential");
    const removeCredential = getHandler("passkey:removeCredential");
    const clearCredential = getHandler("passkey:clearCredential");
    const event = makeTrustedEvent();
    const registration = makePasskeyRegistrationPayload({
      challenge: challengePacket.challenge,
      credentialIdHint: "forged_credential_id",
      callerPublicKeyHint: "forged_public_key",
    });

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    expect(
      unwrapIpcOk<boolean>(
        await saveCredential(event, {
          challengeId: challengePacket.challengeId,
          credentialId: registration.payload.credentialId,
          attestationObject: registration.payload.attestationObject,
          clientDataJSON: registration.payload.clientDataJSON,
          name: "Work key",
        })
      )
    ).toBe(true);
    expect(savePasskeyCredentialMock).toHaveBeenCalledWith(
      registration.expectedCredentialId,
      registration.expectedPublicKey,
      "Work key",
      1
    );

    expect(unwrapIpcOk<boolean>(await renameCredential(event, { id: "cred1", name: "Renamed" }))).toBe(true);
    expect(renamePasskeyCredentialMock).toHaveBeenCalledWith("cred1", "Renamed");

    expect(unwrapIpcOk<boolean>(await removeCredential(event, { id: "cred1" }))).toBe(true);
    expect(removePasskeyCredentialMock).toHaveBeenCalledWith("cred1");

    unwrapIpcOk<void>(await clearCredential(event));
    expect(clearPasskeyCredentialMock).toHaveBeenCalledTimes(1);
  });

  it("rejects passkey registration when the challenge does not match", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const challengePacket = getHandler("passkey:getChallenge")(makeTrustedEvent()) as { challengeId: string; challenge: number[] };
    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const saveCredential = getHandler("passkey:saveCredential");
    const event = makeTrustedEvent();
    const registration = makePasskeyRegistrationPayload({
      challenge: [9, 9, 9, 9],
      credentialIdHint: "forged_credential_id",
    });

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    const error = unwrapIpcError(
      await saveCredential(event, {
        challengeId: challengePacket.challengeId,
        credentialId: registration.payload.credentialId,
        attestationObject: registration.payload.attestationObject,
        clientDataJSON: registration.payload.clientDataJSON,
        name: "Work key",
      })
    );

    expect(error.code).toBe("E_PAYLOAD_INVALID");
    expect(error.message).toBe("Challenge mismatch.");
  });

  it("rejects passkey registration when the client data type is wrong", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const challengePacket = getHandler("passkey:getChallenge")(makeTrustedEvent()) as { challengeId: string; challenge: number[] };
    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const saveCredential = getHandler("passkey:saveCredential");
    const event = makeTrustedEvent();
    const registration = makePasskeyRegistrationPayload({
      challenge: challengePacket.challenge,
      type: "webauthn.get",
    });

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    const error = unwrapIpcError(
      await saveCredential(event, {
        challengeId: challengePacket.challengeId,
        credentialId: registration.payload.credentialId,
        attestationObject: registration.payload.attestationObject,
        clientDataJSON: registration.payload.clientDataJSON,
      })
    );

    expect(error.code).toBe("E_PAYLOAD_INVALID");
    expect(error.message).toBe("Invalid registration type.");
  });

  it("rejects passkey registration when the origin is wrong", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const challengePacket = getHandler("passkey:getChallenge")(makeTrustedEvent("http://localhost:5173/")) as {
      challengeId: string;
      challenge: number[];
    };
    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const saveCredential = getHandler("passkey:saveCredential");
    const event = makeTrustedEvent("http://localhost:5173/");
    const registration = makePasskeyRegistrationPayload({
      challenge: challengePacket.challenge,
      origin: "http://127.0.0.1:5173",
    });

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    const error = unwrapIpcError(
      await saveCredential(event, {
        challengeId: challengePacket.challengeId,
        credentialId: registration.payload.credentialId,
        attestationObject: registration.payload.attestationObject,
        clientDataJSON: registration.payload.clientDataJSON,
      })
    );

    expect(error.code).toBe("E_PAYLOAD_INVALID");
    expect(error.message).toBe("Origin mismatch.");
  });

  it("rejects passkey registration when the rpIdHash is wrong", async () => {
    lockState.startLocked = false;
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    await registerHandlers();

    const challengePacket = getHandler("passkey:getChallenge")(makeTrustedEvent("http://localhost:5173/")) as {
      challengeId: string;
      challenge: number[];
    };
    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const saveCredential = getHandler("passkey:saveCredential");
    const event = makeTrustedEvent("http://localhost:5173/");
    const registration = makePasskeyRegistrationPayload({
      challenge: challengePacket.challenge,
      origin: "http://localhost:5173",
      rpId: "example.com",
    });

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));

    const error = unwrapIpcError(
      await saveCredential(event, {
        challengeId: challengePacket.challengeId,
        credentialId: registration.payload.credentialId,
        attestationObject: registration.payload.attestationObject,
        clientDataJSON: registration.payload.clientDataJSON,
      })
    );

    expect(error.code).toBe("E_PAYLOAD_INVALID");
    expect(error.message).toBe("RP ID hash mismatch.");
  });

  it("keeps passkey unlock channels available while locked for trusted sender", async () => {
    await registerHandlers();

    const getChallenge = getHandler("passkey:getChallenge");
    const verifyAssertion = getHandler("passkey:verifyAssertion");

    const challengePacket = getChallenge(makeTrustedEvent()) as { challengeId: string; challenge: number[] };
    expect(challengePacket.challengeId.length).toBeGreaterThan(0);
    expect(challengePacket.challenge.length).toBe(32);

    const verified = await verifyAssertion(makeTrustedEvent(), {
      challengeId: challengePacket.challengeId,
      credentialId: "credential_id",
      clientDataJSON: [123],
      authenticatorData: [45],
      signature: [67],
    });
    expect(verified).toBe(false);
  });

  it("rejects untrusted sender for passkey unlock channels", async () => {
    await registerHandlers();

    const getChallenge = getHandler("passkey:getChallenge");
    const verifyAssertion = getHandler("passkey:verifyAssertion");

    expect(() => getChallenge(makeUntrustedEvent())).toThrowError("This security action was rejected.");
    await expect(
      verifyAssertion(makeUntrustedEvent(), {
        challengeId: "challengeid",
        credentialId: "credential_id",
        clientDataJSON: [1],
        authenticatorData: [2],
        signature: [3],
      })
    ).rejects.toThrowError("This security action was rejected.");
  });

  it("accepts only passkey assertions with matching credential, origin, rpId hash, and verification flags", async () => {
    lockState.startLocked = true;
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    listPasskeyCredentialsMock.mockReturnValue([
      {
        id: "cred1",
        name: "Work key",
        credentialId: "credential_id",
        publicKey: toBase64url(publicKey.export({ format: "der", type: "spki" }) as Buffer),
      },
    ]);

    await registerHandlers();

    const url = "http://localhost:5173/";
    const getChallenge = getHandler("passkey:getChallenge");
    const verifyAssertion = getHandler("passkey:verifyAssertion");
    const challengePacket = getChallenge(makeTrustedEvent(url)) as { challengeId: string; challenge: number[] };

    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: toBase64url(Uint8Array.from(challengePacket.challenge)),
        origin: "http://localhost:5173",
      }),
      "utf8"
    );
    const authenticatorData = makeAuthenticatorData("localhost", 0x05, 1);
    const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
    const signedData = Buffer.concat([Buffer.from(authenticatorData), clientDataHash]);
    const signature = sign("sha256", signedData, {
      key: privateKey,
      dsaEncoding: "der",
    });

    const verified = await verifyAssertion(makeTrustedEvent(url), {
      challengeId: challengePacket.challengeId,
      credentialId: "credential_id",
      clientDataJSON: Array.from(clientDataJSON),
      authenticatorData: Array.from(authenticatorData),
      signature: Array.from(signature),
    });

    expect(verified).toBe(true);
  });

  it("updates stored passkey signCount after a successful assertion", async () => {
    lockState.startLocked = true;
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    listPasskeyCredentialsMock.mockReturnValue([
      {
        id: "cred1",
        name: "Work key",
        credentialId: "credential_id",
        publicKey: toBase64url(publicKey.export({ format: "der", type: "spki" }) as Buffer),
        signCount: 1,
      },
    ]);

    await registerHandlers();

    const url = "http://localhost:5173/";
    const getChallenge = getHandler("passkey:getChallenge");
    const verifyAssertion = getHandler("passkey:verifyAssertion");
    const challengePacket = getChallenge(makeTrustedEvent(url)) as { challengeId: string; challenge: number[] };

    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: toBase64url(Uint8Array.from(challengePacket.challenge)),
        origin: "http://localhost:5173",
      }),
      "utf8"
    );
    const authenticatorData = makeAuthenticatorData("localhost", 0x05, 3);
    const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
    const signedData = Buffer.concat([Buffer.from(authenticatorData), clientDataHash]);
    const signature = sign("sha256", signedData, {
      key: privateKey,
      dsaEncoding: "der",
    });

    const verified = await verifyAssertion(makeTrustedEvent(url), {
      challengeId: challengePacket.challengeId,
      credentialId: "credential_id",
      clientDataJSON: Array.from(clientDataJSON),
      authenticatorData: Array.from(authenticatorData),
      signature: Array.from(signature),
    });

    expect(verified).toBe(true);
    expect(updatePasskeyCredentialSignCountMock).toHaveBeenCalledWith("credential_id", 3);
  });

  it("rejects stale signCount assertions and locks the app", async () => {
    lockState.startLocked = false;
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    listPasskeyCredentialsMock.mockReturnValue([
      {
        id: "cred1",
        name: "Work key",
        credentialId: "credential_id",
        publicKey: toBase64url(publicKey.export({ format: "der", type: "spki" }) as Buffer),
        signCount: 5,
      },
    ]);

    await registerHandlers();

    const url = "http://localhost:5173/";
    const getChallenge = getHandler("passkey:getChallenge");
    const verifyAssertion = getHandler("passkey:verifyAssertion");
    const getStatus = getHandler("lock:getStatus");
    const challengePacket = getChallenge(makeTrustedEvent(url)) as { challengeId: string; challenge: number[] };

    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: toBase64url(Uint8Array.from(challengePacket.challenge)),
        origin: "http://localhost:5173",
      }),
      "utf8"
    );
    const authenticatorData = makeAuthenticatorData("localhost", 0x05, 5);
    const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
    const signedData = Buffer.concat([Buffer.from(authenticatorData), clientDataHash]);
    const signature = sign("sha256", signedData, {
      key: privateKey,
      dsaEncoding: "der",
    });

    const verified = await verifyAssertion(makeTrustedEvent(url), {
      challengeId: challengePacket.challengeId,
      credentialId: "credential_id",
      clientDataJSON: Array.from(clientDataJSON),
      authenticatorData: Array.from(authenticatorData),
      signature: Array.from(signature),
    });

    expect(verified).toBe(false);
    expect(getStatus(makeTrustedEvent(url))).toBe(true);
    expect(updatePasskeyCredentialSignCountMock).not.toHaveBeenCalled();
  });

  it("rejects passkey assertions when the origin does not match the trusted sender", async () => {
    lockState.startLocked = true;
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    listPasskeyCredentialsMock.mockReturnValue([
      {
        id: "cred1",
        name: "Work key",
        credentialId: "credential_id",
        publicKey: toBase64url(publicKey.export({ format: "der", type: "spki" }) as Buffer),
      },
    ]);

    await registerHandlers();

    const url = "http://localhost:5173/";
    const getChallenge = getHandler("passkey:getChallenge");
    const verifyAssertion = getHandler("passkey:verifyAssertion");
    const challengePacket = getChallenge(makeTrustedEvent(url)) as { challengeId: string; challenge: number[] };

    const clientDataJSON = Buffer.from(
      JSON.stringify({
        type: "webauthn.get",
        challenge: toBase64url(Uint8Array.from(challengePacket.challenge)),
        origin: "http://127.0.0.1:5173",
      }),
      "utf8"
    );
    const authenticatorData = makeAuthenticatorData("localhost", 0x05, 1);
    const clientDataHash = createHash("sha256").update(clientDataJSON).digest();
    const signedData = Buffer.concat([Buffer.from(authenticatorData), clientDataHash]);
    const signature = sign("sha256", signedData, {
      key: privateKey,
      dsaEncoding: "der",
    });

    const verified = await verifyAssertion(makeTrustedEvent(url), {
      challengeId: challengePacket.challengeId,
      credentialId: "credential_id",
      clientDataJSON: Array.from(clientDataJSON),
      authenticatorData: Array.from(authenticatorData),
      signature: Array.from(signature),
    });

    expect(verified).toBe(false);
  });

  it("skips malformed accounts in totp:list instead of returning E_INTERNAL", async () => {
    lockState.startLocked = false;
    lockState.method = "none";
    loadAccountsMock.mockReturnValue([
      {
        id: "valid-1",
        issuer: "Issuer",
        label: "Label",
        secretBase32: "JBSWY3DPEHPK3PXP",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
      {
        id: "bad-account",
        issuer: "Broken",
        label: "Broken",
        secretBase32: "***not-base32***",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
      null,
    ]);

    await registerHandlers();

    const handler = getHandler("totp:list");
    const response = (await handler(makeTrustedEvent())) as {
      ok: boolean;
      data?: Array<{ id: string; issuer: string; label: string; digits: number; period: number }>;
    };

    expect(response.ok).toBe(true);
    expect(response.data).toEqual([
      {
        id: "valid-1",
        issuer: "Issuer",
        label: "Label",
        digits: 6,
        period: 30,
      },
    ]);
  });

  it("skips malformed accounts in totp:codes instead of returning E_INTERNAL", async () => {
    lockState.startLocked = false;
    lockState.method = "none";
    loadAccountsMock.mockReturnValue([
      {
        id: "valid-1",
        issuer: "Issuer",
        label: "Label",
        secretBase32: "JBSWY3DPEHPK3PXP",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
      {
        id: "bad-secret",
        issuer: "Broken",
        label: "Broken",
        secretBase32: "not-valid",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
    ]);
    totpCodeSyncMock.mockReturnValue({ code: "654321", remainingSeconds: 25 });

    await registerHandlers();

    const handler = getHandler("totp:codes");
    const response = (await handler(makeTrustedEvent())) as {
      ok: boolean;
      data?: Array<{ id: string; code: string; remainingSeconds: number }>;
    };

    expect(response.ok).toBe(true);
    expect(response.data).toEqual([
      {
        id: "valid-1",
        code: "654321",
        remainingSeconds: 25,
      },
    ]);
    expect(totpCodeSyncMock).toHaveBeenCalledTimes(1);
  });

  it("returns a single TOTP code without exposing secret data", async () => {
    lockState.startLocked = false;
    lockState.method = "none";
    loadAccountsMock.mockReturnValue([
      {
        id: "valid-1",
        issuer: "Issuer",
        label: "Label",
        secretBase32: "JBSWY3DPEHPK3PXP",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
    ]);
    totpCodeSyncMock.mockReturnValue({ code: "112233", remainingSeconds: 18 });

    await registerHandlers();

    const handler = getHandler("totp:getCode");
    const response = (await handler(makeTrustedEvent(), "valid-1")) as {
      ok: boolean;
      data?: { code: string; remainingSeconds: number } | null;
    };

    expect(response.ok).toBe(true);
    expect(response.data).toEqual({ code: "112233", remainingSeconds: 18 });
    expect(totpCodeSyncMock).toHaveBeenCalledWith("JBSWY3DPEHPK3PXP", {
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
  });

  it("requires an open security session before revealing an account secret", async () => {
    lockState.startLocked = false;
    lockState.method = "none";
    loadAccountsMock.mockReturnValue([
      {
        id: "valid-1",
        issuer: "Issuer",
        label: "Label",
        secretBase32: "JBSWY3DPEHPK3PXP",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
    ]);

    await registerHandlers();

    const revealSecret = getHandler("totp:revealSecret");
    const error = unwrapIpcError(await revealSecret(makeTrustedEvent(), "valid-1"));

    expect(error.code).toBe("E_STEP_UP_REQUIRED");
    expect(error.message).toBe("A security session is required. Open one first.");
  });

  it("reveals an account secret only after opening a security session", async () => {
    lockState.startLocked = false;
    lockState.method = "none";
    verifyCredentialWithLimitMock.mockResolvedValue({ result: "OK" } as any);
    loadAccountsMock.mockReturnValue([
      {
        id: "valid-1",
        issuer: "Issuer",
        label: "Label",
        secretBase32: "JBSWY3DPEHPK3PXP",
        digits: 6,
        period: 30,
        algorithm: "SHA1",
      },
    ]);

    await registerHandlers();

    const event = makeTrustedEvent();
    const stepUpVerify = getHandler("lock:stepUpVerify");
    const openSecuritySession = getHandler("lock:openSecuritySession");
    const revealSecret = getHandler("totp:revealSecret");

    unwrapIpcOk<{ result: "OK" }>(await stepUpVerify(event, { method: "pin", input: "123456" }));
    unwrapIpcOk<void>(await openSecuritySession(event));
    expect(unwrapIpcOk<string>(await revealSecret(event, "valid-1"))).toBe("JBSWY3DPEHPK3PXP");
  });

  it("temporarily minimizes while running screen selection and restores after", async () => {
    lockState.startLocked = false;
    lockState.method = "none";

    let minimized = false;
    const minimizeMock = vi.fn(() => {
      minimized = true;
    });
    const restoreMock = vi.fn();
    const focusMock = vi.fn();
    const isMinimizedMock = vi.fn(() => minimized);

    scanQrFromScreenMock.mockResolvedValueOnce({ status: "cancelled" });

    await registerHandlers();

    const handler = getHandler("totp:scanFromScreen");
    const response = (await handler(
      makeTrustedEvent(trustedRendererUrl(), {
        minimize: minimizeMock,
        restore: restoreMock,
        focus: focusMock,
        isMinimized: isMinimizedMock,
      })
    )) as { ok: boolean; data?: string | null };

    expect(response.ok).toBe(true);
    expect(response.data).toBeNull();
    expect(minimizeMock).toHaveBeenCalledTimes(1);
    expect(scanQrFromScreenMock).toHaveBeenCalledWith(undefined);
    expect(restoreMock).toHaveBeenCalledTimes(1);
    expect(focusMock).toHaveBeenCalledTimes(1);
  });
});
