import { App as CapacitorApp } from "@capacitor/app";
import type { Bridge } from "@authenticator/ui";

let listenersRegistered = false;

async function lockForBackground(bridge: Bridge): Promise<void> {
  await bridge.lockAPI.lock().catch((): undefined => undefined);
  if (bridge.lockAPI.closeSecuritySession) {
    await bridge.lockAPI.closeSecuritySession().catch((): undefined => undefined);
  }
}

export async function registerNativeLifecycleLocking(bridge: Bridge): Promise<void> {
  if (listenersRegistered) {
    return;
  }
  listenersRegistered = true;

  try {
    await CapacitorApp.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) {
        void lockForBackground(bridge);
      }
    });
  } catch {
    // Ignore unavailable native lifecycle hooks in unsupported runtimes.
  }

  try {
    await CapacitorApp.addListener("pause", () => {
      void lockForBackground(bridge);
    });
  } catch {
    // Ignore unavailable native lifecycle hooks in unsupported runtimes.
  }
}
