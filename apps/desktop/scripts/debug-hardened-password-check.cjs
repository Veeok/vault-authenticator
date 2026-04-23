const { app } = require("electron");

const [, , password] = process.argv;
if (!password) {
  console.error("Usage: electron scripts/debug-hardened-password-check.cjs <password>");
  process.exit(1);
}

app.setName("Vault Authenticator");

app.whenReady().then(async () => {
  try {
    const secureStore = await import("../src/main/secure-store.ts");
    const lockStore = await import("../src/main/lock-store.ts");

    const protection = secureStore.getVaultProtectionStatus();
    const unlockResult = await secureStore.unlockHardenedVaultWithPassword(password);
    let verifyResult = null;
    let hasPassword = null;
    let method = null;

    if (unlockResult.result === "OK") {
      hasPassword = lockStore.hasCredential("password");
      method = lockStore.getLockMethod();
      verifyResult = await lockStore.verifyCredentialWithLimit("password", password);
    }

    console.log(
      JSON.stringify(
        {
          protection,
          unlockResult,
          hasPassword,
          method,
          verifyResult,
        },
        null,
        2
      )
    );
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  } finally {
    app.quit();
  }
});
