import { registerPlugin } from "@capacitor/core";

export type VaultKeyWrapResult = {
  iv: string;
  wrappedKey: string;
  authTag: string;
};

type VaultKeyPlugin = {
  generateKey(options?: { alias?: string; biometric?: boolean }): Promise<{ alias: string }>;
  wrap(options: { alias: string; plaintextBase64: string }): Promise<VaultKeyWrapResult>;
  unwrap(options: { alias: string; iv: string; wrappedKey: string; authTag: string }): Promise<{
    plaintextBase64: string;
    secureHardwareEnforced?: boolean;
    securityLevel?: string;
  }>;
  deleteKey(options: { alias: string }): Promise<{ alias: string }>;
};

export const VaultKey = registerPlugin<VaultKeyPlugin>("VaultKey");
