# Safety Setup Plan Audit

Date: 2026-03-07
Scope: Electron desktop app (`apps/desktop`) + UI package (`packages/ui`)

This document is Step 1 (plan audit only). No implementation changes are included here.

## 1) First-run detection

### Where settings are loaded today

- Main-process persisted settings schema and normalization live in:
  - `apps/desktop/src/main/secure-store.ts:76` (`AppSettings`)
  - `apps/desktop/src/main/secure-store.ts:102` (`DEFAULT_SETTINGS`)
  - `apps/desktop/src/main/secure-store.ts:293` (`normalizeSettings`)
  - `apps/desktop/src/main/secure-store.ts:711` (`loadSettings`)
- Main process reads settings at startup/runtime in:
  - `apps/desktop/src/main.ts:820` (`createMainWindow` startup settings)
  - `apps/desktop/src/main.ts:1061` (`app.whenReady` runtime settings)
  - `apps/desktop/src/main.ts:1075` (idle auto-lock timer reads settings repeatedly)
- Renderer bootstrap reads settings + lock snapshot in:
  - `packages/ui/src/App.tsx:813` (`loadSecuritySnapshot`)
  - `packages/ui/src/App.tsx:857` (initial load effect calls `bridge.getSettings()` and `loadSecuritySnapshot()`)

### Existing first-run/onboarding flags

- No onboarding/safety-setup flags currently exist in app settings or lock state.
- Confirmed no existing keys like first-run/onboarding/safety setup in TS/TSX sources.

### Proposed settings keys

Add to `AppSettings` (main + bridge + renderer typings):

- `hasCompletedSafetySetup: boolean`
- `hasSkippedSafetySetup: boolean`
- `lastSafetySetupReminderAt?: number`

### How to detect "no protection configured yet"

Reuse existing lock snapshot logic in renderer:

- `packages/ui/src/App.tsx:813` already computes:
  - normalized lock method (`none|swipe|pin4|pin6|password|pattern`)
  - whether method is configured (`configured`)
- Existing main-process equivalent checks exist in:
  - `apps/desktop/src/main/ipc-handlers.ts:1047` (`lockMethodConfigured`)
  - `apps/desktop/src/main/lock-store.ts:302` (`shouldRequireLockOnStartup`)

Audit recommendation for auto-show predicate:

- `isUnprotected = !snapshot.configured || snapshot.method === "none" || snapshot.method === "swipe"`
- `showSafetySetup = isUnprotected && !settings.hasCompletedSafetySetup && !settings.hasSkippedSafetySetup`

Migration-safe behavior for existing protected users:

- If flags are both false but protection is already configured, silently persist `hasCompletedSafetySetup=true` once.
- This avoids unexpectedly showing first-run flow to existing secure users after upgrade.

### Schema plumbing that must be updated

- Main schema/normalization:
  - `apps/desktop/src/main/secure-store.ts` (`AppSettings`, `DEFAULT_SETTINGS`, `settingsMatchesNormalized`, `normalizeSettings`)
  - `apps/desktop/src/main/ipc-handlers.ts:502` (`validateSettings`)
- Renderer/shared schema:
  - `packages/ui/src/bridge.ts:274` (`AppSettings`)
  - `packages/ui/src/bridge.ts:300` (`DEFAULT_SETTINGS`)
  - `packages/ui/src/bridge.ts:478` (`normalizeAppSettings`)
  - `apps/desktop/src/renderer.d.ts:24` (`RendererAppSettings`)
- Preload bridge API shape can stay unchanged if persistence uses existing:
  - `app:getSettings` / `app:updateSettings` (`apps/desktop/src/preload.ts:51-52`)

## 2) Existing flows to reuse

### PIN setup

- UI lock-method selection and setup:
  - `packages/ui/src/components/SecurityPicker.tsx:157` (`handleSaveMethod`)
  - `packages/ui/src/components/SecurityPicker.tsx:186` (`handleSetPin`)
- Main IPC endpoints:
  - `apps/desktop/src/main/ipc-handlers.ts:1384` (`lock:setMethod`)
  - `apps/desktop/src/main/ipc-handlers.ts:1394` (`lock:setCredential`)
- Credential policy/storage:
  - `apps/desktop/src/main/lock-store.ts:156` (`setCredential`)

### Passkey setup

- UI passkey registration:
  - `packages/ui/src/components/SecurityPicker.tsx:336` (`handleRegisterPasskey`)
- Main IPC endpoints:
  - `apps/desktop/src/main/ipc-handlers.ts:1502` (`passkey:getChallenge`)
  - `apps/desktop/src/main/ipc-handlers.ts:1507` (`passkey:saveCredential`)
  - `apps/desktop/src/main/ipc-handlers.ts:1522` (`passkey:listCredentials`)
- Persistence layer:
  - `apps/desktop/src/main/passkey-store.ts:37` (`savePasskeyCredential`)

### Backup code generation

- UI trigger:
  - `packages/ui/src/components/SecurityPicker.tsx:761` (`onGenerateBackupCodes` button)
  - `packages/ui/src/App.tsx:1578` (`handleGenerateBackupCodes`)
- Main IPC + gating:
  - `apps/desktop/src/main/ipc-handlers.ts:1467` (`lock:generateBackupCodes`)
  - `apps/desktop/src/main/ipc-handlers.ts:1096` (`ensureLockAdminAccess`)
  - `apps/desktop/src/main/ipc-handlers.ts:1037` (`backupFeatureEnabled`)
