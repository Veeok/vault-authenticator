# Security Hardening Report

## Status

| Sub-task | Status | Notes |
| --- | --- | --- |
| 1. Secrets out of the renderer | Completed | UI secret-bearing field names removed, desktop/mobile safe bridge methods added. |
| 2. Custom `app://` protocol | Completed | Packaged desktop renderer now loads from `app://vault-authenticator`. |
| 3. Step-up auth on sensitive actions | Completed | Desktop/mobile sensitive flows gated behind security-session step-up. |
| 4. WebAuthn `signCount` | Completed | Stored and enforced on desktop passkey verification. |
| 5. In-memory secret lifetime | Partially completed / regressed | Mobile best-effort memory hygiene changes remain. Desktop session-cache refactor regressed and was reverted under the policy. |
| 6. Stricter secure defaults | Completed | Existing defaults already matched 5-minute auto-lock, privacy screen on, clipboard clear on. Vault password policy tightened to 10+ chars and not all numeric for new setup/change flows. |
| 7. Backup hardening | Completed | Export/import already used a distinct backup passphrase UI. Added desktop synced-folder warning and kept all import modes step-up gated. |

## Regressions Found

### Sub-task 5

- Regression: desktop full suite failed after changing hardened-session lifetime handling.
- Failing area: `apps/desktop/src/__tests__/ipc-handlers.security.test.ts`
- Symptoms:
  - lock-path tests broke after introducing `clearHardenedSession` into the lock flow
  - cloned-passkey lock test no longer observed the expected lock state while the desktop session changes were active
- Action taken: reverted the desktop portion of Sub-task 5 and re-ran the desktop/mobile suites until baseline was restored.

## Remaining Known Gaps

- Desktop now clears the decrypted payload cache on lock/background/crash paths, but the in-memory VDK still remains resident while the vault stays unlocked by design.
- Mobile now clears app-lock and security-session state from native `appStateChange` and `pause` hooks, but there is still no iOS project in this workspace to validate equivalent native lifecycle coverage there.
- JavaScript string values cannot be zeroized reliably once marshaled through V8/IPC. Buffer and typed-array clearing remains best-effort only.
- Android backup hardening was validated through the manifest change and automated tests in this session, but not through a device install or Gradle assemble run.
- The final two validation items were covered by automated tests rather than an interactive manual desktop run:
  - stale `signCount` replay rejection
  - `revealSecret` rejection without an open step-up security session

## Validation Log

- Baseline before edits: desktop `108/108`, mobile `7/7`
- After Sub-task 1: desktop `111/111`, mobile `7/7`
- After Sub-task 2: desktop `111/111`, mobile `7/7`
- After Sub-task 3: desktop `111/111`, mobile `7/7`
- After Sub-task 4: desktop `113/113`, mobile `7/7`
- After Sub-task 5 desktop revert: desktop `113/113`, mobile `7/7`
- After Sub-task 6: desktop `113/113`, mobile `7/7`
- After Sub-task 7 and final validation: desktop `113/113`, mobile `7/7`

## Final Checks

- `packages/ui/src` secret leak grep: zero matches for `secretBase32|rawSecret|seedBytes`
- `apps/desktop/src/main/ipc-handlers.ts` renderer-origin grep: zero matches for `file://`
- `baseline.json` vs `current.json`: textual diff exists because new tests were added and timings changed, but both snapshots are fully green and no previously passing test now fails.

## Files Changed

- `apps/desktop/src/main/ipc-handlers.ts`
- `apps/desktop/src/main/lock-store.ts`
- `apps/desktop/src/main/passkey-store.ts`
- `apps/desktop/src/main/secure-store.ts`
- `apps/desktop/src/main/vault-v4.ts`
- `apps/desktop/src/preload.ts`
- `apps/desktop/src/__tests__/ipc-handlers.security.test.ts`
- `apps/desktop/src/__tests__/lock-store.test.ts`
- `apps/desktop/vite.renderer.config.ts`
- `apps/desktop/src/main.ts`
- `apps/mobile/src/mobile-bridge.ts`
- `apps/mobile/src/mobile-vault.ts`
- `packages/core/src/types.ts`
- `packages/core/dist/types.d.ts`
- `packages/ui/src/bridge.ts`
- `packages/ui/index.d.ts`
- `packages/ui/src/App.tsx`
- `packages/ui/src/components/AddModal.tsx`
- `packages/ui/src/components/SafetySetupModal.tsx`
- `packages/ui/src/components/SecurityPicker.tsx`
- `packages/ui/src/components/StepUpAuthModal.tsx`
- `packages/ui/src/utils/errors.ts`

## Track S2

### Status

