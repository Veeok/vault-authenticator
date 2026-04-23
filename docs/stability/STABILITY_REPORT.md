# STABILITY REPORT

## Scope and outcome

Release hardening focused on crash prevention, data safety, and packaging readiness for the desktop app. Scope stayed stability-only (no TOTP algorithm changes, no feature expansion).

Result: release candidate is stable for packaging with no open P0/P1 defects.

## What was changed

1. **Planning and risk audit**
   - Added `STABILITY_AUDIT_PLAN.md` with inventory, prioritized risks, coverage gaps, implementation runbook, and exit criteria.

2. **Smoke harness and deterministic fixtures**
   - Added root smoke entrypoint: `package.json` -> `test:smoke`.
   - Added desktop smoke entrypoint: `apps/desktop/package.json` -> `test:smoke`.
   - Added deterministic fixture test for account-set sizes 0/1/5/50: `apps/desktop/src/__tests__/smoke-fixtures.test.ts`.

3. **Regression fix and test (window close policy)**
   - Fixed close behavior so hide-on-close respects `runInBackground` and quit flow: `apps/desktop/src/main.ts`, `apps/desktop/src/main/window-lifecycle.ts`.
   - Added regression tests: `apps/desktop/src/__tests__/window-lifecycle.test.ts`.

4. **Crash/error guardrails and tests**
   - Extracted and centralized process/app crash logging registration: `apps/desktop/src/main/crash-guards.ts`.
   - Integrated guard registration in main process startup: `apps/desktop/src/main.ts`.
   - Added tests for normalization and logging hooks: `apps/desktop/src/__tests__/crash-guards.test.ts`.

5. **Secure-store resilience tests**
   - Added corruption fallback and recovery tests: `apps/desktop/src/__tests__/secure-store.resilience.test.ts`.

6. **Version and packaging**
   - Bumped desktop app version to `1.4.7`: `apps/desktop/package.json`.
   - Corrected product naming to "Vault Authenticator" across desktop/mobile/ui surfaces and packaging metadata.
   - Added startup migration to carry user data from the previous misspelled userData folder name to the corrected userData folder name.
   - Fixed installer executable-name mismatch by aligning executable metadata to `Vault Authenticator.exe` in `apps/desktop/forge.config.ts`.
   - Fixed packaged native dependency crash by copying `@node-rs/argon2` runtime packages during `packageAfterCopy` and enabling auto-unpack natives in `apps/desktop/forge.config.ts`.
   - Fixed packaged workspace dependency resolution by bundling `@authenticator/core` into main build and removing runtime `require("@authenticator/core")` fallback path in `apps/desktop/src/main/ipc-handlers.ts` and `apps/desktop/vite.main.config.ts`.
   - Fixed startup `E_INTERNAL` banner caused by malformed stored accounts by normalizing runtime account records for `totp:list` and `totp:codes` and isolating per-account code-generation failures in `apps/desktop/src/main/ipc-handlers.ts`.
   - Fixed locked-startup race causing `E_INTERNAL` banner by delaying account/code background fetch until security state is initialized (`packages/ui/src/App.tsx`), and hardened IPC error payload transfer in preload (`apps/desktop/src/preload.ts`).
   - Built package and installer artifacts.

## Validation evidence

- `pnpm test:smoke` -> passed (`13` tests, desktop smoke suite).
- `pnpm --filter desktop test` -> passed (`46` tests).
- `pnpm test` -> passed across workspace:
  - core: `26` tests
  - backup: `2` tests
  - ui: `50` tests
  - mobile: `3` tests
  - desktop: `46` tests
- `pnpm --filter desktop package` -> succeeded.
- `pnpm --filter desktop make` -> succeeded.

Artifacts:
- `apps/desktop/out/make/nsis/x64/Vault Authenticator Setup 1.4.7.exe`
- `apps/desktop/out/make/nsis/x64/Vault Authenticator Setup 1.4.7.exe.blockmap`
- `apps/desktop/out/make/zip/win32/x64/Vault Authenticator-win32-x64-1.4.7.zip`

## Risk status

- P0 open: **0**
- P1 open: **0**
- P2 open: **1** (installer icon metadata warning; see `BUG_LOG.md`)

## Exit criteria check

- No open P0 defects: **PASS**
- No open P1 defects: **PASS**
- `pnpm test:smoke` for 0/1/5/50 fixtures: **PASS**
- Existing automated tests pass: **PASS**
- Packaged/installer artifacts generated: **PASS**
- Known data-loss/lock-bypass regressions in tested flows: **NONE FOUND**

## Recommendation

Proceed with release candidate `1.4.7` with one non-blocking packaging polish item tracked (installer icon metadata).
