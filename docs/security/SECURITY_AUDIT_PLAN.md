# Security Audit Plan

## A) Scope and threat model

### In-scope assets
- TOTP account secrets (Base32 seeds and derived OTP metadata)
- Backup/export artifacts and passphrase-protected payloads
- Lock credentials and lock state (PIN/password/pattern/passkey records, lockout counters)
- User settings that affect security posture (privacy screen, lock behavior, clipboard behavior)

### Attacker models
- Local attacker with filesystem access (can read/copy app data files)
- Local attacker with interactive access to an unlocked OS session
- Malicious/untrusted web content in renderer (if any external or dynamic content path exists)
- Supply-chain attacker through vulnerable/transitive dependencies

### Trust boundaries
- Renderer ↔ Preload ↔ Main process IPC boundary
- Disk storage boundary (encrypted blob, settings, logs) ↔ runtime decrypted state
- Clipboard/OS integration boundary (current clipboard and clipboard history semantics)

## B) Audit methodology

### Static code review targets
- Desktop main/preload/runtime:
  - `apps/desktop/src/main.ts`
  - `apps/desktop/src/main/**/*.ts`
  - `apps/desktop/src/preload.ts`
  - `apps/desktop/src/renderer.d.ts`
- UI/renderer boundary and security-sensitive flows:
  - `packages/ui/src/App.tsx`
  - `packages/ui/src/bridge.ts`
  - `packages/ui/src/components/**/*.tsx`
  - `packages/ui/src/utils/**/*.ts`
- Core/backup/security libraries:
  - `packages/core/src/**/*.ts`
  - `packages/backup/src/**/*.ts`

### Configuration review targets
- BrowserWindow and webPreferences
- Navigation/opening restrictions (`setWindowOpenHandler`, `will-navigate`)
- Devtools/reload shortcut restrictions in production
- CSP presence for renderer HTML

### Dependency and supply-chain review
- Workspace manifests (`package.json`, lock/workspace metadata)
- `pnpm audit` findings summary and severity
- Electron version identification and advisory posture
- Highlight security-sensitive deps (crypto, QR parsing, serialization, IPC helpers)

### Runtime behavior checks (no code changes)
- Startup/lock gating behavior at runtime
- Clipboard copy/clear behavior observation
- Export/import artifact inspection (format/encryption indicators only)
- Validate no obvious debug bypasses exposed in production run

### Evidence standard
- Every finding must include:
  - file path
  - 1-based line numbers
  - short code excerpt (redacted where needed)
- No secrets printed in report; only redacted descriptors

## C) Severity rubric and crackability criteria

### Severity levels
- **Critical**: straightforward compromise of TOTP secrets or lock bypass with minimal prerequisites
- **High**: realistic compromise requiring moderate preconditions (e.g., local file theft + feasible cracking)
- **Medium**: meaningful weakness with constrained exploitability or strong preconditions
- **Low**: best-practice gaps, minor leakage risk, or defense-in-depth opportunities

### “Can it be cracked quickly?” evaluation criteria
- **Offline brute force feasibility**
  - strength/cost of credential verifier (algorithm + parameters)
  - presence of per-user salt and key-stretching
  - practicality of guessing space (e.g., 4-digit PIN) vs KDF cost
- **Online brute force feasibility**
  - attempt limits, exponential backoff, lockout timers
  - reset/bypass vectors for lock state
- **Secret extraction feasibility**
  - encryption at rest for TOTP secrets
  - key management source (OS keystore/DPAPI vs app-managed static key)
  - whether secrets/otpauth URIs are exposed via logs or renderer APIs
- **UI/IPC bypass feasibility**
  - sensitive IPC channels callable without sufficient state checks
  - debug/reload/devtools escape routes in production
  - preload overexposure across context isolation boundary
