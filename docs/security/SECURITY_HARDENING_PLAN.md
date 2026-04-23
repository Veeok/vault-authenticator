# Security Hardening Plan

Date: 2026-03-05  
Repository: `authenticator` (Electron desktop + shared workspace)

## A) Inventory and root-cause confirmation

### A1) Confirmed affected IPC handlers and preload exposures

Confirmed in `apps/desktop/src/main/ipc-handlers.ts`:

- `lock:setMethod` at `apps/desktop/src/main/ipc-handlers.ts:1019`
- `lock:clearCredential` at `apps/desktop/src/main/ipc-handlers.ts:1065`
- `lock:resetAppLock` at `apps/desktop/src/main/ipc-handlers.ts:1106`

Confirmed preload exposure in `apps/desktop/src/preload.ts`:

- `lockAPI.setMethod` at `apps/desktop/src/preload.ts:64`
- `lockAPI.clearCredential` at `apps/desktop/src/preload.ts:71`
- `lockAPI.resetAppLock` at `apps/desktop/src/preload.ts:72`

Root cause for F-001:

- These handlers are reachable from renderer-exposed APIs.
- They currently do not enforce `ensureUnlocked()` and do not perform sender-origin/window validation.

### A2) UI call sites for affected IPC calls

Confirmed UI call sites:

- `lockApi.setMethod(...)` in Security settings flow:
  - `packages/ui/src/components/SecurityPicker.tsx:142`
  - `packages/ui/src/components/SecurityPicker.tsx:177`
- `lockApi.resetAppLock()` in lock-screen fallback menu:
  - `packages/ui/src/components/LockScreen.tsx:642`

Confirmed no active UI call site for `lockApi.clearCredential(...)` in current UI components (only interface/bridge exposure).

### A3) Current lock-state model confirmation

State and gating behavior confirmed:

- In-memory lock flag: `let locked = false` at `apps/desktop/src/main/ipc-handlers.ts:961`
- Lock trigger: `lockAppWindow(...)` sets `locked = true` and emits lock screen (`apps/desktop/src/main/ipc-handlers.ts:963-969`)
- Startup lock decision: `locked = shouldRequireLockOnStartup()` (`apps/desktop/src/main/ipc-handlers.ts:980`)
- Generic gate: `ensureUnlocked()` (`apps/desktop/src/main/ipc-handlers.ts:887-893`)
  - If app is locked and a configured credential lock exists, sensitive ops fail with `E_LOCKED`.
  - If lock method is not configured (first-run/no credential), `ensureUnlocked()` returns without blocking.

First-run/no-credential state is therefore already representable and can be used as a safe exception path for initial setup.

## B) CSP feasibility matrix (Vite-compatible, environment-aware)

### B1) Renderer load mode confirmation

From `apps/desktop/src/main.ts`:

- DEV: `win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)` at `apps/desktop/src/main.ts:297`
- PROD: `win.loadFile(...)` (file scheme) at `apps/desktop/src/main.ts:299`

### B2) Chosen CSP delivery strategy

Given current load scheme:

- **DEV**: inject CSP header via `session.defaultSession.webRequest.onHeadersReceived` in `apps/desktop/src/main.ts`.
  - Scope to renderer document responses from the dev server origin.
  - Keep HMR-compatible allowances.
- **PROD** (`file://`): inject CSP meta tag at build time via Vite renderer config plugin in `apps/desktop/vite.renderer.config.ts`.
  - Do not place CSP meta directly in source `apps/desktop/index.html` to avoid impacting dev HMR.

### B3) Target CSP policies

DEV CSP target (HMR-compatible):

- `default-src 'self'`
- `script-src 'self' 'unsafe-eval' http://localhost:* http://127.0.0.1:*`
- `style-src 'self' 'unsafe-inline'`
- `img-src 'self' data: blob:`
- `font-src 'self' data:`
- `connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* wss://localhost:* wss://127.0.0.1:*`
- `object-src 'none'; base-uri 'none'; frame-ancestors 'none'`

PROD CSP target (strict):

- `default-src 'self'`
- `script-src 'self'`
- `style-src 'self'` (add `'unsafe-inline'` only if build requires it)
- `img-src 'self' data:`
- `font-src 'self' data:`
- `connect-src 'self'`
- `object-src 'none'; base-uri 'none'; frame-ancestors 'none'`

### B4) Exact implementation targets

- `apps/desktop/src/main.ts`
  - add DEV-only CSP header injection helper using `onHeadersReceived`
  - merge response headers with:
    - `responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [cspString] }`
- `apps/desktop/vite.renderer.config.ts`
  - add build-only transform plugin to inject prod CSP meta into built index HTML
- `apps/desktop/index.html`
  - keep without hardcoded CSP meta (dev-safe)

## C) PIN entropy and migration plan

### C1) Current policy confirmation

Current acceptance of 4 or 6 digit PIN is confirmed in:

- `apps/desktop/src/main/ipc-handlers.ts:379-387` (`validatePin`)
- `apps/desktop/src/main/lock-store.ts:73-79` (`normalizePin`)
- Security UI currently offers both 4 and 6 PIN options:
  - `packages/ui/src/components/SecurityPicker.tsx:538-550`

### C2) Migration strategy (non-breaking)

Policy to implement:

- Existing 4-digit PIN users continue to unlock normally (no lockout/migration break).
- New PIN setups require 6 digits by default.
- Legacy 4-digit users get in-app non-blocking upgrade guidance in Security settings.

Implementation design:

