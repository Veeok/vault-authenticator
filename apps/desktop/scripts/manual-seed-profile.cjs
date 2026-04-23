const path = require("node:path");
const { createHash, randomBytes } = require("node:crypto");
const { mkdirSync } = require("node:fs");
const { app, safeStorage } = require("electron");
const StoreModule = require("electron-store");
const { hash, Algorithm } = require("@node-rs/argon2");
const Store = StoreModule.default || StoreModule;

function usage() {
  console.error("Usage: electron scripts/manual-seed-profile.cjs <appDataRoot> <pin|password> <secret> [recoveryCode]");
  process.exit(1);
}

const [, , appDataRootArg, mode, secret, recoveryCodeArg] = process.argv;
if (!appDataRootArg || !mode || !secret) {
  usage();
}

if (mode !== "pin" && mode !== "password") {
  usage();
}

const appDataRoot = path.resolve(appDataRootArg);
const userDataPath = path.join(appDataRoot, "Vault");

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

  const credentialHash = await hash(secret, {
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

  const encrypted = safeStorage.encryptString(JSON.stringify(payload)).toString("base64");
  const store = new Store({
    name: "authenticator-secrets",
    cwd: userDataPath,
  });
  store.set("blob", encrypted);

  console.log(
    JSON.stringify({
      appDataRoot,
      userDataPath,
      mode,
      recoveryCode: recoveryCodeArg || null,
    })
  );

  app.quit();
}).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
  app.quit();
});