| Sub-task | Status | Notes |
| --- | --- | --- |
| 1. Unify all verifiers on Argon2id | Completed | Desktop/mobile recovery verifiers now use Argon2id PHC strings for new data. Legacy recovery verifier objects remain readable. Mobile PBKDF2 remains only in the explicit legacy PIN migration helper. |
| 2. Retry limits everywhere, durable | Completed | Desktop app-lock and vault-password paths now use the 10-attempt backoff schedule; mobile PIN and biometric counters are persisted. Remaining recovery-factor parity gaps are listed below. |
| 3. Password and PIN policy | Completed | Shared vault-password and mobile PIN policy module added. Desktop UI and privileged validation now enforce 12-128 chars plus blocklist on new/change/reset flows; mobile server-side PIN now enforces 6-12 digits plus blocklist. |
| 4. Biometric enrollment invalidation | Completed | Android keystore biometric key creation now prefers StrongBox, enables biometric-enrollment invalidation, and maps invalidation to a specific bridge error/message. iOS is skipped in this workspace and macOS enrollment-bound invalidation remains a known gap. |
| 5. Leakage controls | Completed | Desktop runtime settings now reapply content protection, recovery-secret clipboard clearing is 30s, and desktop dev diagnostics redact sensitive material before console/file logging. Android `FLAG_SECURE` was already present. |
| 6. IPC hardening | Completed | Localhost trust is now gated by `!app.isPackaged`, more direct handlers enforce trusted senders, and malformed payloads are logged through the same IPC failure path. |
| 7. Session termination completeness | Completed | Desktop security sessions now invalidate on blur, minimize, hide, existing navigation/reload/crash/close hooks, and OS user-resign-active lock path in main runtime. |

### S2 Validation Log

- Baseline before S2 edits: desktop `109/109`, mobile `7/7`
- After S2.6: desktop `110/110`, mobile `7/7`
- After S2.1: desktop `110/110`, mobile `7/7`
- After S2.2: desktop `110/110`, mobile `7/7`
- After S2.3: desktop `110/110`, mobile `7/7`
- After S2.7: desktop `110/110`, mobile `7/7`
- After S2.5: desktop `110/110`, mobile `7/7`, UI `79/79`
- After S2.4 and final verification: desktop `110/110`, mobile `7/7`, UI `79/79`

### S2 Final Checks

- Baseline vs current JSON snapshots:
  - desktop baseline `109 passed / 0 failed`, current `110 passed / 0 failed`
  - mobile baseline `7 passed / 0 failed`, current `7 passed / 0 failed`
  - Result: zero new failures in the baseline-tracked suites
- Desktop renderer regression follow-up:
  - Symptom: packaged desktop app could show a blank white window
  - Root cause: `apps/desktop/vite.renderer.config.ts` aliased `@authenticator/core` to the Node-oriented `packages/core/src/index.ts`, which re-exported `totp.ts` and its `crypto` dependency into the browser renderer build
  - Fix: added `packages/core/src/browser.ts` and pointed the desktop renderer alias at that browser-safe entry
  - Verification: `pnpm --filter desktop exec vite build --config vite.renderer.config.ts` now succeeds
- Verifier grep audit:
  - mobile `PBKDF2` matches are only inside the explicit legacy PIN migration helper in `apps/mobile/src/mobile-bridge.ts`
  - desktop `sha256` matches now come from non-verifier code paths (passkey/WebAuthn hashing, backup format checks) plus legacy credential migration helpers in `apps/desktop/src/main/lock-store.ts` and `apps/desktop/src/main/secure-store.ts`
- Localhost origin audit:
  - the trust allowance is now only inside `if (!app.isPackaged)` in `apps/desktop/src/main/ipc-handlers.ts`
  - the remaining `localhost` mentions are fallback RP-ID/origin utility strings, not trusted-origin allow rules

### S2 Remaining Known Gaps

- iOS biometric-enrollment invalidation, iOS task-switcher overlay, and iOS clipboard-sensitive APIs were skipped because there is no iOS project in this workspace.
- macOS desktop biometric unlock still uses the current keychain CLI flow and does not have enrollment-bound invalidation semantics comparable to Android Keystore.
- Desktop recovery-secret and biometric factors do not yet have dedicated persisted retry counters/disablement parity matching the newer PIN/password paths.
- Mobile recovery-factor retry enforcement is not wired through an active bridge/UI flow yet, so only the underlying vault helpers were updated this round.
- JavaScript string values cannot be zeroized reliably once marshaled through V8/IPC. Buffer/typed-array clearing remains best-effort only.
- The Android keystore changes were validated through TypeScript/mobile tests, but not through a native Gradle assemble run in this session.

### S2 Files Changed

