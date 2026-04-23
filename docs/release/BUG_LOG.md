# BUG LOG

## Session
- Date: 2026-03-05
- Scope: Desktop stability hardening for release packaging

## Findings

| ID | Severity | Status | Area | Description | Evidence | Resolution |
|---|---|---|---|---|---|---|
| WIN-CLOSE-001 | P1 | Fixed | Window lifecycle | Window close always hid to tray even when `runInBackground` was disabled. | Code path in `apps/desktop/src/main.ts` close handler ignored settings. | Added `shouldHideOnWindowClose` policy and wired close handler to respect `runInBackground`; added regression test in `apps/desktop/src/__tests__/window-lifecycle.test.ts`. |
| PKG-SHORTCUT-002 | P1 | Fixed | Installer launch behavior | Installer and shortcuts looked for `Vault Authenticator.exe` while packaged app executable was `VaultAuthenticator.exe`, triggering "Missing Shortcut". | User-reported installer dialog and output package executable mismatch in `apps/desktop/out/Vault Authenticator-win32-x64`. | Aligned executable naming to `Vault Authenticator.exe` in `apps/desktop/forge.config.ts` and rebuilt installer (`1.4.3`). |
| PKG-NATIVE-003 | P0 | Fixed | Packaged runtime dependency | Packaged app crashed at startup: `Cannot find module '@node-rs/argon2'`. | User-reported main-process crash dialog from packaged executable. | Added forge `packageAfterCopy` hook to copy required argon2 packages into build path and enabled `@electron-forge/plugin-auto-unpack-natives`; rebuilt installer (`1.4.3`). |
| PKG-CORE-004 | P0 | Fixed | Packaged workspace dependency | Installed app crashed with `ENOENT` resolving `@authenticator/core` to a workspace path inside `app.asar`. | User-reported main-process crash dialog showing missing `packages/core` path under installed resources. | Replaced runtime `require("@authenticator/core")` with bundled import path and added main-build alias for core in `apps/desktop/vite.main.config.ts`; rebuilt installer (`1.4.4`). |
| IPC-STARTUP-005 | P1 | Fixed | Startup IPC resilience | App showed an `E_INTERNAL` error banner on startup when stored account data included malformed entries. | User-reported startup banner in renderer after launch. | Added runtime account normalization in `totp:list` and `totp:codes`, per-account code generation fault isolation, and IPC error diagnostics logging in `apps/desktop/src/main/ipc-handlers.ts`; added regression tests in `apps/desktop/src/__tests__/ipc-handlers.security.test.ts`; rebuilt installer (`1.4.5`). |
| UI-LOCKED-STARTUP-006 | P1 | Fixed | Locked startup sequencing | App showed `E_INTERNAL` banner at launch because UI requested `totp:list`/`totp:codes` before lock state initialization, resulting in `E_LOCKED` IPC failures. | User-provided debug output with `ipc handler failed` for `totp:list` and `totp:codes` (`code: E_LOCKED`) while banner showed `E_INTERNAL`. | Gated account/codes background fetches on `securityReady && !locked` in `packages/ui/src/App.tsx`, adjusted preload error payload shape in `apps/desktop/src/preload.ts`, and added regression test in `packages/ui/src/App.header-menu.test.tsx`; rebuilt installer (`1.4.6`). |
| PKG-ICON-001 | P2 | Open (waived) | Packaging cosmetics | NSIS build reported default Electron icon for installer metadata. | `pnpm --filter desktop make` output: "default Electron icon is used reason=application icon is not set". | Non-blocking for runtime stability. Track as packaging polish follow-up by adding explicit NSIS installer icon options in forge maker config. |

## Notes
- No startup crash, lock-flow break, or secure-store data loss regressions were observed in automated coverage added this session.
- P0: 0 open.
- P1: 0 open.
