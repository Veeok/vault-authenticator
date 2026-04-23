import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertPasskey, registerPasskey } from "./passkey";

function setCredentialApis(createImpl: () => Promise<PublicKeyCredential | null>, getImpl: () => Promise<PublicKeyCredential | null>) {
  Object.defineProperty(window.navigator, "credentials", {
    configurable: true,
    value: {
      create: vi.fn(createImpl),
      get: vi.fn(getImpl),
    },
  });
}

describe("passkey utils", () => {
  beforeEach(() => {
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      hostname: "vault.local",
    } as Location);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the app name and renderer hostname for passkey registration", async () => {
    const createMock = vi.fn(async (options?: CredentialCreationOptions) => {
      const publicKey = options?.publicKey as PublicKeyCredentialCreationOptions;
      expect(publicKey.rp.name).toBe("Vault Authenticator");
      expect(publicKey.rp.id).toBe("vault.local");
      expect(publicKey.user.name).toBe("Vault Authenticator");
      expect(publicKey.user.displayName).toBe("Vault Authenticator");

      return {
        rawId: Uint8Array.from([1, 2, 3]).buffer,
        response: {
          attestationObject: Uint8Array.from([4, 5, 6]).buffer,
          clientDataJSON: Uint8Array.from([7, 8, 9]).buffer,
        },
      } as unknown as PublicKeyCredential;
    });

    setCredentialApis(createMock, async () => null);

    const result = await registerPasskey([9, 8, 7]);

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(result.credentialId.length).toBeGreaterThan(0);
    expect(result.attestationObject.length).toBeGreaterThan(0);
    expect(result.clientDataJSON.length).toBeGreaterThan(0);
  });

  it("uses the renderer hostname as rpId for passkey assertions", async () => {
    const getMock = vi.fn(async (options?: CredentialRequestOptions) => {
      const publicKey = options?.publicKey as PublicKeyCredentialRequestOptions;
      expect(publicKey.rpId).toBe("vault.local");

      return {
        rawId: Uint8Array.from([7, 8, 9]).buffer,
        response: {
          clientDataJSON: Uint8Array.from([1, 2]).buffer,
          authenticatorData: Uint8Array.from([3, 4]).buffer,
          signature: Uint8Array.from([5, 6]).buffer,
        },
      } as unknown as PublicKeyCredential;
    });

    setCredentialApis(async () => null, getMock);

    const result = await assertPasskey([1, 2, 3], ["AQID"]);

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(result.credentialId).toBe("BwgJ");
    expect(result.clientDataJSON).toEqual([1, 2]);
    expect(result.authenticatorData).toEqual([3, 4]);
    expect(result.signature).toEqual([5, 6]);
  });
});
