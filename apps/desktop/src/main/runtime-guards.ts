type SingleInstanceEvent = "second-instance";

export type SingleInstanceApp = {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: SingleInstanceEvent, listener: () => void): void;
};

export function acquireSingleInstanceLock(appInstance: SingleInstanceApp, onSecondInstance: () => void): boolean {
  const hasLock = appInstance.requestSingleInstanceLock();
  if (!hasLock) {
    appInstance.quit();
    return false;
  }

  appInstance.on("second-instance", () => {
    onSecondInstance();
  });

  return true;
}

export function ensureTraySingleton<T>(currentTray: T | null, createTray: () => T): T {
  if (currentTray) {
    return currentTray;
  }
  return createTray();
}
