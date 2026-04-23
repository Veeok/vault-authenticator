# Multi Lock Methods Plan Audit

Date: 2026-03-07
Scope: Electron desktop app (`apps/desktop`) + UI package (`packages/ui`)

This is Step 1 (analysis and plan only). No implementation edits are included in this document.

## 1) Current lock model

### Current persisted model (today)

Lock state is currently split across one selected lock method plus separate credential slots:

- `lockMethod` (single enum): `none | swipe | pin4 | pin6 | password | pattern`
  - Defined in `apps/desktop/src/main/secure-store.ts` (`type LockMethod`).
  - Normalized by `normalizeLockMethod(...)` in `apps/desktop/src/main/secure-store.ts`.
- Credential records are stored separately (can coexist):
  - `pinCredential` (hash + digits)
  - `passwordCredential` (hash)
  - `patternCredential` (hash)
  - In `apps/desktop/src/main/secure-store.ts` payload schema + load/save/clear helpers.
- Passkey state is also separate:
  - `passkeyCredentials[]` in secure payload
  - plus `quickUnlock.passkey` flag in `quickUnlock`
  - Passkey is currently treated as quick-unlock path, not a primary lock method enum.

So today the persisted model is effectively: one selected method + potentially multiple stored credentials + separate passkey quick-unlock state.

### File paths and function map

Load lock method/config:

- `apps/desktop/src/main/secure-store.ts`
  - `loadLockMethod()`
  - `loadQuickUnlock()`
  - `loadPinCredential()`, `loadPasswordCredential()`, `loadPatternCredential()`, `loadPasskeyCredentials()`
- `apps/desktop/src/main/lock-store.ts`
  - `getLockMethod()`
  - `getQuickUnlock()`
  - `getPinDigits()`
- `apps/desktop/src/main/ipc-handlers.ts`
  - IPC `lock:getMethod`
  - IPC `lock:getQuickUnlock`
- `packages/ui/src/App.tsx`
  - `loadSecuritySnapshot()` (renderer-side load snapshot)

Save/change lock method/config:

- `apps/desktop/src/main/secure-store.ts`
  - `saveLockMethod(...)`
  - `saveQuickUnlock(...)`
  - `savePinCredential(...)`, `savePasswordCredential(...)`, `savePatternCredential(...)`, `savePasskeyCredential(...)`
- `apps/desktop/src/main/lock-store.ts`
  - `setLockMethod(...)`
  - `setQuickUnlock(...)`
  - `setCredential(...)`
- `apps/desktop/src/main/ipc-handlers.ts`
  - IPC `lock:setMethod`
  - IPC `lock:setQuickUnlock`
  - IPC `lock:setCredential`
- `packages/ui/src/components/SecurityPicker.tsx`
  - `handleSaveMethod()` (single-method save UX)
  - `handleSetPin()`, `handleSetPassword()`, `handlePatternComplete()`, `handleRegisterPasskey()`

Verify/unlock:

- `apps/desktop/src/main/lock-store.ts`
  - `verifyCredential(...)`
  - `verifyCredentialWithLimit(...)`
  - `lockMethodCredentialType(...)`
  - `shouldRequireLockOnStartup()`
- `apps/desktop/src/main/ipc-handlers.ts`
  - IPC `lock:verify`
  - IPC `passkey:verifyAssertion`
  - startup lock gating via `registerIpc()` and `lockMethodConfigured(...)`
- `packages/ui/src/components/LockScreen.tsx`
  - `loadState()`
  - `submitPin()`, `submitPassword()`, `submitPattern()`, `submitBackupCode()`
  - passkey path via `runQuickUnlock()` / `triggerQuickUnlock()`

Reset/clear:

- `apps/desktop/src/main/lock-store.ts`
  - `clearCredential(...)`
  - `clearCredentialLockState()`
- `apps/desktop/src/main/secure-store.ts`
  - `clearPinCredential()`, `clearPasswordCredential()`, `clearPatternCredential()`, `clearPasskeyCredential()`
  - `clearBackupCodeRecords()`
- `apps/desktop/src/main/ipc-handlers.ts`
  - IPC `lock:clearCredential`
  - IPC `lock:resetAppLock`

Settings UI rendering:

- `packages/ui/src/App.tsx`
  - renders `<SecurityPicker ... />` in Security settings
  - also passes it into `<SafetySetupModal ... />`
- `packages/ui/src/components/SecurityPicker.tsx`
  - current lock-method radio list + "Save Method" flow
- `packages/ui/src/components/SafetySetupModal.tsx`
  - embeds `SecurityPicker` during setup step

### Is password treated specially?

Yes, in a few places:

- Password policy is specific (`>=8 chars`) in `lock-store.ts` `normalizePassword(...)`.
- PIN lockout/backoff is enforced, password/pattern are not (`verifyCredentialWithLimit(...)` applies lockout only to `pin`).
- Fallback ordering uses password before pattern in some flows:
  - payload normalization fallback in `secure-store.ts` prefers `pin -> password -> pattern`.
  - lock screen "Sign in with account" currently tries `password -> pattern -> pin`.

## 2) Current UX mismatch

### What UI implies

- `SecurityPicker` presents lock method as a single radio group.
- User must click "Save Method" first, then complete setup in a separate panel.
- This implies exactly one active method, with setup as a second disjoint step.

### What runtime/security model actually allows

- Credential records are independent and can coexist (pin/password/pattern may all exist).
- Passkey credentials are independent and can be enabled as quick unlock.
- Lock screen already checks all configured credential presence (`hasPin`, `hasPassword`, `hasPattern`) and can unlock through alternate paths.

