# Safety Setup Implementation Plan

Date: 2026-03-07
Reference: `PLAN_AUDIT_SAFETY_SETUP.md`

## Scope

Implement an optional first-run Safety Setup flow for unprotected users, with skip + subtle reminder behavior, while reusing existing lock/security paths.

## Files to change

### Main process settings schema / validation

- `apps/desktop/src/main/secure-store.ts`
  - extend `AppSettings`
  - extend `DEFAULT_SETTINGS`
  - normalize + compare new keys in `normalizeSettings` and `settingsMatchesNormalized`
- `apps/desktop/src/main/ipc-handlers.ts`
  - validate new settings keys in `validateSettings`

### Renderer/shared settings typings

- `packages/ui/src/bridge.ts`
  - extend `AppSettings`, `DEFAULT_SETTINGS`, `normalizeAppSettings`
- `apps/desktop/src/renderer.d.ts`
  - extend `RendererAppSettings`

### UI flow + trigger + reminders

- `packages/ui/src/components/SafetySetupModal.tsx` (new)
  - dedicated safety setup modal with Intro / Lock method / Recovery+defaults / Done
  - reuses existing lock/passkey/backup handlers and settings updates
- `packages/ui/src/App.tsx`
  - first-run trigger logic using existing security snapshot
  - existing-protected migration auto-mark completed
  - skip/complete/partial state persistence
  - subtle reminder logic with 24h cooldown
  - settings action: “Run Safety Setup again” in Security section
  - command support to open flow manually from tray (`open-safety-setup`)
- `packages/ui/src/ui.css`
  - small styles for modal layout + reminder button (no redesign)

### Desktop command plumbing for manual reopen (optional but lightweight)

- `apps/desktop/src/main.ts`
  - add tray action mapping to send `open-safety-setup` command

### Tests

- `apps/desktop/src/__tests__/secure-store.resilience.test.ts`
  - assert new settings keys normalize + persist safely
- `packages/ui/src/App.safety-setup.test.tsx` (new)
  - first-run unprotected shows flow
  - protected user migration suppresses flow and auto-marks completed
  - skip persists + closes
  - completion persists + suppresses repeat
  - rerun from Security opens flow
  - partial changes persist (no rollback)

### Validation notes

- `SAFETY_SETUP_VALIDATION.md` (new)
  - commands run
  - automated test summary
  - manual checklist results

## Settings schema changes

Add keys:

- `hasCompletedSafetySetup: boolean` (default `false`)
- `hasSkippedSafetySetup: boolean` (default `false`)
- `lastSafetySetupReminderAt?: number` (default `undefined`)

Normalization behavior:

- booleans are normalized from unknown values
- reminder timestamp is normalized to finite positive integer milliseconds or `undefined`

## Component strategy

- Build a lightweight modal component (`SafetySetupModal`) instead of a new page.
- Keep steps concise and skippable:
  1. Intro
  2. Lock method (reuse existing lock/passkey setup behavior via existing callbacks)
  3. Recovery + security defaults (reuse backup generation + settings persistence)
  4. Done
- No tutorial content, no feature tour, no app-shell redesign.

## Reminder strategy

- Show reminder only if:
  - user skipped setup,
  - user still unprotected,
  - cooldown elapsed (`lastSafetySetupReminderAt + 24h`).
- Use existing banner system in `App.tsx` with copy:
  - “Your vault isn’t fully protected yet.”
  - action text: “Finish Safety Setup”.
- Update `lastSafetySetupReminderAt` when reminder is shown.

## Tests to add/update

1. First launch + unprotected => flow visible.
2. Protected user + unset flags => no flow; completed flag auto-saved.
3. Skip => skip state + reminder timestamp persist.
4. Complete => completed state persists and suppresses auto-show.
5. Settings > Security > Run Safety Setup again => flow opens regardless of flags.
6. Partial changes (e.g., security defaults edited before skip/close) persist.
7. Main settings normalization includes new keys.
