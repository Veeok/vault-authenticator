function ensureWebAuthnSupport(): void {
  if (typeof navigator === "undefined") {
    throw new Error("Passkey is not supported on this device.");
  }
  if (typeof navigator.credentials?.create !== "function" || typeof navigator.credentials?.get !== "function") {
    throw new Error("Passkey is not supported on this device.");
  }
}

function resolveRelyingPartyId(): string {
  if (typeof window === "undefined") return "localhost";
  const hostname = window.location.hostname.trim().toLowerCase();
  if (!hostname) return "localhost";
  if (!/^[a-z0-9.-]+$/.test(hostname)) return "localhost";
  return hostname;
}

export function bufToBase64url(buf: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < buf.length; index += 1) {
    binary += String.fromCharCode(buf[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlToBuf(b64: string): Uint8Array {
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

export async function registerPasskey(challenge: number[]): Promise<{
  credentialId: string;
  attestationObject: string;
  clientDataJSON: string;
}> {
  ensureWebAuthnSupport();
  const challengeBytes = new Uint8Array(challenge);
  const rpId = resolveRelyingPartyId();

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge: challengeBytes,
      rp: {
        name: "Vault Authenticator",
        id: rpId,
      },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: "Vault Authenticator",
        displayName: "Vault Authenticator",
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "required",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credential) {
    throw new Error("Passkey registration was canceled.");
  }

  const response = credential.response as AuthenticatorAttestationResponse;
  if (!(response.attestationObject instanceof ArrayBuffer) || !(response.clientDataJSON instanceof ArrayBuffer)) {
    throw new Error("Passkey registration response was incomplete.");
  }

  return {
    credentialId: bufToBase64url(new Uint8Array(credential.rawId)),
    attestationObject: bufferToBase64(response.attestationObject),
    clientDataJSON: bufferToBase64(response.clientDataJSON),
  };
}

export async function assertPasskey(
  challenge: number[],
  credentialIds: string[]
): Promise<{
  credentialId: string;
  clientDataJSON: number[];
  authenticatorData: number[];
  signature: number[];
}> {
  ensureWebAuthnSupport();
  const challengeBytes = new Uint8Array(challenge);
  const rpId = resolveRelyingPartyId();
  const normalizedIds = credentialIds
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (normalizedIds.length === 0) {
    throw new Error("No passkey credential is available.");
  }

  const allowedCredentials = normalizedIds.map((credentialId) => ({
    type: "public-key" as const,
    id: new Uint8Array(base64urlToBuf(credentialId)),
  }));

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: challengeBytes,
      rpId,
      allowCredentials: allowedCredentials,
      userVerification: "required",
      authenticatorAttachment: "platform",
      timeout: 60000,
    } as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null;

  if (!assertion) {
    throw new Error("Passkey assertion was canceled.");
  }

  const response = assertion.response as AuthenticatorAssertionResponse;

  return {
    credentialId: bufToBase64url(new Uint8Array(assertion.rawId)),
    clientDataJSON: Array.from(new Uint8Array(response.clientDataJSON)),
    authenticatorData: Array.from(new Uint8Array(response.authenticatorData)),
    signature: Array.from(new Uint8Array(response.signature)),
  };
}