### Concrete mismatch

- Runtime can have password + another method stored and usable, but settings UI only models one selected method.
- Users cannot clearly view/manage primary vs secondary method, despite underlying multi-credential reality.
- "Save Method" creates a confusing two-step mental model and triggers writes even for no-op selections.

## 3) Proposed data model (stable up to two methods)

### Recommended canonical model

Use a canonical method kind at UI/domain level:

- `primaryLockMethod: "none" | "swipe" | "pin" | "password" | "pattern" | "passkey"`
- `secondaryLockMethod: null | "pin" | "password" | "pattern" | "passkey"`

Keep existing credential records as-is (no credential schema rewrite).

Retain `pinCredential.digits` (4/6) as existing security metadata.

### Persistence strategy (minimal-risk, backward compatible)

Add two new optional persisted fields in encrypted payload:

- `primaryLockMethod`
- `secondaryLockMethod`

Keep existing fields and behavior for compatibility:

- keep `lockMethod` as legacy primary mirror
- keep `quickUnlock` and `passkeyCredentials`
- keep `pinCredential/passwordCredential/patternCredential`

Migration/read fallback when new fields are absent:

1. Derive primary from legacy `lockMethod` (existing normalization).
2. Derive secondary from currently configured alternate credentials/passkey (deterministic priority), excluding primary.
3. Persist normalized new fields on first write.

This allows existing users to keep working without forced reconfiguration while enabling explicit two-method selection going forward.

### Validation rules

- Max two methods total.
- No duplicates.
- `none` and `swipe` cannot coexist with any secure method.
- `secondaryLockMethod` can never be `none`/`swipe`.
- `password` may be primary or secondary.
- `pin` maps to existing `pin4`/`pin6` via `pinCredential.digits`.
- `passkey` requires at least one passkey credential to be configured.

### Why this is lower risk than full storage rewrite

- Credential hashing/verification code remains unchanged.
- Recovery/backup/passkey stores remain unchanged.
- Existing payload readers remain compatible because legacy fields are retained.

## 4) Unlock behavior rules (two methods)

### Expected behavior

- Any configured method in `{primary, secondary}` can unlock.
- Primary is default lock-screen path only.
- Secondary appears under "Other ways to sign in".
- If passkey is primary, default lock-screen path should be passkey-first.

### Lock-screen UX contract

- Default panel is primary method UI.
- "Other ways to sign in" reveals:
  - secondary method (if configured)
  - backup code path (existing)
  - existing help/reset actions (existing)
- Keep UI focused; do not show all methods simultaneously on first view.

### Compatibility safety

For users with legacy extra credentials beyond two stored in payload:

- Do not delete credentials during migration.
- Surface primary + secondary in the new UX.
- Preserve existing recovery paths and do not weaken lock gate checks.

## 5) Save/apply behavior plan

### Chosen approach

Use immediate autosave for lock-method selection and primary/secondary ordering when the change is valid and atomic.

No always-visible "Save Method" button.

### Dirty-state computation

Compute `dirty` from normalized snapshot comparison:

- `persisted = normalize({ primary, secondary })`
- `draft = normalize({ primary, secondary })`
- `dirty = persisted.primary !== draft.primary || persisted.secondary !== draft.secondary`

Normalization enforces ordering/rules (`none/swipe` exclusivity, duplicate removal, max two).

### No-op behavior

- If user action yields same normalized config as persisted state, do nothing (no IPC write, no success toast).

### Pending setup behavior (partial setup safety)

When user selects an unconfigured secure method:

- mark it as pending in UI only
- launch existing setup flow for that method
- persist selection only after setup succeeds

If setup is canceled/fails:

- revert pending selection immediately
- leave persisted config unchanged
- do not leave half-configured state in UI

### Passkey and credential setup mapping

- `pin` -> existing PIN setup (`lock:setCredential("pin", ...)`)
- `password` -> existing password setup (`lock:setCredential("password", ...)`)
- `pattern` -> existing pattern setup (`lock:setCredential("pattern", ...)`)
- `passkey` -> existing passkey registration flow (`passkey:getChallenge` + `passkey:saveCredential`)

## 6) Validation plan

### Automated tests to add/update

UI (`packages/ui`):

1. Selection model
   - select one method
   - select two methods
   - prevent third selection with inline message
   - selecting `none/swipe` clears secure selections and warns
2. Dirty/autosave behavior
   - no save/apply visible when no changes
   - valid changes autosave
   - setup-required method remains pending until setup success
   - canceled setup reverts pending selection
3. Primary/secondary behavior
   - explicit primary switch persists and reflects in UI
4. Lock screen
   - primary method rendered by default
   - secondary available under "Other ways to sign in"

Desktop/main (`apps/desktop`):

1. Secure-store migration/normalization
   - old payload without new fields loads correctly
   - old single-method users map to primary-only
   - old password+method users map to primary+secondary where applicable
2. IPC lock config validation
   - rejects invalid combinations (`none + password`, duplicates, >2)
3. Startup lock gating
   - still locks for valid secure config
   - still bypasses for `none/swipe`
4. Compatibility/hardening
   - existing lock-store and security hardening tests remain green

### Manual scenarios

- Configure PIN + Password, lock, unlock with both.
- Configure Pattern + Password, lock, unlock with both.
- Configure Passkey + PIN (if supported), default one and unlock via alternate.
- Switch primary between two configured methods and verify lock-screen default updates.
- Select `none`/`swipe` while secure methods are selected and confirm explicit replacement warning.
- Cancel setup mid-flow (PIN/password/pattern/passkey) and verify clean revert.
- Verify no stale save bar/button appears when there is no real change.
