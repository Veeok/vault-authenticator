## Track A

No Track A section was present in the workspace during this Track C pass.

## Track C — Cross-Feature Logic Mismatches

### Feature Interaction Map

| Feature | Files / Entry Points | Shared State / Resource Touched | Events Emitted | Events Consumed |
|---------|----------------------|---------------------------------|----------------|-----------------|
| Lock / Unlock cycle | `apps/desktop/src/main/ipc-handlers.ts`, `apps/desktop/src/main/lock-store.ts`, `packages/ui/src/App.tsx`, `packages/ui/src/components/LockScreen.tsx` | main `locked`, credential lock state, passkey state, renderer lock overlay state | `auth:showLockScreen` | `lock:lock`, `lock:verify`, `lock:promptBiometric`, `passkey:verifyAssertion` |
| Auto-lock (idle timer) | `apps/desktop/src/main.ts` | `idleCheckTimer`, `settings.autoLockSeconds`, main `locked` | None | `powerMonitor.getSystemIdleTime()` interval |
| Lock-on-focus-loss | `apps/desktop/src/main.ts` | `settings.lockOnFocusLoss`, main `locked`, main window focus state | None | `BrowserWindow` `blur` |
| Clipboard auto-clear | `packages/ui/src/App.tsx`, `packages/ui/src/components/AccountRow.tsx`, `apps/desktop/src/preload.ts`, `apps/desktop/src/main/ipc-handlers.ts` | renderer clear timers, `lastCopiedCodeRef`, OS clipboard | None | copy callbacks, `clipboard:clear`, tray `clear-clipboard` command |
| Privacy screen | `packages/ui/src/App.tsx`, `apps/desktop/src/main.ts`, `apps/desktop/src/main/ipc-handlers.ts` | `settings.privacyScreen`, content protection flag, main `locked` | `lock:lock` IPC from renderer | `document.visibilitychange` |
| Screen QR scan | `packages/ui/src/App.tsx`, `packages/ui/src/components/AddModal.tsx`, `apps/desktop/src/main/ipc-handlers.ts`, `apps/desktop/src/main/screen-qr.ts` | main window visibility/focus, scan overlay windows, always-on-top z-order | None | tray/app command `scan-from-screen`, `totp:scanFromScreen` |
| Backup import/export | `packages/ui/src/App.tsx`, `apps/desktop/src/main/ipc-handlers.ts`, `packages/backup/src/index.ts` | account store, step-up auth state, file dialogs | None | `backup:export`, `backup:import` |
| Tray command bus | `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `packages/ui/src/App.tsx` | main window visibility, persisted settings, lock gating, clipboard clear state | `window:appCommand`, `window:alwaysOnTopChanged` | tray click/right-click/menu actions |
| Always-on-top | `apps/desktop/src/main.ts`, `apps/desktop/src/preload.ts`, `packages/ui/src/App.tsx` | `settings.alwaysOnTop`, `BrowserWindow` top-most flag, scan overlay z-order | `window:alwaysOnTopChanged` | tray toggle, `window:setAlwaysOnTop` |
| TOTP code generation | `apps/desktop/src/main/ipc-handlers.ts`, `packages/ui/src/App.tsx`, `packages/ui/src/components/AccountRow.tsx` | account store, renderer `codes` cache, 1s polling interval, background pause state | None | `totp:codes`, 1s interval |
| Settings mutations | `packages/ui/src/App.tsx`, `apps/desktop/src/main/ipc-handlers.ts`, `apps/desktop/src/main.ts`, `apps/desktop/src/main/secure-store.ts` | persisted `AppSettings`, auth-ui mirror, runtime window flags | `window:alwaysOnTopChanged` | settings form changes, tray toggles |
| Passkey unlock | `apps/desktop/src/main/ipc-handlers.ts`, `apps/desktop/src/main/passkey-store.ts`, `packages/ui/src/App.tsx`, `packages/ui/src/components/StepUpAuthModal.tsx` | `passkeyChallenges`, `locked`, quick unlock config, lock methods config | None | passkey challenge/assertion flow |
| Startup hidden | `apps/desktop/src/main.ts` | login item state, startup settings, main window visibility | `window:backgroundedChanged` on load | OS login item state |
| Run-in-background | `apps/desktop/src/main.ts`, `apps/desktop/src/main/window-lifecycle.ts`, `packages/ui/src/App.tsx` | `settings.runInBackground`, close/hide ownership, renderer lifetime | None | main window `close` |
| Hardened vault / locked startup | `apps/desktop/src/main/secure-store.ts`, `apps/desktop/src/main/ipc-handlers.ts`, `apps/desktop/src/main.ts`, `packages/ui/src/App.tsx` | `hardenedSession`, fallback settings load path, main `locked` | `auth:showLockScreen` | hardened password unlock, startup settings reads |

Shared resources touched by 2+ features: persisted `AppSettings`, main `locked`, main window focus/visibility, `BrowserWindow` always-on-top state, scan overlay windows, OS clipboard, renderer clipboard timers, account store, renderer TOTP polling interval, hardened-session startup fallback.

### Mismatch Findings

| ID | Features Involved | Shared Resource | Concrete Sequence | Evidence | Severity | Fix or Skip |
|----|-------------------|-----------------|-------------------|----------|----------|-------------|
| C-001 | Tray command bus, Settings mutations | Persisted `AppSettings` object | Tray `toggle-run-in-background` or `toggle-start-with-system` flips a setting in main. The renderer keeps its older `settings` snapshot. A later renderer save of an unrelated field sends a full stale `AppSettings` payload and overwrites the tray change. | `apps/desktop/src/main.ts:689-713`, `packages/ui/src/App.tsx:451`, `packages/ui/src/App.tsx:1849-1889` | MINIMAL | Fixed - renderer full-object saves are now rebased onto the latest persisted settings before write |
| C-002 | Hardened vault / locked startup, Startup hidden, Run-in-background, Always-on-top, Privacy screen, Auto-lock | Locked-startup settings load path | In hardened mode before password unlock, `loadSettings()` returns `DEFAULT_SETTINGS` plus theme-only auth-ui fields. Startup runtime setup then applies those defaults for login item behavior, privacy/content protection, always-on-top, close policy, and idle auto-lock until unlock happens, so pre-unlock behavior can diverge from the user's persisted settings. | `apps/desktop/src/main/secure-store.ts:1428-1434`, `apps/desktop/src/main.ts:529-532`, `apps/desktop/src/main.ts:874-945`, `apps/desktop/src/main.ts:1117-1135` | MEDIUM | Superseded - see `H-001` for the heavier architecture-level root cause |
| C-003 | Screen QR scan, Lock / Unlock cycle, Always-on-top | Overlay `BrowserWindow` ownership and top-most z-order | Screen scan backgrounds the main window and can make the scan parent undefined before starting selection. The scan flow then creates always-on-top overlay windows and waits for the overlay script to resolve. Concurrent lock triggers only lock the main window; they do not cancel the scan or dispose overlays. Cleanup happens only when the scan prompt returns, so overlays can outlive the owning flow and stay above the locked main window. | `apps/desktop/src/main/ipc-handlers.ts:1650-1764`, `apps/desktop/src/main/ipc-handlers.ts:2678-2705`, `apps/desktop/src/main/screen-qr.ts:249-377`, `apps/desktop/src/main.ts:1123-1128` | MEDIUM | Superseded - see `H-004` for the heavier window-ownership root cause |
| C-004 | Clipboard auto-clear, Run-in-background, Window close lifecycle | Clipboard clear timers vs renderer lifetime | Copying a code arms renderer-only auto-clear timers in both `App` and `AccountRow`. If the app then exits instead of hiding on close, unmount cleanup clears those timers. There is no main-process timer to continue the safety guarantee, so copied codes can remain in the clipboard indefinitely after renderer teardown. | `packages/ui/src/App.tsx:678-688`, `packages/ui/src/App.tsx:1290-1317`, `packages/ui/src/components/AccountRow.tsx:108-165`, `apps/desktop/src/main/ipc-handlers.ts:2645-2670`, `apps/desktop/src/main.ts:937-945`, `apps/desktop/src/main/window-lifecycle.ts:6-10` | MEDIUM | Skip - durable clipboard safety across teardown needs main-process ownership of the clear schedule |
| H-001 | Hardened vault / locked startup, Startup hidden, Run-in-background, Start-with-system, Always-on-top, Privacy screen, Auto-lock | Locked-startup settings load path and OS/runtime state | App startup calls `loadSettings()` before the hardened vault is unlocked. In locked hardened mode that returns `DEFAULT_SETTINGS` plus auth-ui theme fields only. Main then applies those fallback values to login-item state, window visibility policy, content protection, always-on-top, and idle-lock setup. Unlock later clears `locked`, but there is no full runtime reapply path that restores the real persisted settings. | `apps/desktop/src/main/secure-store.ts:1428-1434`, `apps/desktop/src/main.ts:207-214`, `apps/desktop/src/main.ts:379-384`, `apps/desktop/src/main.ts:874-945`, `apps/desktop/src/main.ts:1117-1135`, `apps/desktop/src/main/ipc-handlers.ts:1985-1991` | HEAVY | Skip - architecture-level; needs a designed unlock-side runtime reapply contract before patching |
| H-002 | Lock / Unlock cycle, Privacy screen, renderer lock shell | Lock state vs renderer-owned lock UI | A lock trigger flips main `locked = true` immediately, but the actual lock screen is shown only after `auth:showLockScreen` reaches the renderer and React updates `locked` state there. The vault content therefore remains renderer-owned and asynchronous even though main already considers the app locked. | `apps/desktop/src/main/ipc-handlers.ts:1618-1620`, `apps/desktop/src/main/ipc-handlers.ts:1766-1781`, `apps/desktop/src/main.ts:649-650`, `packages/ui/src/App.tsx:434-435`, `packages/ui/src/App.tsx:1095-1104`, `packages/ui/src/App.tsx:2677-2772` | HEAVY | Skip - renderer/main lock ownership would need redesign; note only: a possible partial mitigation is earlier `setContentProtection(true)` in the lock path, but this is not being patched |
| H-003 | Backup export/import, Lock-on-focus-loss, Auto-lock, manual/power lock | Main `locked` state across awaited native dialogs | The vulnerable seam was the await gap after each handler's initial unlock gate and before account data was read or written. The code now performs a second `ensureUnlockedFromTrustedSender(evt)` immediately after each dialog resolves, so a lock fired during the dialog aborts the operation before any account read/write resumes. | `apps/desktop/src/main/ipc-handlers.ts:1551-1554`, `apps/desktop/src/main/ipc-handlers.ts:1766-1781`, `apps/desktop/src/main/ipc-handlers.ts:2811-2823`, `apps/desktop/src/main/ipc-handlers.ts:2833-2845`, `apps/desktop/src/main.ts:1011-1014` | HEAVY | Fixed - post-await lock revalidation added in both backup handlers |
| H-004 | Screen QR scan, Lock / Unlock cycle, Always-on-top | Overlay window ownership across lock | Screen scan can background the main window before selection, then create always-on-top overlays that are owned only inside the scan prompt flow. Lock transitions operate on the main window and do not own or cancel those overlays, so the overlays can outlive the initiating flow and remain above the locked app until the scan prompt resolves. | `apps/desktop/src/main/ipc-handlers.ts:1650-1764`, `apps/desktop/src/main/ipc-handlers.ts:2678-2705`, `apps/desktop/src/main/screen-qr.ts:249-377`, `apps/desktop/src/main.ts:1011-1014` | HEAVY | Skip - requires shared cancellation/ownership between lock lifecycle and scan overlay lifecycle |

### Notes

- C-001 patch is intentionally narrow: `packages/ui/src/App.tsx` now merges renderer-side setting diffs onto the latest persisted settings before calling `updateSettings`, which is sufficient for the proven destructive seam because it preserves tray-side mutations without changing the IPC contract.
- C-001 files touched: `packages/ui/src/App.tsx`, `packages/ui/src/App.settings-sync.test.tsx`.
- C-001 test added: `packages/ui/src/App.settings-sync.test.tsx` proves a tray-side `runInBackground` mutation survives a later renderer-side save of `clipboardSafetyEnabled`.
- H-003 patch is intentionally narrow: `apps/desktop/src/main/ipc-handlers.ts` now re-runs `ensureUnlockedFromTrustedSender(evt)` immediately after each native backup dialog resolves, which is sufficient because it closes the only proven post-await lock gap before any account data is read or written.
- H-003 files touched: `apps/desktop/src/main/ipc-handlers.ts`, `apps/desktop/src/__tests__/ipc-handlers.security.test.ts`.
- H-003 tests added: `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` now proves both export and import abort with `E_LOCKED` if the app locks before the native dialog returns.
- `C-002` is retained for audit history but is superseded by `H-001`, which captures the broader startup/runtime contract failure.
- `C-003` is retained for audit history but is superseded by `H-004`, which captures the broader overlay ownership failure.
- Unproven: privacy-screen visibility locking and focus-loss locking can both target the same lock path, but I could not prove a user-visible breakage from code alone because the current lock side effects are mostly idempotent.
- Unproven: the scan overlay likely steals focus and may self-trigger focus-loss locking during some scan paths, but Electron's exact window-focus ordering is not proven by the static code alone.
- Duplicates already covered by Track A: none found in-code, but there was no preexisting Track A report section in the workspace to cross-reference.

## Track B

No Track B section was present in the workspace during this Track C pass.

## Track D — Security Enforcement Hardening (Revised)

### Fixed Findings

| ID | Status | Evidence | Tests |
|----|--------|----------|-------|
| D-1 | Fixed | `apps/desktop/src/main/ipc-handlers.ts:1933-1953` now requires `requireStepUpAuth(_evt)` before credential replacement, including hardened-password rotation. | `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` — `requires step-up auth for lock:setCredential while unlocked`; `allows credential replacement after successful step-up verification` |
| D-2 | Fixed | `apps/desktop/src/main/ipc-handlers.ts:1857-1908`, `1911-1931` now require `requireStepUpAuth(_evt)` before `lock:setMethodsConfig` and `lock:setMethod`. | `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` — `requires step-up auth for lock:setMethod while unlocked`; `requires step-up auth for lock:setMethodsConfig while unlocked`; `allows lock method changes after successful step-up verification` |
| D-3 | Fixed | `apps/desktop/src/main/ipc-handlers.ts:2627-2669` now requires step-up for `backup:import` only when `mode === "replace"`; merge mode remains unchanged. | `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` — `requires step-up auth for backup import replace mode`; `allows backup import merge mode without step-up`; `allows backup import replace mode after successful step-up verification` |
| D-4 | Fixed | `packages/ui/src/App.tsx:542-550`, `1120-1123`, `1456-1460`, `2154-2157` now clear generated backup codes on lock events and all dialog-close paths. | `packages/ui/src/App.backup-codes-lifecycle.test.tsx` — `clears generated backup codes when the dialog closes`; `clears generated backup codes when the app is locked` |
| D-5 | Fixed | Legacy `auth:*` registrations were removed from `apps/desktop/src/main/ipc-handlers.ts`; the register block now transitions directly from the passkey handlers to `vault:getProtectionStatus` at `apps/desktop/src/main/ipc-handlers.ts:2218-2227`. | `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` — `does not register unused legacy auth channels` |
| D-6 | Fixed | `apps/desktop/src/main/ipc-handlers.ts:1374-1394` now trusts only localhost dev origins or the exact packaged renderer file URL; `apps/desktop/src/main.ts:62-68`, `965-971` applies the same exact-file allowlist to navigation. | `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` — `rejects file senders outside the packaged renderer entry path`; `accepts the exact packaged renderer file url`; `keeps localhost dev origins trusted` |
| D-7 | Fixed | `packages/backup/src/index.ts:59-63`, `99-117`, `200-250` introduces backup format `version: 3`, rejects leading/trailing spaces on export, and trims only legacy `v1`/`v2` imports; desktop backup IPC validation was aligned in `apps/desktop/src/main/ipc-handlers.ts:396-471`, `2605-2634`. | `packages/backup/src/__tests__/backup.test.ts` — `rejects export passphrases with leading or trailing whitespace`; `still decrypts legacy v2 Argon2 backups created with trimmed passphrases` |
| D-8 | Fixed | `apps/mobile/src/storage-adapter.ts:5-98` persists PIN lockout state; `apps/mobile/src/mobile-bridge.ts:88-99`, `242-276`, `548-695`, `752-756` now enforces exponential lockout, returns real `getLockState()`, and clears state on successful unlock paths. | `apps/mobile/src/mobile-bridge.test.ts` — `persists PIN lockout state and reports active cooldowns`; `clears persisted PIN lockout state after a successful unlock` |

## Track E — Security Session Model, Policy Enforcement, Passkey Ceremony Verification, and Native Privacy

### Fixed Findings

| ID | Status | Evidence | Tests |
|----|--------|----------|-------|
| E-1 / F-10 | Fixed | `apps/mobile/android/app/src/main/java/com/example/authenticator/MainActivity.java:8-21` now sets `FLAG_SECURE` unconditionally during `onCreate`. | Manual verification required: Android recents thumbnail should be blank and foreground `adb shell screencap` should return a black frame. |
| E-2 / F-6 | Fixed | `apps/desktop/src/main/ipc-handlers.ts:2356-2365` now enforces quick-unlock policy in main before biometric unlock proceeds. | `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` — `denies biometric unlock when quick-unlock policy disables it`; `allows biometric unlock when quick-unlock policy enables it` |
| E-3 / F-7 | Fixed | `apps/desktop/src/main/ipc-handlers.ts:1884-1956`, `2194-2270`, `2414-2421`, `2446-2597`, `2978-2984` replaced destructive-action step-up reuse with an explicit renderer-scoped security session; `apps/desktop/src/main.ts:16, 914-915` attaches lifecycle invalidation to the main window; `packages/ui/src/App.tsx:1270-1333, 1446-1555, 2313-2355, 3186, 3503` and `packages/ui/src/components/SecurityPicker.tsx:288-310, 353-533, 607-798` now open sessions before destructive flows and close them on modal dismiss paths. | `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` — `requires step-up verification before opening a security session`; `expires security sessions after 90 seconds`; `closes security sessions explicitly`; `keeps security sessions scoped to the originating renderer`; `allows multiple destructive actions inside one open security session`; `invalidates security sessions when the app is locked`; `invalidates security sessions on renderer navigation, reload, crash, destroy, and window close` |
| E-4 / SR-F2 | Fixed | `packages/ui/src/utils/passkey.ts:46-90` now sends full registration ceremony data; `apps/desktop/src/main/ipc-handlers.ts:971-1229, 1488-1538, 2469-2491` now verifies registration type, challenge, origin, rpIdHash, and extracts the public key from verified authenticator data before storage. | `apps/desktop/src/__tests__/ipc-handlers.security.test.ts` — `allows passkey management after opening a security session`; `rejects passkey registration when the challenge does not match`; `rejects passkey registration when the client data type is wrong`; `rejects passkey registration when the origin is wrong`; `rejects passkey registration when the rpIdHash is wrong` |

### Migration Note

- Passkeys enrolled before Track E were stored without registration ceremony verification. They remain functional for unlock. Users should be encouraged to re-enroll at their convenience. A future pass may add an `enrolledAt` version flag to distinguish ceremony-verified vs. legacy enrollments and surface a re-enrollment prompt in the UI.

### Persistent Stopgap Note

- The current `file://` trusted sender restriction (Track D) and Track E passkey origin checks both rely on `file://` as the packaged renderer origin. This is a documented stopgap. Electron recommends migrating the renderer to a custom protocol such as `app://`; when that happens, the trusted sender check and expected WebAuthn origin should both move to the custom protocol URL/origin.

