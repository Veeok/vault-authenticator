import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type IpcFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

type IpcSuccess<T> = {
  ok: true;
  data: T;
};

type IpcResult<T> = IpcSuccess<T> | IpcFailure;

function isIpcResult<T>(value: unknown): value is IpcResult<T> {
  return !!value && typeof value === "object" && "ok" in (value as Record<string, unknown>);
}

function isMissingHandlerError(error: unknown, channel: string): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes(`No handler registered for '${channel}'`);
}

async function invokeSafe<T>(channel: string, ...args: unknown[]): Promise<T> {
  const response = await ipcRenderer.invoke(channel, ...args);
  if (!isIpcResult<T>(response)) {
    return response as T;
  }

  const result = response as IpcResult<T>;
  if (result.ok) {
    return result.data;
  }

  const failure = result as IpcFailure;
  throw {
    name: "AppError",
    code: failure.error.code,
    message: failure.error.message,
  };
}

async function invokeOptionalHandler(channel: string, ...args: unknown[]): Promise<boolean> {
  try {
    await ipcRenderer.invoke(channel, ...args);
    return true;
  } catch (error) {
    if (isMissingHandlerError(error, channel)) {
      return false;
    }
    throw error;
  }
}

contextBridge.exposeInMainWorld("authAPI", {
  list: () => invokeSafe("totp:list"),
  addUri: (uri: string) => invokeSafe("totp:addUri", uri),
  addManual: (p: unknown) => invokeSafe("totp:addManual", p),
  del: (id: string) => invokeSafe("totp:delete", id),
  getTotpCode: (id: string) => invokeSafe("totp:getCode", id),
  revealSecret: (id: string) => invokeSafe("totp:revealSecret", id),
  codes: () => invokeSafe("totp:codes"),
  scanFromScreen: () => invokeSafe("totp:scanFromScreen"),
});

contextBridge.exposeInMainWorld("appAPI", {
  getSettings: () => invokeSafe("app:getSettings"),
  updateSettings: (next: unknown) => invokeSafe("app:updateSettings", next),
  getVaultProtectionStatus: () => invokeSafe("vault:getProtectionStatus"),
  generateRecoverySecret: () => invokeSafe("vault:generateRecoverySecret"),
  enrollBiometricUnlock: () => invokeSafe("vault:enrollBiometric"),
  removeBiometricUnlock: () => invokeSafe("vault:removeBiometric"),
  migrateWithPassword: (password: string) => invokeSafe("vault:migrateWithPassword", password),
  migrateSetPassword: (password: string) => invokeSafe("vault:migrateSetPassword", password),
  setBaseMode: (baseMode: string) => invokeSafe("settings:setBaseMode", baseMode),
  setThemeColor: (themeColor: string) => invokeSafe("settings:setThemeColor", themeColor),
  setAccentOverride: (accentOverride: string) => invokeSafe("settings:setAccentOverride", accentOverride),
  // Backward-compatible aliases.
  setBaseTheme: (baseTheme: string) => invokeSafe("settings:setBaseTheme", baseTheme),
  setAccent: (accent: string) => invokeSafe("settings:setAccent", accent),
  getAutoLockTimeout: () => invokeSafe("settings:getAutoLockTimeout"),
  setAutoLockTimeout: (seconds: number) => invokeSafe("settings:setAutoLockTimeout", seconds),
  getLockOnFocusLoss: () => invokeSafe("settings:getLockOnFocusLoss"),
  setLockOnFocusLoss: (enabled: boolean) => invokeSafe("settings:setLockOnFocusLoss", enabled),
  getStartWithSystem: () => invokeSafe("settings:getStartWithSystem"),
  setStartWithSystem: (enabled: boolean) => invokeSafe("settings:setStartWithSystem", enabled),
  getRunInBackground: () => invokeSafe("settings:getRunInBackground"),
  setRunInBackground: (enabled: boolean) => invokeSafe("settings:setRunInBackground", enabled),
  exportBackup: (passphrase: string) => invokeSafe("backup:export", passphrase),
  importBackup: (passphrase: string, mode: "merge" | "replace") => invokeSafe("backup:import", passphrase, mode),
  reorderAccounts: (ids: string[]) => invokeSafe("totp:reorder", ids),
  getAccountForEdit: (id: string) => invokeSafe("totp:getForEdit", id),
  updateAccount: (id: string, payload: unknown) => invokeSafe("totp:update", id, payload),
});

