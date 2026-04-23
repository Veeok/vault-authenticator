# Security Audit Report

Date: 2026-03-05  
Target: Electron desktop Authenticator monorepo (`authenticator` workspace)

## Executive assessment

Short answer to "can a friend crack this quickly?": **usually no for offline file theft; potentially yes with stronger local access conditions**.

- **Local attacker with only copied app files**: not a quick crack based on current evidence. Secrets are stored as an encrypted blob using OS-backed Electron `safeStorage` (`apps/desktop/src/main/secure-store.ts:354`, `apps/desktop/src/main/secure-store.ts:437`) and observed at rest as ciphertext (`C:\Users\Veok\AppData\Roaming\desktop\authenticator-secrets.json:2`).
- **Local attacker with interactive access to your unlocked OS session**: risk is materially higher; they can use the running app context and exposed renderer APIs, so practical protection depends on whether the app is currently locked and which lock method is configured.
- **Renderer compromise (XSS/content injection in renderer)**: there are sensitive IPC operations that do not enforce `ensureUnlocked`, so compromise of renderer code would increase blast radius.
- **Supply-chain attacker**: `pnpm audit` currently reports 9 vulnerabilities (5 high, 1 moderate, 3 low), largely in tooling/transitive packages.

Overall: **not trivially crackable from stolen files alone**, but there are **medium-priority hardening gaps** around IPC authorization boundaries and renderer CSP that should be addressed.

## Scope and method followed

- Plan-first requirement satisfied (`SECURITY_AUDIT_PLAN.md` was created before deep review).
- Read-only static review across Electron main/preload/renderer, storage, lock flow, backup crypto, and IPC.
- Runtime artifact checks performed on local userData and logs (no secret values reproduced).
- Dependency posture checked via `pnpm audit`.

## Top risks

1. Sensitive lock-management IPC channels are callable without `ensureUnlocked` checks.
2. Renderer `index.html` has no CSP declaration.
3. Supply-chain vulnerability exposure in transitive dependencies (notably `tar`, `serialize-javascript`).
4. 4-digit PIN remains low-entropy even with strong KDF parameters.

## Findings

| ID | Severity | Area | Impact | Evidence | Recommendation |
|---|---|---|---|---|---|
| F-001 | Medium | IPC authorization | If renderer execution is compromised, attacker can alter lock configuration/state without prior unlock checks (defense-in-depth boundary weakness). | `apps/desktop/src/main/ipc-handlers.ts:1019` (`lock:setMethod`), `apps/desktop/src/main/ipc-handlers.ts:1065` (`lock:clearCredential`), `apps/desktop/src/main/ipc-handlers.ts:1106` (`lock:resetAppLock`), `apps/desktop/src/preload.ts:64-73` (exposed APIs). | Gate sensitive lock-management channels behind explicit authorization checks and/or re-auth; minimize exposed preload surface for administrative lock operations. |
| F-002 | Low | Renderer hardening (CSP) | Missing CSP reduces mitigation layers against script injection should a renderer injection vector be introduced. | `apps/desktop/index.html:1-12` (no CSP meta/header). | Add restrictive CSP appropriate for Electron renderer (nonce/hash-based script policy, deny remote script origins). |
| F-003 | Medium | Credential entropy | 4-digit PIN option has low search space; KDF slows guesses but does not add entropy. | `apps/desktop/src/main/lock-store.ts:37-42` (Argon2id), `apps/desktop/src/main/lock-store.ts:73-79` (4/6 PIN accepted), `apps/desktop/src/main/lock-store.ts:197-200` and `apps/desktop/src/main/lock-store.ts:214-241` (online delay/lockout). | Prefer 6-digit PIN minimum (or stronger methods by default), keep/strengthen lockout/backoff UX and monitoring. |
| F-004 | Medium | Supply chain | Known vulnerable transitive packages may be reachable in dev/build workflows, increasing compromise surface. | `pnpm audit` output: 9 vulns (5 high, 1 moderate, 3 low), including `tar`, `serialize-javascript`, `esbuild` advisory class. | Prioritize dependency remediation in desktop toolchain path; track advisories and pin/upgrade transitive chains where possible. |