- Generator:
  - `apps/desktop/src/main/backup-codes.ts:33` (`generateBackupCodes`)

Hardening note:

- `lock:generateBackupCodes` requires lock-admin context and PIN-enabled backup feature.
- Existing first-run exception path (locked but no configured credentials) is already covered by lock-admin logic and security tests:
  - `apps/desktop/src/__tests__/ipc-handlers.security.test.ts:302`

### Clipboard security setting

- UI setting control:
  - `packages/ui/src/App.tsx:2322` (clipboard safety checkbox)
- Persist path:
  - `packages/ui/src/App.tsx:1394` (`saveSettings` -> `bridge.updateSettings`)
  - `apps/desktop/src/main/ipc-handlers.ts:1762` (`app:updateSettings`)
- Validation/normalization:
  - `apps/desktop/src/main/ipc-handlers.ts:466` (`validateClipboardSafetyEnabled`)
  - `apps/desktop/src/main/secure-store.ts:319` (normalize to boolean)

### Auto-lock setting

- UI setting control:
  - `packages/ui/src/App.tsx:2269` (Lock after selector)
- Persist path:
  - `packages/ui/src/App.tsx:1394` (`saveSettings`)
  - `apps/desktop/src/main/ipc-handlers.ts:1762` (`app:updateSettings`)
- Runtime enforcement:
  - `apps/desktop/src/main.ts:1075` (idle check timer uses `settings.autoLockSeconds`)
- Validation:
  - `apps/desktop/src/main/ipc-handlers.ts:417` (`validateAutoLockSeconds`)
  - `apps/desktop/src/main/secure-store.ts:241` (`normalizeAutoLockSeconds`)

## 3) Proposed flow structure

Chosen structure: **dedicated first-run Safety Setup modal**, skippable.

Reason:

- Matches preferred requirement (modal/page) without app redesign.
- Can reuse existing lock/passkey/backup/security logic and APIs.
- Keeps onboarding focused on security (not tutorial tour).

Proposed compact flow:

1. **Intro**
   - Title: "Protect your vault"
   - Subtitle: "Recommended before you start using the app"
   - Actions:
     - Primary: "Set up protection"
     - Secondary: "Skip for now"
2. **Lock method**
   - Reuse `SecurityPicker` lock setup flow (PIN6/passkey/password/pattern where supported).
3. **Recovery + security defaults**
   - Reuse backup-code generation flow (`handleGenerateBackupCodes` / `lock:generateBackupCodes`).
   - Reuse security toggles for:
     - `autoLockSeconds`
     - `clipboardSafetyEnabled`
4. **Done**
   - Completion confirmation and close.

Non-trapping behavior:

- "Skip for now" available throughout.
- User can close and continue app use immediately.

## 4) State transitions

### Entry conditions

- Auto-show when:
  - unprotected, and
  - not completed, and
  - not skipped.
- Do not auto-show when:
  - completed, or
  - explicitly skipped.

### User outcomes

- **Completes setup**
  - Persist:
    - `hasCompletedSafetySetup = true`
    - `hasSkippedSafetySetup = false`
  - Hide future auto-show.
- **Partially completes setup**
  - Persisted security changes (lock method, passkey, settings) remain.
  - If lock method is configured but backup codes are not generated:
    - allow completion,
    - keep setup marked complete,
    - keep backup warning/resume path in Security settings.
- **Skips setup**
  - Persist:
    - `hasSkippedSafetySetup = true`
    - `hasCompletedSafetySetup = false`
    - `lastSafetySetupReminderAt = now`
  - Continue to app immediately.

### Reminder behavior after skip

Recommended reminder strategy (subtle):

- Home screen banner (reuse existing banner system in `App.tsx`) when skipped+unprotected and reminder cooldown elapsed.
- Suggested cooldown: 24h via `lastSafetySetupReminderAt`.
- Suggested copy:
  - "Your vault isn’t fully protected yet."
  - CTA text in reminder context: "Finish Safety Setup"

Reminder hidden when:

- user completes Safety Setup, or
- user is already protected and migration marks setup as completed.

### Return path from Settings

- Add `Settings > Security > Run Safety Setup again` action.
- This action always reopens the same modal flow (manual invocation ignores skip/completed gate).

## 5) Validation plan

### Automated tests (planned)

UI tests (`packages/ui`):

- first launch + no protection => Safety Setup appears
- protected user => Safety Setup does not appear
- skip => app continues and skip state persists
- complete => completion state persists
- Settings > Security > Run Safety Setup again => flow reopens
- optional: skipped reminder throttled by `lastSafetySetupReminderAt`

Desktop tests (`apps/desktop`):

- settings schema normalization includes new keys and defaults
  - extend `secure-store.resilience.test.ts`
- settings validation accepts and normalizes new keys
  - extend `ipc-handlers` settings validation tests where applicable

### Manual checks (planned)

- fresh install => Safety Setup appears
- skip => app opens immediately; subtle reminder appears later
- complete => no repeat on next launch
- partial completion => no broken state; resume works
- existing protected user upgrading => no unexpected first-run Safety Setup
- backup generation in Safety Setup path respects lock-admin and PIN gating (no silent failure)

## Minimal implementation footprint (audit recommendation)

- Keep renderer changes concentrated in `packages/ui/src/App.tsx` + one small modal component.
- Reuse existing `SecurityPicker` and existing settings persistence methods.
- Avoid new IPC channels unless strictly required; prefer existing `app:getSettings`, `app:updateSettings`, and current lock APIs.