- Enforce minimum 6-digit for **new pin credential creation** in lock credential creation path (desktop main/lock store path).
- Keep verification path compatible with existing 4-digit credentials.
- UI hardening:
  - Security settings should show 6-digit PIN as recommended default.
  - Hide or de-emphasize new 4-digit setup path; show legacy warning where applicable.

### C3) Lockout/backoff reset bypass prevention linkage

- Backoff exists in `apps/desktop/src/main/lock-store.ts:197-200` and `apps/desktop/src/main/lock-store.ts:214-241`.
- F-001 hardening will block `lock:resetAppLock` (and related lock-admin calls) while locked with configured credentials, preventing lockout bypass via reset path.

## D) Supply-chain remediation plan

### D1) Audit commands (captured)

Commands run:

- `pnpm audit --audit-level low`
- `pnpm audit --json`
- `pnpm -r why tar`
- `pnpm -r why serialize-javascript`
- `pnpm -r why esbuild`
- `pnpm -r why tmp`
- `pnpm -r why @tootallnate/once`
- `pnpm -r why elliptic`

Current baseline from `pnpm audit --audit-level low`:

- Total: 11 vulnerabilities
- Severity: 7 high, 1 moderate, 3 low

### D2) Classification and remediation intent

Findings (current):

- High: `tar` advisories (desktop forge/rebuild chain, plus mobile `@capacitor/cli` path)
- High: `serialize-javascript`
- Moderate: `esbuild`
- Low: `tmp`, `elliptic`, `@tootallnate/once`

Shipped/runtime consideration:

- Most paths are build/dev toolchain related.
- Because packager config currently sets `prune: false` (`apps/desktop/forge.config.ts:11`), dev/tooling dependencies may still be present in packaged output, so they are treated as hardening-relevant.

Least-risk remediation sequence:

1. Update stale direct toolchain dep in desktop app:
   - `@electron-addons/electron-forge-maker-nsis` to current forge-aligned series (same major line used by other forge deps where possible).
2. Add targeted `pnpm.overrides` in root `package.json` for vulnerable transitives where feasible:
   - `serialize-javascript` -> patched
   - `@tootallnate/once` -> patched
   - `tmp` -> patched
   - `tar` -> patched line where compatibility allows
   - `esbuild` -> patched line where compatibility allows
3. Reinstall/lockfile update and run test/build checks.
4. If any high severity cannot be removed without risky major breakage, document explicit rationale and containment.

### D3) Success target

- Eliminate high-severity findings where feasible without destabilizing the app/toolchain.
- Produce before/after comparison and residual risk rationale in `SECURITY_DEPENDENCY_REMEDIATION.md`.

## E) Validation and rollback plan

## E1) Phase-by-phase validation commands

After IPC hardening + PIN policy updates:

- `pnpm --filter desktop exec tsc --noEmit`
- `pnpm --filter desktop test`

After CSP changes:

- `pnpm --filter desktop exec tsc --noEmit`
- `pnpm --filter desktop test`
- Manual DEV smoke: `pnpm --filter desktop start` and verify HMR/no CSP websocket errors.

After dependency remediation:

- `pnpm install`
- `pnpm audit --audit-level low`
- `pnpm --filter @authenticator/ui exec tsc --noEmit`
- `pnpm --filter desktop exec tsc --noEmit`
- `pnpm --filter @authenticator/ui test`
- `pnpm --filter desktop test`
- Manual smoke: `pnpm --filter desktop start`

## E2) Manual security checks

- While locked with configured credential:
  - attempt method change -> blocked
  - attempt credential clear -> blocked
  - attempt reset lock -> blocked
- First-run/no-credential path:
  - initial lock setup still possible
- PIN policy:
  - new setup rejects 4-digit by default
  - existing 4-digit credential still unlocks
- CSP:
  - DEV HMR still functional
  - PROD build contains strict CSP and app still loads
- Dependency:
  - compare before/after `pnpm audit` counts in remediation doc

## E3) Rollback strategy

Implement in isolated commits (one major fix area per commit):

1. IPC gating + sender validation
2. CSP (DEV header injection + PROD build-meta injection)
3. PIN policy + migration UX
4. Dependency remediation + `SECURITY_DEPENDENCY_REMEDIATION.md`

If regressions occur, revert the affected commit only (surgical rollback), keep other hardening commits intact.

## Exact files targeted in implementation

- IPC hardening:
  - `apps/desktop/src/main/ipc-handlers.ts`
  - `apps/desktop/src/preload.ts` (if minimal exposure adjustment needed)
  - `apps/desktop/src/renderer.d.ts` (if preload surface contract changes)
  - `apps/desktop/src/__tests__/...` (new/updated desktop tests)
- CSP:
  - `apps/desktop/src/main.ts`
  - `apps/desktop/vite.renderer.config.ts`
  - `apps/desktop/src/__tests__/...` (CSP assertions)
- PIN entropy:
  - `apps/desktop/src/main/lock-store.ts`
  - `apps/desktop/src/main/ipc-handlers.ts`
  - `packages/ui/src/components/SecurityPicker.tsx`
  - `packages/ui/src/utils/errors.ts` (copy alignment, if needed)
  - `apps/desktop/src/__tests__/lock-store.test.ts`
  - `packages/ui/src/**/*.test.tsx` (if UI policy tests added)
- Supply chain:
  - `package.json` (root overrides)
  - `apps/desktop/package.json` (direct dependency bumps if needed)
  - `pnpm-lock.yaml`
  - `SECURITY_DEPENDENCY_REMEDIATION.md`
