# STABILITY AUDIT PLAN

Scope: Electron desktop Authenticator release hardening. This plan is intentionally stability-first and avoids feature work unless required to prevent crashes, data loss, or severe usability regressions.

Guardrails:
- Do not change core TOTP generation/validation logic.
- Prefer minimal-risk, targeted fixes over broad refactors.
- Avoid heavy new dependencies unless clearly justified.
- Every bug fix must include a regression test where practical.

## A) System Inventory and Risk Surface

### Runtime architecture map
- Main process orchestration: `apps/desktop/src/main.ts`
- IPC API and policy boundaries: `apps/desktop/src/main/ipc-handlers.ts`
- Secure encrypted persistence and migrations: `apps/desktop/src/main/secure-store.ts`
- Lockout / credential backoff logic: `apps/desktop/src/main/lock-store.ts`
- Preload bridge contract: `apps/desktop/src/preload.ts`
- Renderer bootstrap + root error boundary: `apps/desktop/src/renderer.ts`
- UI interaction shell: `packages/ui/src/App.tsx`

### Critical user journeys
1. App launch -> secure-store initialization -> renderer boot.
2. Unlock flow (if lock enabled) -> account list visible.
3. Add/import account -> persist encrypted state -> restart recovery.
4. Copy code / view code lifecycle near TOTP boundary transitions.
5. Theme/motion/settings persistence across restarts.
6. Close/minimize/tray behavior and app re-open recovery.
7. Backup/export/import (if enabled) and corruption handling.

### High-impact failure classes
- Crash on startup or window creation.
- Data loss/corruption in encrypted store write/read/migration paths.
- Lock bypass or lock dead-end (cannot unlock despite valid state).
- Broken preload contract causing renderer hard failure.
- Background/tray behavior trapping app in unusable hidden state.

## B) Failure Modes and Prioritized Risk Register

Priority key: P0 (release blocker), P1 (must-fix before release), P2 (fix if low-risk/time).

| ID | Area | Failure mode | User impact | Priority | Detection confidence |
|---|---|---|---|---|---|
| R1 | Window lifecycle | `runInBackground` setting not respected on close; window always hides | User confusion, app appears closed but remains running/inconsistent behavior | P1 | Medium (code-level signal present) |
| R2 | Secure store | Corrupted payload or migration edge-case throws during load | Startup crash or data inaccessible | P0 | Medium |
| R3 | IPC boundary | Unexpected payload shape slips through and throws in main process | Action failure/crash in key flows | P1 | Medium-High |
| R4 | Lock flow | Lockout timing/state race after repeated attempts | User lockout dead-end or bypass risk | P0 | Medium |
| R5 | Renderer bootstrap | Preload API mismatch or missing channel contract | Blank window / non-functional UI | P1 | High |
| R6 | Import/export | Partial failure handling leaves inconsistent account state | Data loss or duplicated/broken accounts | P0 | Low-Medium |
| R7 | Tray/runtime integration | Native tray-only assumptions regress in packaged build | App inaccessible/reopen failures | P1 | Medium |
| R8 | Global errors | Unhandled exceptions not surfaced with actionable diagnostics | Hard-to-debug release regressions | P1 | High |

## C) Test Coverage Audit and Gaps

### Existing useful coverage
- Main security and IPC controls: `apps/desktop/src/__tests__/ipc-handlers.security.test.ts`
- Lock behavior: `apps/desktop/src/__tests__/lock-store.test.ts`
- Preload exposure contract: `apps/desktop/src/__tests__/preload.window-api.test.ts`
- Renderer runtime guardrails/CSP checks: `apps/desktop/src/__tests__/renderer-csp-config.test.ts`, `apps/desktop/src/__tests__/runtime-guards.test.ts`
- Store migration/theme migration: `apps/desktop/src/__tests__/secure-store.theme-migration.test.ts`
- Native tray config expectations: `apps/desktop/src/__tests__/tray-native-main-config.test.ts`
- UI behavior coverage (theme/motion/layout/actions): `packages/ui/src/*.test.tsx`

### Coverage gaps to close before release
1. **Smoke harness (`pnpm test:smoke`)**
   - Deterministic end-to-end smoke scenarios for dataset sizes: 0, 1, 5, 50 accounts.
   - Validate launch, unlock (if enabled), render list, copy action, close/reopen.
2. **Window lifecycle regression tests**
   - Explicit tests for `runInBackground=true/false` close behavior.
3. **Secure-store resilience tests**
   - Corrupt payload handling, fallback behavior, and non-destructive recovery.
4. **Crash guardrail tests**
   - Verify global `uncaughtException` / `unhandledRejection` hooks produce diagnostics and fail safely.
5. **Import/export failure-path tests**
   - Partial import rollback or safe-merge expectations and deterministic outcomes.

## D) Minimal-Risk Implementation Plan

Execution order is risk-first and test-first.

1. Add smoke harness scaffold and deterministic fixtures.
   - Create `test:smoke` script and fixture generator for 0/1/5/50 account states.
   - Keep harness isolated from production codepaths where possible.
2. Add high-value regression tests before behavior changes.
   - Start with window close/background behavior and secure-store corruption handling.
3. Implement targeted fixes only where failing tests identify defects.
   - Keep changes localized; avoid refactors not tied to a concrete failing scenario.
4. Run manual bug bash and record findings in `BUG_LOG.md`.
   - Reproduce, classify severity, fix P0/P1 items, and add regression tests.
5. Run packaging readiness validation.
   - Validate installer/package startup, lock flow, tray behavior, persistence, and restart behavior.

Change control:
- One defect class per small PR/commit where possible.
- For each fix: include reproduction note, root cause, test evidence.
- If a fix threatens core auth/totp logic, stop and redesign to avoid touching algorithm code.

## E) Exit Criteria, Deliverables, and Runbook

### Release hardening exit criteria
- No open P0 defects; all P1 defects resolved or explicitly waived with owner + rationale.
- `pnpm test:smoke` passes for 0/1/5/50 fixtures.
- Existing automated tests pass in desktop/ui/core packages.
- Packaged app launches cleanly and passes manual sanity checklist.
- No known data-loss or lock-bypass scenarios in tested flows.

### Required artifacts
- `STABILITY_AUDIT_PLAN.md` (this document)
- `BUG_LOG.md` (live during bug bash)
- `STABILITY_REPORT.md` (final outcomes, risks, waivers)
- `RELEASE_CHECKLIST.md` (operator checklist for packaging/release)

### Step-by-step execution runbook
1. Finalize this plan and lock scope.
2. Implement smoke harness + deterministic fixtures.
3. Add and run new regression tests; fix identified defects.
4. Execute manual bug bash and update `BUG_LOG.md` in real time.
5. Validate packaging readiness on installer/build artifacts.
6. Publish final report and release checklist.