contextBridge.exposeInMainWorld("lockAPI", {
  getMethod: () => ipcRenderer.invoke("lock:getMethod"),
  getStatus: () => ipcRenderer.invoke("lock:getStatus"),
  getMethodsConfig: () => ipcRenderer.invoke("lock:getMethodsConfig"),
  setMethod: (method: string) => ipcRenderer.invoke("lock:setMethod", method),
  setMethodsConfig: (config: { primaryLockMethod: string; secondaryLockMethod: string | null }) =>
    ipcRenderer.invoke("lock:setMethodsConfig", config),
  getQuickUnlock: () => ipcRenderer.invoke("lock:getQuickUnlock"),
  setQuickUnlock: (config: { windowsHello: boolean; passkey: boolean }) => ipcRenderer.invoke("lock:setQuickUnlock", config),
  setCredential: (type: string, value: string) => ipcRenderer.invoke("lock:setCredential", type, value),
  verify: (type: string, input: string) => ipcRenderer.invoke("lock:verify", type, input),
  getLockState: () => ipcRenderer.invoke("lock:getLockState"),
  hasCredential: (type: string) => ipcRenderer.invoke("lock:hasCredential", type),
  resetAppLock: () => invokeSafe("lock:resetAppLock"),
  lock: () => ipcRenderer.invoke("lock:lock"),
  biometricAvailable: () => ipcRenderer.invoke("lock:biometricAvailable"),
  promptBiometric: () => ipcRenderer.invoke("lock:promptBiometric"),
  validateAndBurnRecoverySecret: (secret: string) => invokeSafe("lock:validateAndBurnRecoverySecret", secret),
  setPasswordAfterRecovery: (password: string) => invokeSafe("lock:setPasswordAfterRecovery", password),
  openSecuritySession: () => invokeOptionalHandler("lock:openSecuritySession"),
  closeSecuritySession: () => invokeOptionalHandler("lock:closeSecuritySession"),
  onShowLockScreen: (cb: () => void) => {
    const listener = () => cb();
    ipcRenderer.on("auth:showLockScreen", listener);
    return () => {
      ipcRenderer.removeListener("auth:showLockScreen", listener);
    };
  },
  getPinDigits: () => ipcRenderer.invoke("lock:getPinDigits"),
  stepUpGetChallenge: () => invokeSafe("lock:stepUpGetChallenge"),
  stepUpVerify: (payload: unknown) => invokeSafe("lock:stepUpVerify", payload),
  passkeyGetChallenge: () => ipcRenderer.invoke("passkey:getChallenge"),
  passkeyGetCredentialId: () => ipcRenderer.invoke("passkey:getCredentialId"),
  passkeyListCredentials: () => ipcRenderer.invoke("passkey:listCredentials"),
  passkeySaveCredential: (payload: {
    challengeId: string;
    credentialId: string;
    attestationObject: string;
    clientDataJSON: string;
    name?: string;
  }) => invokeSafe("passkey:saveCredential", payload),
  passkeyRenameCredential: (id: string, name: string) => invokeSafe("passkey:renameCredential", { id, name }),
  passkeyRemoveCredential: (id: string) => invokeSafe("passkey:removeCredential", { id }),
  passkeyVerifyAssertion: (args: {
    challengeId: string;
    credentialId: string;
    clientDataJSON: number[];
    authenticatorData: number[];
    signature: number[];
  }) => ipcRenderer.invoke("passkey:verifyAssertion", args),
  passkeyClearCredential: () => invokeSafe("passkey:clearCredential"),
});

contextBridge.exposeInMainWorld("windowAPI", {
  minimize: () => ipcRenderer.invoke("window:minimize"),
  maximize: () => ipcRenderer.invoke("window:maximize"),
  unmaximize: () => ipcRenderer.invoke("window:unmaximize"),
  close: () => ipcRenderer.invoke("window:close"),
  getVersion: async (): Promise<string> => {
    const value = await ipcRenderer.invoke("window:getVersion");
    return typeof value === "string" ? value : "";
  },
  isMaximized: async (): Promise<boolean> => {
    const value = await ipcRenderer.invoke("window:isMaximized");
    return !!value;
  },
  isBackgrounded: async (): Promise<boolean> => {
    const value = await ipcRenderer.invoke("window:isBackgrounded");
    return !!value;
  },
  getAlwaysOnTop: async (): Promise<boolean> => {
    const value = await ipcRenderer.invoke("window:getAlwaysOnTop");
    return !!value;
  },
  setAlwaysOnTop: async (enabled: boolean): Promise<void> => {
    await ipcRenderer.invoke("window:setAlwaysOnTop", !!enabled);
  },
  onMaximizedChanged: (cb: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, maximized: unknown) => {
      cb(!!maximized);
    };
    ipcRenderer.on("window:maximizedChanged", listener);
    return () => {
      ipcRenderer.removeListener("window:maximizedChanged", listener);
    };
  },
  onAlwaysOnTopChanged: (cb: (enabled: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, enabled: unknown) => {
      cb(!!enabled);
    };
    ipcRenderer.on("window:alwaysOnTopChanged", listener);
    return () => {
      ipcRenderer.removeListener("window:alwaysOnTopChanged", listener);
    };
  },
  onBackgroundedChanged: (cb: (backgrounded: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, backgrounded: unknown) => {
      cb(!!backgrounded);
    };
    ipcRenderer.on("window:backgroundedChanged", listener);
    return () => {
      ipcRenderer.removeListener("window:backgroundedChanged", listener);
    };
  },
  onAppCommand: (cb: (command: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, command: unknown) => {
      cb(typeof command === "string" ? command : "");
    };
    ipcRenderer.on("window:appCommand", listener);
    return () => {
      ipcRenderer.removeListener("window:appCommand", listener);
    };
  },
});

contextBridge.exposeInMainWorld("clipboardAPI", {
  clear: (expectedText: string) => invokeSafe("clipboard:clear", expectedText),
});