## Positive controls observed

- Strong Electron webPreferences defaults on main window: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false` (`apps/desktop/src/main.ts:172-176`).
- Navigation/new-window restrictions present (`setWindowOpenHandler` deny + `will-navigate` filter) (`apps/desktop/src/main.ts:209`, `apps/desktop/src/main.ts:211-216`).
- Devtools/reload shortcuts blocked in non-dev and forced close if opened (`apps/desktop/src/main.ts:251-263`).
- Secrets and lock/settings payload persisted as encrypted blob via `safeStorage` (`apps/desktop/src/main/secure-store.ts:354`, `apps/desktop/src/main/secure-store.ts:437-438`).
- Credential hashing uses Argon2id (`apps/desktop/src/main/lock-store.ts:37-42`, `apps/desktop/src/main/lock-store.ts:141`).
- Backup export format uses PBKDF2-SHA256 (210000 iterations) + AES-GCM (`packages/backup/src/index.ts:27`, `packages/backup/src/index.ts:64-76`, `packages/backup/src/index.ts:88-105`).

## Runtime checks and artifacts

- userData contains encrypted secrets file and logs directory:
  - `C:\Users\Veok\AppData\Roaming\desktop\authenticator-secrets.json`
  - `C:\Users\Veok\AppData\Roaming\desktop\logs\desktop-debug.log`
- Observed secrets file uses encrypted `blob` field (ciphertext at rest) (`C:\Users\Veok\AppData\Roaming\desktop\authenticator-secrets.json:2`).
- Observed debug log lines mostly contain flow metadata/lengths, not raw TOTP secrets in sampled lines (`C:\Users\Veok\AppData\Roaming\desktop\logs\desktop-debug.log:32-33`, `C:\Users\Veok\AppData\Roaming\desktop\logs\desktop-debug.log:60-61`).

## Appendix A: Dependency audit summary

Command run: `pnpm audit --audit-level low`

- Total: **9 vulnerabilities**
- Severity split: **5 high, 1 moderate, 3 low**
- Highlights:
  - High: multiple `tar` advisories (transitive)
  - High: `serialize-javascript`
  - Moderate: `esbuild` dev-server advisory
  - Low: `tmp`, `elliptic`, `@tootallnate/once`

## Appendix B: IPC exposure inventory (security-relevant)

Exposed from preload (`apps/desktop/src/preload.ts`):

- `authAPI`: account CRUD, code generation, screen QR scan.
- `appAPI`: settings read/update, backup export/import, account edit/update.
- `lockAPI`: lock method/config/credentials, verify, lock state, backup recovery codes, passkey flows.
- `clipboardAPI`: clipboard clear helper.

Main-process registration highlights (`apps/desktop/src/main/ipc-handlers.ts`):

- Many sensitive data operations are correctly gated with `ensureUnlocked` (e.g., `totp:*`, `backup:*`, some settings writes).
- Some lock-admin operations are not gated by `ensureUnlocked` (`lock:setMethod`, `lock:clearCredential`, `lock:resetAppLock`), which is acceptable only if renderer trust is absolute; otherwise this is a boundary-hardening gap.

## Appendix C: Storage map

- Primary encrypted secret store (electron-store key `blob`):
  - logical source: `apps/desktop/src/main/secure-store.ts`
  - runtime file: `C:\Users\Veok\AppData\Roaming\desktop\authenticator-secrets.json`
- Debug logs:
  - `C:\Users\Veok\AppData\Roaming\desktop\logs\desktop-debug.log`

## Final crackability statement

- **Quick crack unlikely** for an attacker who only steals files from disk.
- **Quick compromise more plausible** for an attacker with active local-session access or a renderer compromise path, due to trust in renderer-side invocation of sensitive IPC.
- Priority should be reducing renderer-to-main trust for lock-admin IPC and adding CSP defense-in-depth.