- `apps/desktop/src/main/ipc-handlers.ts`
- `apps/desktop/src/main/lock-store.ts`
- `apps/desktop/src/main/secure-store.ts`
- `apps/desktop/src/main/vault-v4.ts`
- `apps/desktop/src/main/diagnostics.dev.ts`
- `apps/desktop/src/main.ts`
- `apps/desktop/src/renderer.d.ts`
- `apps/desktop/src/__tests__/ipc-handlers.security.test.ts`
- `apps/desktop/src/__tests__/lock-store.test.ts`
- `apps/mobile/src/mobile-bridge.ts`
- `apps/mobile/src/mobile-bridge.test.ts`
- `apps/mobile/src/mobile-vault.ts`
- `apps/mobile/src/mobile-vault.test.ts`
- `apps/mobile/src/storage-adapter.ts`
- `apps/mobile/src/vault-key.ts`
- `apps/mobile/android/app/src/main/java/com/example/authenticator/VaultKeyPlugin.java`
- `packages/core/src/security-policy.ts`
- `packages/core/src/index.ts`
- `packages/core/dist/index.d.ts`
- `packages/core/dist/index.js`
- `packages/core/dist/security-policy.d.ts`
- `packages/core/dist/security-policy.js`
- `packages/ui/src/bridge.ts`
- `packages/ui/index.d.ts`
- `packages/ui/src/App.tsx`
- `packages/ui/src/components/PasswordSetupFields.tsx`
- `packages/ui/src/components/SafetySetupModal.tsx`
- `packages/ui/src/components/SafetySetupModal.test.tsx`
- `packages/ui/src/components/SecurityPicker.tsx`
- `packages/ui/src/components/LockScreen.tsx`
- `packages/ui/src/components/StepUpAuthModal.tsx`
- `packages/ui/src/utils/errors.ts`

## Track S3

### Status

| Sub-task | Status | Notes |
| --- | --- | --- |
| 1. Clear decrypted vault from memory on lock | Completed | Desktop hardened session now keeps the VDK and an optional plaintext cache separately. Lock and lifecycle paths clear only the decrypted payload cache, and payload reads re-decrypt from the persisted envelope on demand. |
| 2. Native mobile lifecycle invalidation | Completed | Mobile bootstrap now registers Capacitor `appStateChange` and `pause` listeners that call `lock()` and `closeSecuritySession()` when the app backgrounds. |
| 3. Remove plaintext recovery secret download | Completed | The shared recovery display no longer renders a save-to-file button, and the old plaintext `.txt` path has been removed from the UI source. |
| 4. Disable Android backup for vault data | Completed | Applied Option A by setting `android:allowBackup="false"` in the Android manifest. |
| 5. Consolidate dev diagnostic logs | Completed | Dev diagnostics now write only to `app.getPath("userData")/logs/dev-diagnostics.log`, redact shorter long-token patterns, and no-op when `app.isPackaged` is true. |

### S3 Validation Log

- Baseline before S3 edits: desktop `110/110`, mobile `7/7`
- After S3.1: desktop `112/112`, mobile `7/7`
- After S3.2: desktop `112/112`, mobile `9/9`
- After S3.3: desktop `112/112`, mobile `9/9`, UI `79/79`
- After S3.4: desktop `112/112`, mobile `9/9`, UI `79/79`
- After S3.5 and final verification: desktop `114/114`, mobile `9/9`, UI `79/79`, core `26/26`, backup `6/6`

### S3 Final Checks

- Full workspace suite: `pnpm test` passed across `backup`, `core`, `ui`, `desktop`, and `mobile`
- Desktop cache grep: `apps/desktop/src/main` now shows `clearDecryptedCache()` wired from `ipc-handlers.ts` lock/lifecycle paths and the split session cache in `secure-store.ts`
- Recovery file grep: zero matches in `packages/ui/src` for `saveRecovery|\.txt|download.*recovery|Save text file|showSaveButton|handleSaveText`
- Android backup grep: `apps/mobile/android/app/src/main/AndroidManifest.xml` now contains `android:allowBackup="false"`
- Dev diagnostics import audit: production source still goes through `src/main/diagnostics.ts` and the Vite alias, while `diagnostics.dev.ts` now also has an explicit `app.isPackaged` runtime no-op covered by tests
- Baseline vs current snapshots: textual diffs are expected because S3 added new tests, but all previously passing suites remained green throughout the track

### S3 Remaining Known Gaps

- The desktop VDK still remains in memory while the vault is unlocked so the app can re-decrypt on demand after a normal app lock.
- Mobile lifecycle hardening was implemented for the Android/Capacitor app in this workspace, but there is still no iOS project here to validate equivalent behavior there.
- The Android manifest hardening was validated through tests and source inspection, not through an Android device/emulator install in this session.

### S3 Files Changed

- `apps/desktop/src/main/secure-store.ts`
- `apps/desktop/src/main/ipc-handlers.ts`
- `apps/desktop/src/main/diagnostics.dev.ts`
- `apps/desktop/src/__tests__/vault-redesign.test.ts`
- `apps/desktop/src/__tests__/ipc-handlers.security.test.ts`
- `apps/desktop/src/__tests__/diagnostics.dev.test.ts`
- `apps/mobile/src/index.tsx`
- `apps/mobile/src/native-lifecycle.ts`
- `apps/mobile/src/native-lifecycle.test.ts`
- `apps/mobile/android/app/src/main/AndroidManifest.xml`
- `packages/ui/src/components/RecoverySecretDisplay.tsx`
- `packages/ui/src/components/SafetySetupModal.tsx`
