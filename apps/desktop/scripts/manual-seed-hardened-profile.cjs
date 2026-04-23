const path = require("node:path");
const { createHash, createCipheriv, randomBytes } = require("node:crypto");
const { mkdirSync } = require("node:fs");
const { app } = require("electron");
const StoreModule = require("electron-store");
const { hash, hashRaw, Algorithm } = require("@node-rs/argon2");

const Store = StoreModule.default || StoreModule;

function usage() {
  console.error("Usage: electron scripts/manual-seed-hardened-profile.cjs <appDataRoot> <pin|password> <appLockSecret> <masterPassword> [recoveryCode]");
  process.exit(1);
}

const [, , appDataRootArg, mode, appLockSecret, masterPassword, recoveryCodeArg] = process.argv;
if (!appDataRootArg || !mode || !appLockSecret || !masterPassword) {
  usage();
}

if (mode !== "pin" && mode !== "password") {
  usage();
}

const appDataRoot = path.resolve(appDataRootArg);
const userDataPath = path.join(appDataRoot, "Vault");

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function encryptWithAesGcm(plaintext, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(ciphertext),
    authTag: bytesToBase64(authTag),
  };
}

function backupCodeRecord(code) {
  const normalized = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const salt = randomBytes(16).toString("hex");
  return {
    salt,
    hash: createHash("sha256").update(`${normalized}${salt}`).digest("hex"),
  };
}

app.setName("Vault Authenticator");
app.setPath("appData", appDataRoot);
app.setPath("userData", userDataPath);

app.whenReady().then(async () => {
  mkdirSync(userDataPath, { recursive: true });

  const credentialHash = await hash(appLockSecret, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  const payload = {
    accounts: [],
    backupCodes: recoveryCodeArg ? [backupCodeRecord(recoveryCodeArg)] : [],
    backupCodeLockState: { failedCount: 0, lockUntilEpochMs: 0 },
    lockState: { failedCount: 0, lockUntilEpochMs: 0 },
    lockMethod: mode === "pin" ? "pin6" : "password",
    primaryLockMethod: mode === "pin" ? "pin" : "password",
    secondaryLockMethod: null,
    quickUnlock: { windowsHello: false, passkey: false },
    settings: {
      privacyScreen: true,
      runInBackground: false,
      autoLockSeconds: 0,
      lockOnFocusLoss: true,
      hasCompletedSafetySetup: true,
      hasSkippedSafetySetup: false,
    },
  };

  if (mode === "pin") {
    payload.pinCredential = { hash: credentialHash, digits: 6 };
  } else {
    payload.passwordCredential = { hash: credentialHash };
  }

  const salt = randomBytes(32);
  const masterKey = Buffer.from(
    await hashRaw(masterPassword, {
      algorithm: Algorithm.Argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
      outputLen: 32,
      salt,
    })
  );
  const vaultKey = randomBytes(32);
  const wrapped = encryptWithAesGcm(vaultKey, masterKey);
  const encryptedPayload = encryptWithAesGcm(Buffer.from(JSON.stringify(payload), "utf8"), vaultKey);

  const store = new Store({
    name: "authenticator-secrets",
    cwd: userDataPath,
  });
  store.set("vaultMode", "hardened");
  store.set("hardenedEnvelope", {
    version: 1,
    mode: "hardened",
    argon2Params: { m: 65536, t: 3, p: 1 },
    salt: bytesToBase64(salt),
    wrappedKey: wrapped.ciphertext,
    wrapIv: wrapped.iv,
    wrapAuthTag: wrapped.authTag,
    ciphertext: encryptedPayload.ciphertext,
    iv: encryptedPayload.iv,
    authTag: encryptedPayload.authTag,
    masterPasswordLockState: { failedCount: 0, lockUntilEpochMs: 0 },
  });
  store.delete("blob");

  console.log(
    JSON.stringify({
      appDataRoot,
      userDataPath,
      mode,
      recoveryCode: recoveryCodeArg || null,
      hardened: true,
    })
  );

  app.quit();
}).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
  app.quit();
});