## Track F — Desktop Vault Redesign and Mobile At-Rest Encryption

### Fixed Findings

| ID | Status | Evidence | Tests |
|----|--------|----------|-------|
| SR-F1 / T1-A | Fixed | `apps/desktop/src/main/secure-store.ts` now uses a single vault-v4 envelope and removes live `safeStorage`/standard-mode writes; legacy `blob` and old hardened envelopes are migration-only sources. `apps/desktop/src/main/ipc-handlers.ts` now treats password as the cold-start fallback while allowing post-unlock convenience methods, and `apps/desktop/src/main.ts` gates protected runtime settings until unlock. | `apps/desktop/src/__tests__/vault-redesign.test.ts` — `creates vault-v4 with password wrapping and reopens it after a cold start`; `migrates a legacy safeStorage vault with an existing password credential`; `requires password setup for a legacy vault that never had a password credential` |
| H-001 | Fixed | `apps/desktop/src/main.ts:883-925, 1023-1027, 1129-1149` now uses unlocked-only runtime settings and defers `setLoginItemSettings`, content protection, always-on-top, idle lock, and focus-loss lock behavior until the vault is unlocked. | `apps/desktop/src/__tests__/vault-redesign.test.ts` — `normalizes persisted settings after unlock and keeps auth UI metadata outside the locked vault` |
| F-4 / T2-A | Fixed | `apps/mobile/src/storage-adapter.ts` now stores a versioned mobile vault schema with encrypted payload + wrapped VDKs; `apps/mobile/src/mobile-vault.ts` implements the layered PIN+KSK primary path plus independent biometric/recovery wrapped VDKs; `apps/mobile/src/mobile-bridge.ts` now provisions and unlocks against the new schema. | `apps/mobile/src/mobile-vault.test.ts` — `unlocks with the correct PIN and fails closed when the keystore key is missing`; `rewraps only the PIN-derived VDK on PIN change`; `supports biometric and recovery alternative unwrap paths`; `apps/mobile/src/mobile-bridge.test.ts` — `creates a vault on first PIN setup and supports PIN lockout` |

### Migration Notes

- Desktop standard mode is removed. Existing `safeStorage` blobs and pre-Track-F hardened envelopes are migrated into vault-v4 on first successful password-backed unlock or password setup.
- Desktop uses password as the mandatory cold-start fallback. PIN, pattern, passkey, and post-unlock biometrics remain convenience/session controls only.
- Mobile legacy raw blobs migrate into the version 2 encrypted vault on first successful PIN-backed initialization or unlock.

### Future Items

| Item | Status | Note |
|------|--------|------|
| Windows Hello VDK integration | Future hardening | Desktop vault-v4 biometric wrapping is implemented for macOS only. Windows Hello requires a separate native module. |
| iOS Secure Enclave equivalent | Future hardening | Mobile vault-v2 currently targets Android Keystore. iOS Secure Enclave support should be added if iOS support is introduced later. |
| `file://` to `app://` renderer migration | Future hardening | Track D/E file origin restrictions remain a stopgap until the Electron renderer moves to a custom protocol. |
| Legacy passkey re-enrollment prompt | Future hardening | Passkeys enrolled before Track E still work, but the UI should eventually surface a re-enrollment prompt for legacy records. |
