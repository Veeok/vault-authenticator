# Vault Authenticator UX/UI Reuse Audit

## Scope, Method, and Limits

- Scope: the production app lives in the nested `authenticator/` workspace, not the legacy top-level scaffold. All findings below are based on `authenticator/packages/ui/src`, `authenticator/apps/desktop/src`, and `authenticator/apps/mobile/src`.
- Method: inspected shared React UI, desktop/mobile shell entry points, CSS tokens, bridge contracts, and UI tests that encode behavior. Key files include `authenticator/packages/ui/src/App.tsx`, `authenticator/packages/ui/src/ui.css`, `authenticator/packages/ui/src/bridge.ts`, and the component files under `authenticator/packages/ui/src/components/`.
- Live validation: `pnpm --filter desktop test:smoke` passed, and `pnpm --filter desktop start` successfully launched the Electron dev shell locally.
- Limitation: this CLI environment cannot visually inspect the running Electron window or capture screenshots, so rendered observations are inferred from code, CSS, and tests unless explicitly marked as live-run evidence.
- Fact vs inference: facts are tied to file references; inferences are called out when behavior is implied by composition rather than directly rendered in one place.

## 1. Executive Summary

### What kind of product this is

Vault Authenticator is an offline TOTP authenticator with a desktop-first UX and a mobile wrapper that reuses most of the same React UI. The product is effectively a secure "vault dashboard" rather than a multi-page app. Evidence: `authenticator/apps/desktop/package.json:3-18`, `authenticator/apps/mobile/package.json:1-10`, `authenticator/packages/ui/src/App.tsx:2356-2533`.

### Main UX philosophy

- Keep the user on one primary screen and push almost every secondary action into overlays, modals, or inline panels instead of route changes.
- Optimize the core loop for speed: open app, unlock if needed, scan the account list, copy a code, leave.
- Keep security visible and instructional: Safety Setup, backup code warnings, clipboard auto-clear, privacy lock, and lock-state messaging are all surfaced in UI rather than hidden in settings.
- Use a premium utility aesthetic: large rounded cards, mixed dark surfaces, ambient background orbs, accent-driven highlights, and subtle motion layered over a dense tool UI. Evidence: `authenticator/packages/ui/src/ui.css:32-143`, `authenticator/packages/ui/src/ui.css:687-745`, `authenticator/packages/ui/src/ui.css:1459-1491`.

### Core interface patterns

- Single-shell app with one centered card and a floating action/menu trigger: `authenticator/packages/ui/src/App.tsx:2406-2494`, `authenticator/packages/ui/src/components/HeaderMenu.tsx:55-126`.
- A reusable account row pattern that merges label metadata, a tappable OTP pill, a progress bar, and inline actions: `authenticator/packages/ui/src/components/AccountRow.tsx:187-256`.
- State-driven overlays for lock, add, search, edit, settings, Safety Setup, delete confirmation, and backup-code review: `authenticator/packages/ui/src/App.tsx:2497-3278`.
- A left-rail settings model that collapses to a single mobile category toggle: `authenticator/packages/ui/src/App.tsx:2549-2591`, `authenticator/packages/ui/src/ui.css:2511-2648`, `authenticator/packages/ui/src/ui.css:5057-5088`.
- A tokenized theme and motion system driven by root data attributes rather than per-component theme props: `authenticator/packages/ui/src/App.tsx:847-861`, `authenticator/packages/ui/src/ui.css:32-143`, `authenticator/packages/ui/src/ui.css:5214-5288`.

### What should definitely be preserved in the new app

1. The one-screen vault shell plus overlay model.
2. The account row composition: issuer, label, OTP pill, countdown, copy/edit/delete.
3. The lock overlay as a first-class screen, not a generic password modal.
4. The Safety Setup walkthrough as a guided remediation flow.
5. The settings taxonomy: Appearance, Security, Accounts, App behavior, Advanced.
6. The theme-color plus accent-override plus motion-governance architecture.
7. The banner/toast feedback model for sensitive actions.

### Inference

The product intentionally avoids navigation depth to keep secure tasks fast and cognitively light. That is not stated in one comment, but it is strongly implied by the lack of routing and the heavy investment in modal, tray, and keyboard-triggered flows: `authenticator/packages/ui/src/App.tsx:1442-1561`, `authenticator/packages/ui/src/App.tsx:2406-2533`.

## 2. App Structure Map

### Architecture Summary

- Framework: React 18 + TypeScript shared UI package, mounted by both Electron and Capacitor shells: `authenticator/apps/desktop/src/renderer.ts:1-108`, `authenticator/apps/mobile/src/index.tsx:1-7`.
- Routing: no route library found. Navigation is entirely local state and modal visibility in `App.tsx`: `authenticator/packages/ui/src/App.tsx:446-463`, `authenticator/packages/ui/src/App.tsx:2497-3278`.
- Styling: one global tokenized stylesheet, `authenticator/packages/ui/src/ui.css`.
- Icons: `lucide-react` plus a few small inline SVGs: `authenticator/packages/ui/package.json:9-14`, `authenticator/packages/ui/src/components/CustomTitleBar.tsx:106-140`.
- Platform bridge: shared `Bridge` contract with desktop/mobile implementations: `authenticator/packages/ui/src/bridge.ts:407-419`, `authenticator/apps/desktop/src/preload.ts:41-176`, `authenticator/apps/mobile/src/mobile-bridge.ts:495-948`.

### Screen Matrix

| Screen / state | Classification | Entry points | Exit points | Primary files |
| --- | --- | --- | --- | --- |
| Secure vault loading shell | Boot / transient | App start | Security snapshot resolved | `authenticator/packages/ui/src/App.tsx:2327-2353` |
| Main vault screen | Primary home | Startup after unlock; app without lock | Lock overlay, add modal, settings, search, edit, delete | `authenticator/packages/ui/src/App.tsx:2406-2494` |
| Lock screen overlay | Primary protection gate | Startup when configured; manual lock; focus-loss/privacy lock | Successful unlock only | `authenticator/packages/ui/src/App.tsx:2497-2501`, `authenticator/packages/ui/src/components/LockScreen.tsx:159-1096` |
| Add account modal | Creation | Header menu; tray/app command | Cancel or successful add | `authenticator/packages/ui/src/App.tsx:2503-2517`, `authenticator/packages/ui/src/components/AddModal.tsx:468-779` |
| Screen-scan overlay | Nested creation | Add modal -> Scan QR -> screen scan | Cancel, retry, or confirm add | `authenticator/packages/ui/src/components/AddModal.tsx:659-775` |
| Command palette | Secondary utility | `Ctrl+K`, menu, tray command | Escape, click outside, or copy action | `authenticator/packages/ui/src/App.tsx:2519-2527`, `authenticator/packages/ui/src/components/CommandPalette.tsx:124-179` |
| Edit account modal | Management | Account row edit | Cancel or save | `authenticator/packages/ui/src/App.tsx:2529-2531`, `authenticator/packages/ui/src/components/EditModal.tsx:64-168` |
| Settings modal | Secondary / management | Header menu; tray commands by category | Close button, outside click, Escape | `authenticator/packages/ui/src/App.tsx:2533-3095` |
| Safety Setup modal | Onboarding / remediation | Auto-open for unprotected vault; manual relaunch | Skip, complete, or close after done | `authenticator/packages/ui/src/App.tsx:1263-1284`, `authenticator/packages/ui/src/App.tsx:3098-3125`, `authenticator/packages/ui/src/components/SafetySetupModal.tsx:155-598` |
| Backup codes review dialog | Review / recovery | Generate backup codes | Copy or acknowledge saved | `authenticator/packages/ui/src/App.tsx:3127-3177` |
| Replace backup codes confirm | Destructive confirmation | Generate new codes when one set exists | Cancel or create new set | `authenticator/packages/ui/src/App.tsx:3179-3222` |
| Delete account confirm | Destructive confirmation | Account row delete | Cancel or delete | `authenticator/packages/ui/src/App.tsx:3224-3278` |
| Desktop title bar | Desktop-only shell | Desktop render only | Window actions | `authenticator/packages/ui/src/components/CustomTitleBar.tsx:102-177` |
| Desktop tray menu | Desktop-only shell | Tray icon | Sends app commands or exits | `authenticator/apps/desktop/src/main.ts:618-723` |

### Screen Hierarchy

```text
App root
-> optional CustomTitleBar (desktop)
-> global toast host
-> unlocked main shell
   -> vault header
   -> account list container
      -> skeleton rows
      -> empty state
      -> account rows
   -> floating HeaderMenu
-> lock overlay
-> AddModal
   -> screen scan overlay
-> CommandPalette
-> EditModal
-> SettingsModal
   -> category rail
   -> SecurityPicker inline system
-> SafetySetupModal
   -> intro
   -> lock
   -> recovery
   -> done
-> BackupCodesDialog
-> ReplaceBackupCodesConfirm
-> DeleteAccountConfirm
```

### Navigation Model

- Primary navigation is state-based, not route-based: `showAdd`, `showSettings`, `showCommandPalette`, `showSafetySetup`, `editingAccount`, `pendingDelete`, and `lockVisible` drive the full app shell: `authenticator/packages/ui/src/App.tsx:444-463`, `authenticator/packages/ui/src/App.tsx:2497-3278`.
- Desktop adds non-visual entry points via tray and window app commands such as `open-search`, `open-add-account`, `scan-from-screen`, `open-settings:security`, and `open-safety-setup`: `authenticator/apps/desktop/src/main.ts:624-676`, `authenticator/packages/ui/src/App.tsx:1442-1561`.
- Escape behaves as a global "close the topmost transient layer" key: `authenticator/packages/ui/src/App.tsx:1344-1380`.

### Entry Points, Exits, and Nested Flows

- Entry points: desktop renderer mount, mobile mount, tray menu commands, `Ctrl+K`, floating menu button, auto-open Safety Setup after startup: `authenticator/apps/desktop/src/renderer.ts:95-107`, `authenticator/apps/mobile/src/index.tsx:1-7`, `authenticator/packages/ui/src/App.tsx:1003-1019`, `authenticator/packages/ui/src/App.tsx:1401-1416`.
- Exit points: close modal, dismiss toast, hide window to tray on desktop close when enabled, explicit tray exit: `authenticator/packages/ui/src/App.tsx:1250-1342`, `authenticator/apps/desktop/src/main.ts:917-925`, `authenticator/apps/desktop/src/main.ts:712-723`.
- Nested flows:
  - Add account -> screen scan overlay -> failure -> retry, or confirm -> add: `authenticator/packages/ui/src/components/AddModal.tsx:366-425`, `authenticator/packages/ui/src/components/AddModal.tsx:659-775`.
  - Settings -> Security -> SecurityPicker -> setup panel / passkey management / backup codes: `authenticator/packages/ui/src/App.tsx:2672-2792`, `authenticator/packages/ui/src/components/SecurityPicker.tsx:693-1095`.
  - Safety Setup -> lock step embeds SecurityPicker -> recovery step embeds settings controls: `authenticator/packages/ui/src/components/SafetySetupModal.tsx:299-370`, `authenticator/packages/ui/src/components/SafetySetupModal.tsx:374-484`.

## 3. User Flows

### Flow A: Startup, Protection Check, and Unlock

- Goal of the user: reach the vault quickly without exposing codes when a real lock is configured.
- Entry point: app launch, privacy lock on visibility loss, desktop power events, manual "Lock app" action. Evidence: `authenticator/packages/ui/src/App.tsx:1003-1019`, `authenticator/packages/ui/src/App.tsx:1057-1081`, `authenticator/apps/desktop/src/main.ts:1106-1112`.
- Step by step:

```text
Launch
-> load settings + security snapshot
-> [lock configured?]
   -> yes: show lock overlay
   -> no: show vault
-> [unprotected and Safety Setup incomplete?]
   -> yes: auto-open Safety Setup
```

- Decisions and branches:
  - If the lock method is `none` or `swipe`, the app considers the vault unprotected: `authenticator/packages/ui/src/components/SafetySetupModal.tsx:46-57`.
  - Lock screen chooses its default mode from the configured primary method, but alternate methods can be opened from "Other ways to sign in": `authenticator/packages/ui/src/components/LockScreen.tsx:101-135`, `authenticator/packages/ui/src/components/LockScreen.tsx:1054-1092`.
  - Passkey quick unlock is attempted only when configured and a credential exists: `authenticator/packages/ui/src/components/LockScreen.tsx:338-409`.
- Feedback states:
  - Loading state: "Loading secure vault..." and "Loading lock method...": `authenticator/packages/ui/src/App.tsx:2344-2349`, `authenticator/packages/ui/src/components/LockScreen.tsx:802-818`.
  - Runtime status messages: verifying PIN/password/pattern, passkey cancellation, attempts used, lockout countdown, unlock transition: `authenticator/packages/ui/src/components/LockScreen.tsx:213-245`, `authenticator/packages/ui/src/components/LockScreen.tsx:833-856`.
- Success state: lock card enters `is-unlocking`, swaps closed/open icon, waits 1 second, then opens the vault: `authenticator/packages/ui/src/components/LockScreen.tsx:213-237`, `authenticator/packages/ui/src/ui.css:882-899`.
- Failure state: incorrect credential, failed passkey verification, or backup-code failure triggers error tone and sometimes shake animation: `authenticator/packages/ui/src/components/LockScreen.tsx:365-376`, `authenticator/packages/ui/src/ui.css:3691-3693`.
- Empty states:
  - "No passkey is registered for this app."
  - "No backup codes are currently available."
  Evidence: `authenticator/packages/ui/src/components/LockScreen.tsx:345-346`, `authenticator/packages/ui/src/components/LockScreen.tsx:660-664`.
- Edge cases:
  - `document.hidden` plus privacy screen can force-lock even without route changes: `authenticator/packages/ui/src/App.tsx:1057-1081`.
  - When the app becomes locked, every transient panel is forcibly closed: `authenticator/packages/ui/src/App.tsx:1101-1116`.
- Opportunities for reuse: this is a strong portable pattern for any sensitive desktop or mobile workspace that needs a full-screen re-entry experience rather than an inline password prompt.

### Flow B: Add Account

- Goal of the user: add a new OTP account with as little friction as possible.
- Entry point: floating `HeaderMenu`, tray/app command, or screen-scan shortcut: `authenticator/packages/ui/src/App.tsx:2477-2493`, `authenticator/apps/desktop/src/main.ts:629-636`.
- Step by step:

```text
Open Add Account
-> choose method: Paste setup link / Manual / Scan QR
-> [URI] paste otpauth URI -> add
-> [Manual] fill issuer, label, secret, digits, period, algorithm -> add
-> [Scan] open camera or desktop screen overlay
   -> [desktop] drag-select area -> decode -> confirm preview -> add
   -> [mobile] camera scan -> add matching otpauth QR
```

- Decisions and branches:
  - If no scan API exists, the scan tab is hidden: `authenticator/packages/ui/src/components/AddModal.tsx:170-178`.
  - If both camera and screen scan exist, desktop-like builds offer "Open Camera Instead": `authenticator/packages/ui/src/components/AddModal.tsx:622-632`.
  - Desktop screen scan requires explicit confirmation before add; mobile camera scan adds immediately once an `otpauth://` QR is found: `authenticator/packages/ui/src/components/AddModal.tsx:385-425`, `authenticator/apps/mobile/src/scanner.ts:21-26`.
- Feedback states:
  - Busy labels such as "Adding...", "Scanning...", and inline error blocks: `authenticator/packages/ui/src/components/AddModal.tsx:427-446`, `authenticator/packages/ui/src/components/AddModal.tsx:617-640`.
  - Screen scan status switches among `Ready to scan`, `Scanning selected area...`, `Review scanned account details before adding.`, and `No QR code found in the selected area.`: `authenticator/packages/ui/src/components/AddModal.tsx:684-696`.
  - Optimistic rows appear while an add is in progress: `authenticator/packages/ui/src/hooks/useAccounts.ts:47-99`.
- Success state: the modal closes, an account row appears in the vault, and the list refreshes: `authenticator/packages/ui/src/components/AddModal.tsx:301-343`, `authenticator/packages/ui/src/hooks/useAccounts.ts:61-69`.
- Failure state: invalid URI, invalid Base32 secret, unsupported QR content, no QR found, or scan unavailable all surface as inline UI errors rather than browser dialogs: `authenticator/packages/ui/src/components/AddModal.tsx:69-116`, `authenticator/packages/ui/src/components/AddModal.tsx:699-712`, `authenticator/packages/ui/src/components/AddModal.test.tsx:75-178`.
- Empty states: no scanner capability removes the Scan method from the chooser: `authenticator/packages/ui/src/components/AddModal.tsx:173-178`.
- Edge cases:
  - Tray command can open the modal directly in scan mode and auto-open the scan overlay: `authenticator/packages/ui/src/App.tsx:1464-1480`, `authenticator/packages/ui/src/components/AddModal.tsx:240-253`.
  - Desktop screen scanning uses an OS-level drag-select overlay window and QR decode via `jsQR`: `authenticator/apps/desktop/src/main/screen-qr.ts:36-171`, `authenticator/apps/desktop/src/main/screen-qr.ts:529-581`.
- Opportunities for reuse: the "multiple ingestion methods in one modal" pattern is extremely portable for add/import/create flows in other apps.

### Flow C: Browse, Search, and Copy Codes

- Goal of the user: find an account and copy a valid code quickly.
- Entry point: main vault list or command palette (`Ctrl+K`): `authenticator/packages/ui/src/App.tsx:1401-1416`, `authenticator/packages/ui/src/components/CommandPalette.tsx:124-179`.
- Step by step:

```text
Vault loads
-> codes refresh every second while unlocked
-> user scans list/grid or opens Search
-> user copies from OTP pill, copy button, or command palette result
-> banner confirms copy and clipboard safety countdown
```

- Decisions and branches:
  - Auto layout switches list vs grid at `<720px`, then 1/2/3 columns at 720, 900, and 1320 breakpoints: `authenticator/packages/ui/src/App.tsx:346-367`.
  - If clipboard safety is enabled, the app schedules a 30-second conditional clear: `authenticator/packages/ui/src/App.tsx:1147-1171`.
  - Command palette fuzzy-matches issuer and label and limits results to 60: `authenticator/packages/ui/src/components/CommandPalette.tsx:14-56`.
- Feedback states:
  - Copy button swaps icon and text to `Copied`; failed copy switches to `Retry`: `authenticator/packages/ui/src/components/AccountRow.tsx:223-230`, `authenticator/packages/ui/src/__tests__/clipboard.test.ts:67-105`.
  - Toasts can show a live countdown when clipboard safety is enabled: `authenticator/packages/ui/src/App.tsx:2373-2403`, `authenticator/packages/ui/src/App.tsx:2044-2059`.
- Success state: code lands on clipboard, the row highlights success, and the banner confirms the action: `authenticator/packages/ui/src/components/AccountRow.tsx:142-165`, `authenticator/packages/ui/src/App.tsx:2054-2059`.
- Failure state: clipboard unavailable or changed clipboard content prevents auto-clear and shows an info/error banner: `authenticator/packages/ui/src/App.tsx:1483-1537`, `authenticator/packages/ui/src/__tests__/clipboard.test.ts:147-183`.
- Empty states:
  - No accounts yet: `authenticator/packages/ui/src/App.tsx:2449-2455`.
  - Search `No matches`: `authenticator/packages/ui/src/components/CommandPalette.tsx:122-159`.
- Edge cases:
  - Code refresh pauses when the app is backgrounded and `pauseWhenBackground` is on: `authenticator/packages/ui/src/App.tsx:900-931`, `authenticator/packages/ui/src/App.tsx:667-668`.
  - Clipboard is only cleared if the current clipboard content still matches the copied code: `authenticator/packages/ui/src/__tests__/clipboard.test.ts:108-183`.
- Opportunities for reuse: the palette-plus-list dual discovery model is worth copying into any power-user app.

### Flow D: Edit and Delete Account

- Goal of the user: fix metadata or remove stale accounts without losing context.
- Entry point: inline account-row buttons: `authenticator/packages/ui/src/components/AccountRow.tsx:220-253`.
- Step by step:

```text
Account row -> Edit -> modal -> save
Account row -> Delete -> confirm dialog -> delete
```

- Decisions and branches:
  - Edit modal is loaded with an editable record from the bridge and supports digits, period, and algorithm updates: `authenticator/packages/ui/src/components/EditModal.tsx:14-62`.
  - Delete is always explicit and irreversible: `authenticator/packages/ui/src/App.tsx:3249-3275`.
- Feedback states: save uses `Saving...`; delete uses `Deleting...`; both use banners on success or inline errors on failure: `authenticator/packages/ui/src/components/EditModal.tsx:156-163`, `authenticator/packages/ui/src/App.tsx:2230-2247`, `authenticator/packages/ui/src/App.tsx:3255-3274`.
- Success state: account list refreshes and a success banner names the account: `authenticator/packages/ui/src/App.tsx:2230-2247`.
- Failure state: inline `auth-error` with title, instruction, and error code: `authenticator/packages/ui/src/components/EditModal.tsx:150-153`, `authenticator/packages/ui/src/App.tsx:3255-3258`.
- Empty states: none; these are item-level management flows.
- Edge cases: optimistic rows disable edit/delete until the add finishes: `authenticator/packages/ui/src/components/AccountRow.tsx:139-185`.
- Opportunities for reuse: lightweight modal edit plus hard confirmation delete is directly portable.

### Flow E: Security Settings and Safety Setup

- Goal of the user: configure a credible lock model and recovery path without needing separate onboarding screens.
- Entry point: settings Security category, auto-open Safety Setup, manual relaunch button: `authenticator/packages/ui/src/App.tsx:2672-2792`, `authenticator/packages/ui/src/App.tsx:2758-2771`, `authenticator/packages/ui/src/App.tsx:1666-1752`.
- Step by step:

```text
Open Security
-> choose None / Swipe / PIN / Password / Pattern (up to two secure methods)
-> if method missing, inline setup panel appears
-> optionally enable passkey quick unlock and manage passkeys
-> optionally generate backup codes
-> complete Safety Setup to mark configuration done
```

- Decisions and branches:
  - New secure-method selections trigger inline setup if the credential does not exist: `authenticator/packages/ui/src/components/SecurityPicker.tsx:261-309`.
  - New PIN setups are forced to 6 digits; legacy 4-digit PINs remain valid but warned: `authenticator/packages/ui/src/components/SecurityPicker.tsx:311-341`, `authenticator/packages/ui/src/components/SecurityPicker.pin-policy.test.tsx:63-125`.
  - Passkey quick unlock is separated from the two-method selector and only activates when a secure base method exists: `authenticator/packages/ui/src/components/SecurityPicker.tsx:433-457`, `authenticator/packages/ui/src/components/SecurityPicker.pin-policy.test.tsx:127-150`.
  - Safety Setup only auto-opens for unprotected vaults and adds a 24-hour reminder after skip: `authenticator/packages/ui/src/App.tsx:1014-1019`, `authenticator/packages/ui/src/App.tsx:1705-1752`.
- Feedback states:
  - SecurityPicker uses inline notices, warnings, saved states, and per-passkey rename status chips: `authenticator/packages/ui/src/components/SecurityPicker.tsx:95-111`, `authenticator/packages/ui/src/components/SecurityPicker.tsx:930-1095`.
  - Safety Setup uses progress, warnings vs safe cards, and explicit recommended defaults: `authenticator/packages/ui/src/components/SafetySetupModal.tsx:174-239`, `authenticator/packages/ui/src/components/SafetySetupModal.tsx:244-295`.
- Success state: settings are saved, backup codes can be generated, and the app marks Safety Setup complete with a success banner: `authenticator/packages/ui/src/App.tsx:2284-2300`.
- Failure state: unsupported capability or invalid setup shows inline warnings and does not silently degrade: `authenticator/packages/ui/src/components/SecurityPicker.tsx:444-452`, `authenticator/packages/ui/src/components/SecurityPicker.tsx:626-627`.
- Empty states:
  - `No passkeys registered yet`: `authenticator/packages/ui/src/components/SecurityPicker.tsx:1033-1040`.
  - `No backup codes yet`: `authenticator/packages/ui/src/components/SecurityPicker.tsx:1069-1074`.
- Edge cases:
  - Mobile bridge only truly supports PIN and rejects secondary methods, password, and pattern even though the shared UI exposes them: `authenticator/apps/mobile/src/mobile-bridge.ts:528-543`.
- Opportunities for reuse: the SecurityPicker plus Safety Setup pair is valuable beyond auth apps because it turns a complicated settings area into a guided decision system.

### Flow F: Backup Export, Import, and Recovery Codes

- Goal of the user: preserve vault state and recover access later.
- Entry point: Accounts settings for encrypted backup, Security settings or Safety Setup for backup codes: `authenticator/packages/ui/src/App.tsx:2898-2935`, `authenticator/packages/ui/src/App.tsx:2774-2792`, `authenticator/packages/ui/src/components/SafetySetupModal.tsx:459-484`.
- Step by step:

```text
Accounts -> enter passphrase -> Export Encrypted Backup / Import Encrypted Backup
Security -> Create Backup Codes
-> [existing codes?] yes -> confirm replacement
-> one-time review dialog -> copy codes / acknowledge saved
```

- Decisions and branches:
  - Import mode is `merge` or `replace`: `authenticator/packages/ui/src/App.tsx:2912-2923`.
  - Backup codes are only available when PIN-based recovery is enabled: `authenticator/packages/ui/src/App.tsx:1932-1950`, `authenticator/packages/ui/src/components/SecurityPicker.tsx:1056-1087`.
- Feedback states:
  - Export/import actions show success, cancel, or failure banners: `authenticator/packages/ui/src/App.tsx:2004-2037`.
  - Backup dialog explicitly warns that codes work once and must be saved immediately: `authenticator/packages/ui/src/App.tsx:3147-3174`.
- Success state: encrypted file saved/imported, or backup codes copied/saved.
- Failure state: passphrase and file errors surface as `UiError` banners; invalid recovery code remains blocked: `authenticator/apps/mobile/src/mobile-bridge.ts:55-83`, `authenticator/packages/ui/src/App.tsx:1982-2037`.
- Empty states: no backup codes yet -> warning row and CTA: `authenticator/packages/ui/src/components/SecurityPicker.tsx:1069-1085`.
- Edge cases:
  - Creating a new set invalidates the old set immediately: `authenticator/packages/ui/src/App.tsx:3201-3204`, `authenticator/packages/ui/src/components/SafetySetupModal.tsx:465-470`.
- Opportunities for reuse: the one-time recovery-code review dialog is a strong pattern for any secret that cannot be safely re-shown later.

## 4. Screen-by-Screen UX Breakdown

### Main Vault Screen

- Screen name: Vault Authenticator home
- Purpose: the primary working surface for scanning accounts and copying codes.
- Main user tasks: read current codes, copy a code, open add/edit/delete/search/settings.
- Primary CTA: floating menu -> `Add account`; per-row primary micro-CTA is the OTP pill itself.
- Secondary actions: copy button, edit, delete, search, clear clipboard, lock app.
- Information hierarchy: brand/title -> account count pill -> list container -> per-row issuer/label -> OTP pill -> inline actions.
- Layout structure: centered `auth-card`, scrollable list area, bottom-right floating menu: `authenticator/packages/ui/src/App.tsx:2407-2494`, `authenticator/packages/ui/src/ui.css:696-705`, `authenticator/packages/ui/src/ui.css:974-1005`.
- Key components used: `AccountRow`, `HeaderMenu`, toast host.
- State variations: secure loading, empty, skeleton, list/grid, locked overlay above shell.
- Validation/error handling: banners handle clipboard, backup, import/export, scan, and general bridge failures: `authenticator/packages/ui/src/App.tsx:2373-2403`.
- Why it is designed this way: it keeps the core job inside one static frame and makes all secondary tasks feel additive rather than navigational.

### Lock Screen

- Purpose: protect the vault without leaving the app shell.
- Main user tasks: unlock via PIN/password/pattern/swipe/passkey/recovery code.
- Primary CTA: mode-specific unlock action (`Unlock`, `Unlock with Passkey`, `Submit`, or complete the swipe gesture).
- Secondary actions: "Other ways to sign in", back to primary mode, show/hide password, clear PIN.
- Information hierarchy: lock icon/title -> status chip and helper -> mode-specific input -> alternate methods.
- Layout structure: single centered card with animated status state and bottom alternate-method tray: `authenticator/packages/ui/src/components/LockScreen.tsx:821-1096`, `authenticator/packages/ui/src/ui.css:740-899`, `authenticator/packages/ui/src/ui.css:3607-3816`.
- Key components: `PatternLock`, PIN keypad, passkey button, alternate-method menu.
- State variations: loading, verifying, error, lockout countdown, unlocking success, alternate modes.
- Validation/error handling: hard client-side constraints for PIN length and backup-code shape; server/bridge verification for actual unlock: `authenticator/packages/ui/src/components/LockScreen.tsx:411-518`, `authenticator/packages/ui/src/components/LockScreen.tsx:872-1092`.
- Why it is designed this way: it gives the lock flow enough space to feel trustworthy and recoverable, especially when multiple auth methods exist.

### Add Account Modal

- Purpose: collect a new account through the least painful ingestion path.
- Main user tasks: paste URI, enter account manually, or scan QR.
- Primary CTA: method-dependent add/scan button.
- Secondary actions: switch method tabs, open camera instead, cancel.
- Information hierarchy: title -> method chooser cards -> method-specific fields -> error block -> footer actions.
- Layout structure: classic modal with nested screen-scan overlay: `authenticator/packages/ui/src/components/AddModal.tsx:468-775`.
- Key components: method cards, `ThemedSelect`, inline error blocks, scan preview.
- State variations: URI, manual, scan intro, scan in progress, scan failure, scan confirm.
- Validation/error handling: manual flow enforces Base32 secret; scan flow blocks unsupported QR content and offers retry tips: `authenticator/packages/ui/src/components/AddModal.tsx:316-343`, `authenticator/packages/ui/src/components/AddModal.tsx:699-712`.
- Why it is designed this way: the design de-risks setup by meeting users where the source data exists instead of forcing one canonical input path.

### Screen-Scan Overlay

- Purpose: turn desktop QR capture into a guided subflow rather than a silent system action.
- Main user tasks: start selection, retry, review decoded account, confirm add.
- Primary CTA: `Start selection`, then `Add account` after preview.
- Secondary actions: cancel, back, retry, camera fallback when available.
- Information hierarchy: title -> tips -> live status -> error or preview card -> actions.
- Layout structure: nested modal inside AddModal overlay: `authenticator/packages/ui/src/components/AddModal.tsx:659-775`.
- Why it is designed this way: it makes a technically opaque capture/decode action feel inspectable and safe.

### Command Palette

- Purpose: fast keyboard-driven search and copy.
- Main user tasks: search accounts and copy without scanning the full list.
- Primary CTA: hitting Enter on the active result.
- Secondary actions: arrow-key navigation, Escape close, mouse hover to change active result.
- Information hierarchy: title/shortcut -> search field -> results list.
- Layout structure: narrow dialog with dedicated results scroller: `authenticator/packages/ui/src/components/CommandPalette.tsx:124-179`.
- State variations: idle, busy, empty results.
- Why it is designed this way: it short-circuits list navigation for experienced users and tray-driven workflows.

### Settings Modal

- Purpose: house all non-core daily tasks in one consistent management surface.
- Main user tasks: adjust appearance, security, account defaults, desktop behavior, diagnostics.
- Primary CTA: no single CTA; each control saves inline.
- Secondary actions: switch categories, rerun Safety Setup, export/import backup, lock now.
- Information hierarchy: category rail -> section header -> grouped fields -> inline notes and warnings.
- Layout structure: left rail on desktop/tablet, top toggle on narrow mobile widths: `authenticator/packages/ui/src/App.tsx:2549-3095`, `authenticator/packages/ui/src/ui.css:2511-2648`, `authenticator/packages/ui/src/ui.css:5057-5088`.
- Key components: `ThemedSelect`, `SecurityPicker`, checkbox cards, meta rows.
- State variations: five categories, compact nav, inline errors.
- Validation/error handling: select lists constrain values; backup passphrase/import errors surface via banners or `auth-error` blocks.
- Why it is designed this way: the app keeps the home screen task-focused and moves configuration into a reusable side-rail shell.

### Safety Setup Modal

- Purpose: guide users from an unsafe default to a credible protection posture.
- Main user tasks: understand risk, choose a real lock, create recovery, confirm safe defaults.
- Primary CTA: step-based forward actions (`Set up protection`, `Continue`, `Mark setup complete`).
- Secondary actions: skip/close, go back, run security tasks inline.
- Information hierarchy: walkthrough header/progress -> left rail status/map -> current stage content.
- Layout structure: wide split-view modal that collapses to one column at smaller widths: `authenticator/packages/ui/src/components/SafetySetupModal.tsx:174-239`, `authenticator/packages/ui/src/ui.css:2027-2149`, `authenticator/packages/ui/src/ui.css:4708-4847`.
- Key components: step rail, callout blocks, embedded `SecurityPicker`, safe-defaults form.
- State variations: intro, lock, recovery, done.
- Validation/error handling: uses the same underlying security and settings controls as the main settings modal, so it inherits real validation rather than fake tutorial state.
- Why it is designed this way: it reduces abandonment by teaching while the user is configuring, not before.

### Backup Codes Dialog and Replace Confirmation

- Purpose: force careful review of recovery codes and make replacement risk obvious.
- Main user tasks: copy/save codes; confirm replacement.
- Primary CTA: `Copy Codes` or `Create New Backup Codes`.
- Secondary actions: `Done - I saved them`, `Cancel`.
- Information hierarchy: warning text -> code chips -> confirmation actions.
- Layout structure: small confirm-style modal optimized for high-friction acknowledgement: `authenticator/packages/ui/src/App.tsx:3127-3222`.
- Why it is designed this way: recovery codes are sensitive and one-time visible, so the UI slows the user down on purpose.

### Delete Confirmation

- Purpose: protect against irreversible account removal.
- Main user tasks: confirm or cancel deletion.
- Primary CTA: destructive delete button.
- Secondary actions: cancel.
- Information hierarchy: title -> named account -> irreversible warning -> optional error -> actions.
- Layout structure: compact confirm modal with warning icon: `authenticator/packages/ui/src/App.tsx:3224-3278`.
- Why it is designed this way: the app uses the minimum viable friction for a destructive action without adding another page.

## 5. Component Inventory

| Component | Where it appears | Variants | Visual behavior | Interaction behavior | Reuse priority | Notes for rebuilding |
| --- | --- | --- | --- | --- | --- | --- |
| Buttons | Across all modals and settings | `primary`, `subtle`, `ghost`, `danger` | Large rounded controls, slight lift on hover, opacity drop on disabled: `authenticator/packages/ui/src/ui.css:1171-1247` | Text + icon pairing is standard; motion is subtle and consistent | High | Extract directly as a primitive |
| Icon button | Modal close buttons, title bar | Neutral, close | Circular/square icon-only controls: `authenticator/packages/ui/src/ui.css:2720-2737` | Used for dismiss and window chrome | Medium | Keep separate from normal buttons |
| Inputs / textarea | Add, edit, settings, lock | text, password, numeric, textarea | Flat card-colored input with strong focus halo: `authenticator/packages/ui/src/ui.css:2995-3024` | Inline validation text lives outside field | High | Good shared primitive |
| Select | Settings, add/edit forms | standard dropdown | Portal menu, same card surface styling as app: `authenticator/packages/ui/src/components/ThemedSelect.tsx:182-247`, `authenticator/packages/ui/src/ui.css:3073-3178` | Keyboard navigable, viewport-aware placement | High | Strong candidate for shared library |
| Cards | Main shell, lock card, settings cards, passkey cards, safety cards | shell card, row card, status card, passkey card | Large radius, bordered surfaces, gradient fills, shadows | Some cards lift on hover or pulse subtly | High | Tokenize surface variants |
| Account row | Vault list | normal, pending, copied, failed, compact, list vs grid | Rich row background, mono OTP pill, progress bar: `authenticator/packages/ui/src/ui.css:1459-1832` | Copy/edit/delete inline; container query reflow | High | Rebuild nearly exactly |
| Tabs / method chooser | Add account modal | URI, Manual, Scan | Card-like tabs rather than thin underlines: `authenticator/packages/ui/src/components/AddModal.tsx:486-503` | Click-to-switch; no deep routing | Medium | Good for task-mode switching |
| Modals | Add, edit, settings, confirm, Safety Setup | standard, confirm, settings, nested scan overlay | Blurred overlay, elevated surface, enter/exit translate and fade: `authenticator/packages/ui/src/ui.css:1834-2019` | Outside click closes most; Escape supported | High | Build one modal shell with variants |
| Toasts / banners | Global top-right host | success, info, error, countdown | Rounded banners with status-specific border tints: `authenticator/packages/ui/src/ui.css:1291-1380` | Stack, dismissible, countdown-friendly | High | Excellent reusable feedback system |
| Tooltips / metadata | Account names | native `title` + sr-only text | No custom tooltip widget found | Long text preserved via title attrs and sr-only node | Low | Replace with richer tooltip only if needed |
| Navigation bar | Desktop title bar | with optional app icon and always-on-top pin | Frosted top bar with custom window controls: `authenticator/packages/ui/src/components/CustomTitleBar.tsx:102-177` | Double-click maximize; explicit window commands | Medium | Desktop-specific, not broadly portable |
| Sidebar / rail | Settings and Safety Setup | desktop left rail, mobile toggle | Bordered side rail with active card states: `authenticator/packages/ui/src/ui.css:2518-2648`, `authenticator/packages/ui/src/ui.css:2095-2149` | Collapses responsively, no router | High | Very reusable for settings and onboarding |
| Search UI | Command palette | idle, busy, empty | Compact dialog with live listbox: `authenticator/packages/ui/src/components/CommandPalette.tsx:124-179` | Fuzzy search, arrow navigation, Enter select | High | Extract as a generic command/search primitive |
| Lists | Account list, passkey list, safety step list | list, grid, horizontal step list | CSS variable columns and container queries | No pagination; live updates | High | Reusable pattern family |
| Detail panels | Scan preview, passkey card, advanced meta rows | preview, card, key-value rows | Compact secondary cards inside parent flows | Used for review before commit | Medium | Reuse as utility panels |
| Empty state blocks | Vault, passkeys | empty icon + title + help text | Small, centered, icon-led: `authenticator/packages/ui/src/App.tsx:2449-2455`, `authenticator/packages/ui/src/components/SecurityPicker.tsx:1033-1040` | Passive guidance only | Medium | Easy to standardize |
| Skeleton loaders | Initial vault list | skeleton rows | Mimic final list layout to avoid jank: `authenticator/packages/ui/src/App.tsx:2427-2447` | Used only on first load | Medium | Keep same shape if copying shell |
| Visual data widget | TOTP progress bar | standard fill only | Gradient bar scaled via transform, not width: `authenticator/packages/ui/src/components/AccountRow.tsx:30-52`, `authenticator/packages/ui/src/__tests__/clipboard.test.ts:187-205` | Accessible `progressbar` semantics | High | Good compact status component |
| Pattern lock | Lock and security setup | set, verify, error, success | 3x3 gesture grid with SVG path: `authenticator/packages/ui/src/components/PatternLock.tsx:64-252` | Pointer-first interaction | Medium | Portable, but add keyboard fallback if accessibility matters |
| PIN keypad | Lock screen | 4-digit and 6-digit variants | Fixed 3x4 circular keypad: `authenticator/packages/ui/src/components/LockScreen.tsx:930-1013`, `authenticator/packages/ui/src/ui.css:3971-4042` | Auto-submit on completion, backspace hold, clear control | High | Rebuild as its own module |
| Drawers | Not found | None | None | None | N/A | No drawer pattern in current app |
| Tables | Not found | None | None | None | N/A | No table pattern in current app |
| Charts | Not found beyond OTP progress bars | None | None | None | N/A | Only lightweight progress/status widgets exist |

## 6. Design System Extraction

### Typography

- Base body font: `Inter`, then `Segoe UI`, `Helvetica Neue`, `Arial`, sans-serif: `authenticator/packages/ui/src/ui.css:13-18`.
- Code font: `JetBrains Mono`, `Cascadia Mono`, `Consolas`, monospace for OTP values: `authenticator/packages/ui/src/ui.css:1613-1619`.
- Type scale visible in CSS:

| Role | Value | Evidence |
| --- | --- | --- |
| Eyebrow / overline | `0.68rem`, uppercase, `0.16em` tracking | `authenticator/packages/ui/src/ui.css:935-942` |
| Micro labels / meta | `0.72rem` to `0.78rem` | `authenticator/packages/ui/src/ui.css:830-851`, `authenticator/packages/ui/src/ui.css:3031-3035` |
| Body / button | `0.82rem` to `0.9rem` | `authenticator/packages/ui/src/ui.css:1337-1339`, `authenticator/packages/ui/src/ui.css:1171-1186` |
| Modal titles | `1.04rem` | `authenticator/packages/ui/src/ui.css:2701-2705` |
| Main app title | `clamp(1.18rem, 2.2vw, 1.58rem)` | `authenticator/packages/ui/src/ui.css:944-953` |
| Lock title | `clamp(20px, 2.6vw, 28px)` | `authenticator/packages/ui/src/ui.css:955-960` |
| OTP value | `1.02rem`, mono, bold | `authenticator/packages/ui/src/ui.css:1613-1619` |

### Color System

- Semantic surface tokens drive the UI: `--surface-page`, `--surface-card`, `--surface-card-alt`, `--surface-border`, `--surface-border-strong`, `--text-primary`, `--text-secondary`, `--text-muted`: `authenticator/packages/ui/src/ui.css:67-82`.
- Status colors are direct and readable: success `#22c55e`, danger `#ef4444`, warning `#f59e0b`: `authenticator/packages/ui/src/ui.css:60-65`.
- Theme color is not just a brand accent; it blends into surfaces via `color-mix`, which makes each theme feel like a tinted atmosphere rather than a flat accent swap: `authenticator/packages/ui/src/ui.css:67-88`.
- Theme modes: Light, Dark, Amoled: `authenticator/packages/ui/src/bridge.ts:24-30`, `authenticator/packages/ui/src/ui.css:145-247`.
- Theme-color palette: 23 values from `neutral` through `purple`: `authenticator/packages/ui/src/bridge.ts:32-58`, `authenticator/packages/ui/src/App.theme.test.tsx:258-305`.
- Accent override palette: 19 values plus `theme` and `none`: `authenticator/packages/ui/src/bridge.ts:60-82`.

### Spacing, Radius, Shadow, and Borders

- Radius system: `9px`, `14px`, `20px`, `22px`, and `999px`: `authenticator/packages/ui/src/ui.css:90-94`.
- Control heights: `40px` and `32px`: `authenticator/packages/ui/src/ui.css:96-97`.
- Shadow system: `--shadow-sm`, `--shadow-md`, `--shadow-lg`: `authenticator/packages/ui/src/ui.css:117-119`.
- Practical spacing rhythm inferred from repeated values: 6, 8, 10, 12, 14, 16, 18, 20, 24px are the dominant layout increments across buttons, fields, rails, banners, and cards.

### Grid and Layout Principles

- Main shell is centered and capped at `1200px`: `authenticator/packages/ui/src/ui.css:113`, `authenticator/packages/ui/src/ui.css:696-705`.
- Account rows are grid-based, with `main / pill / actions` on wide containers and `main+actions / pill` on narrow containers: `authenticator/packages/ui/src/ui.css:1510-1516`, `authenticator/packages/ui/src/ui.css:1800-1832`.
- Settings and Safety Setup both use rail-plus-content layouts that collapse to single-column on smaller widths: `authenticator/packages/ui/src/ui.css:2090-2104`, `authenticator/packages/ui/src/ui.css:2511-2518`, `authenticator/packages/ui/src/ui.css:4708-4869`.

### Responsive Behavior and Breakpoints

| Breakpoint / rule | Behavior | Evidence |
| --- | --- | --- |
| `<720px` | auto layout becomes list | `authenticator/packages/ui/src/App.tsx:346-350` |
| `>=900px` | auto grid can use 2 columns | `authenticator/packages/ui/src/App.tsx:352-367` |
| `>=1320px` | auto grid can use 3 columns | `authenticator/packages/ui/src/App.tsx:355-367` |
| `account-row <=560px` | row reflows to stacked pill under metadata/actions | `authenticator/packages/ui/src/ui.css:1800-1832` |
| `<=860px` | settings become single-column; Safety Setup becomes single-column; field rows stack | `authenticator/packages/ui/src/ui.css:4708-4869` |
| `<=560px` | smaller shell paddings, full-width modals, collapsible settings category list, stacked Safety Setup footer | `authenticator/packages/ui/src/ui.css:4872-5047`, `authenticator/packages/ui/src/ui.css:5057-5088` |
| `<=1100px` | Safety Setup modal narrows but stays split | `authenticator/packages/ui/src/ui.css:2491-2504` |

### Motion and Animation Patterns

- Root-level motion control uses `data-motion` and `data-paused`: `authenticator/packages/ui/src/App.tsx:847-861`.
- System motion resolves to `reduced` when OS prefers reduced motion or when low-end hardware hints are present: `authenticator/packages/ui/src/App.tsx:185-210`, `authenticator/packages/ui/src/App.motion.test.tsx:149-187`.
- Ambient motion patterns include background orbs, card rise-in, surface-in stagger, lock pulse, row color shift, and subtle floating arrows: `authenticator/packages/ui/src/ui.css:139-143`, `authenticator/packages/ui/src/ui.css:1483-1488`, `authenticator/packages/ui/src/ui.css:4294-4299`, `authenticator/packages/ui/src/ui.css:4142-4158`.
- `data-motion="off"` hard-disables animation and zeroes durations; `data-paused="true"` pauses animations and removes transitions while backgrounded: `authenticator/packages/ui/src/ui.css:5214-5239`.

### Theme Handling

- Base mode, theme color, accent override, and motion mode all live in `AppSettings`: `authenticator/packages/ui/src/bridge.ts:300-355`.
- Amoled mode forcibly disables accent/theme overrides and collapses to `accentOverride: none`: `authenticator/packages/ui/src/App.tsx:2612-2633`, `authenticator/packages/ui/src/App.theme.test.tsx:226-255`.

### Accessibility Signals Visible in Code

- Dialog semantics, `aria-modal`, live regions, and progressbar roles are used consistently: `authenticator/packages/ui/src/components/CommandPalette.tsx:126-131`, `authenticator/packages/ui/src/components/EditModal.tsx:66-72`, `authenticator/packages/ui/src/components/AccountRow.tsx:35-49`.
- The `ui-focus` utility and dedicated focus styles are applied broadly: `authenticator/packages/ui/src/ui.css:644-647`, `authenticator/packages/ui/src/ui.css:1534-1538`.
- Weak spot: pattern lock is pointer-first and does not expose a keyboard alternative in its own component: `authenticator/packages/ui/src/components/PatternLock.tsx:127-183`.

## 7. Interaction Patterns

| Pattern | Rule in this app | Evidence | Portability |
| --- | --- | --- | --- |
| Hover | Cards and buttons lift slightly or brighten border/background | `authenticator/packages/ui/src/ui.css:1518-1521`, `authenticator/packages/ui/src/ui.css:1194-1196`, `authenticator/packages/ui/src/ui.css:4018-4022` | High |
| Focus | Focus rings are explicit and accent-tinted | `authenticator/packages/ui/src/ui.css:1534-1538`, `authenticator/packages/ui/src/ui.css:3014-3018`, `authenticator/packages/ui/src/ui.css:4033-4036` | High |
| Disabled | Components reduce opacity and disable pointer semantics rather than visually disappearing | `authenticator/packages/ui/src/ui.css:1202-1205`, `authenticator/packages/ui/src/ui.css:3093-3096`, `authenticator/packages/ui/src/ui.css:4038-4042` | High |
| Loading | Loading always includes both a spinner/icon and text label | `authenticator/packages/ui/src/App.tsx:2346-2348`, `authenticator/packages/ui/src/components/AddModal.tsx:684-689`, `authenticator/packages/ui/src/components/LockScreen.tsx:885-887` | High |
| Success / error feedback | Use inline states for local actions and toast banners for global outcomes | `authenticator/packages/ui/src/components/AccountRow.tsx:223-230`, `authenticator/packages/ui/src/App.tsx:2373-2403` | High |
| Form validation | Keep validation close to the control and use concrete instructions plus error code | `authenticator/packages/ui/src/components/EditModal.tsx:150-153`, `authenticator/packages/ui/src/components/AddModal.tsx:317-323` | High |
| Progressive disclosure | Alternate auth methods, passkey setup, scan preview, settings categories, and Safety Setup steps only appear when relevant | `authenticator/packages/ui/src/components/LockScreen.tsx:1054-1092`, `authenticator/packages/ui/src/components/SecurityPicker.tsx:883-1043`, `authenticator/packages/ui/src/components/SafetySetupModal.tsx:244-535` | High |
| Inline editing | Passkey names edit in-place on the card and expose explicit unsaved/saved states | `authenticator/packages/ui/src/components/SecurityPicker.tsx:930-1031`, `authenticator/packages/ui/src/components/SecurityPicker.passkey.test.tsx:116-193` | Medium |
| Search and filtering | Fuzzy match on issuer/label with keyboard navigation and hard result cap | `authenticator/packages/ui/src/components/CommandPalette.tsx:14-56`, `authenticator/packages/ui/src/components/CommandPalette.tsx:85-120` | High |
| Pagination / infinite scroll | Not present; list sizes are expected to remain manageable | No pagination code found in `authenticator/packages/ui/src/App.tsx` | N/A |
| Drag and drop | Not present in the app shell; desktop QR scan uses drag-select outside the React UI | `authenticator/apps/desktop/src/main/screen-qr.ts:38-171` | Low |
| Keyboard shortcuts | `Ctrl+K` for search; Escape closes overlays; Arrow/Home/End navigate menus and selects | `authenticator/packages/ui/src/App.tsx:1401-1416`, `authenticator/packages/ui/src/components/HeaderMenu.tsx:387-455`, `authenticator/packages/ui/src/components/ThemedSelect.tsx:155-175` | High |
| Desktop vs mobile differences | Desktop adds tray, title bar, screen scan, always-on-top; mobile adds camera scan and secure storage, but only PIN lock is really supported | `authenticator/apps/desktop/src/main.ts:618-723`, `authenticator/apps/mobile/src/mobile-bridge.ts:495-546`, `authenticator/apps/mobile/src/scanner.ts:1-27` | Critical to handle during port |

## 8. UX Heuristics Analysis

| Heuristic | Strong in current app | Fragile in current app | Porting note |
| --- | --- | --- | --- |
| Clarity | One primary screen, clear labels, obvious add/search/settings affordances | Some security copy becomes dense inside Settings | Preserve the single-shell structure; trim copy only if the new product is less security-sensitive |
| Consistency | Shared tokens, consistent button styles, common modal shell, same select primitive everywhere | `App.tsx` centrally owns many states, so consistency is partly accidental rather than fully systemized | Split shell orchestration from primitive library during extraction |
| Learnability | Safety Setup explains what to do and why, not just where to click | Power features like tray commands and alternate sign-in methods are discoverable mostly through the menu | Keep Safety Setup and add stronger affordance for shortcuts if the next app targets broader users |
| Feedback | Excellent toast/banner system, per-control states, one-time backup warnings, unlock status text | Some success states depend on timing animation rather than immediate navigation | Preserve both local and global feedback layers |
| Efficiency | Copy is one click, search is one shortcut, add flow supports URI/manual/scan | Settings and security can feel dense for quick tasks | Keep fast paths on the home screen and move only low-frequency admin actions into settings |
| Error prevention | Scan confirm, delete confirm, backup-code replacement warning, clipboard conditional clear | Mobile shared UI exposes unsupported security options before the bridge rejects them | Add capability-based filtering before porting to mobile or feature-limited contexts |
| Accessibility | Dialog semantics, focus management, live regions, listbox semantics, progressbar semantics | Pattern lock lacks keyboard parity; heavy reliance on native `title` for long text help | Add accessible fallback inputs for gesture-only auth patterns |
| Cognitive load | Daily use is light because the home screen stays minimal | Security settings can spike in complexity when passkeys, multiple methods, and backup rules show together | Treat SecurityPicker as a specialized expert surface, not a generic settings block |
| Reusability | Tokens, select/menu/palette primitives, banners, account rows, settings rail are all extractable | Core shell is still monolithic and bridge-coupled | Extract primitives and patterns first; recompose app shell later |

## 9. Rebuild Guidance

### Patterns to copy almost exactly

1. The main vault card layout and account row composition.
2. The lock overlay choreography and alternate-method menu.
3. The floating action/menu plus command palette combination.
4. The settings rail pattern and category taxonomy.
5. The banner/toast host and status language model.
6. The Safety Setup multi-step guidance flow.

### Patterns to adapt

- Desktop title bar and tray behavior are product-shell specific: `authenticator/packages/ui/src/components/CustomTitleBar.tsx:102-177`, `authenticator/apps/desktop/src/main.ts:618-723`.
- Security vocabulary like passkeys, backup codes, privacy screen, and lock-on-focus-loss is reusable only if the new app is also security-sensitive.
- Mobile lock capabilities should be capability-driven, not copied blindly from the shared UI: `authenticator/apps/mobile/src/mobile-bridge.ts:528-543`.

### Components that should become a shared design system

- `ThemedSelect`
- modal shells (`auth-modal`, `auth-confirm-modal`, `auth-settings-modal`)
- `HeaderMenu`
- `CommandPalette`
- `AccountRow` and the OTP progress widget
- button, input, checkbox-card, pill, and banner primitives
- settings rail and safety-step primitives

### Flows that should remain unchanged

- Add account via URI/manual/scan.
- Search and copy with keyboard shortcut.
- Recovery-code generation and one-time review.
- Safety Setup auto-open for unprotected states.

### Parts that should be simplified before or during reuse

- Break `authenticator/packages/ui/src/App.tsx` into orchestration modules. It currently owns too much modal, banner, settings, and platform coordination logic.
- Move capability filtering into the UI layer so unsupported mobile options never appear.
- Formalize a reusable banner API and modal stack instead of hard-coded booleans.

### UI dependencies that may block reuse

- `Bridge` and `LockApi` contracts: `authenticator/packages/ui/src/bridge.ts:407-419`.
- Electron window controls and tray app commands: `authenticator/apps/desktop/src/preload.ts:112-172`, `authenticator/apps/desktop/src/main.ts:618-723`.
- Passkey / WebAuthn support: `authenticator/packages/ui/src/components/SecurityPicker.tsx:158-161`, `authenticator/packages/ui/src/components/LockScreen.tsx:348-358`.
- Clipboard APIs and screen capture support.
- CSS support for `color-mix` and container queries in the destination runtime.

## 10. Visual Deliverable

### Screen Matrix Summary

| Primary | Secondary | Creation | Management | Onboarding / review |
| --- | --- | --- | --- | --- |
| Vault home | Command palette | Add account | Edit account | Safety Setup |
| Lock overlay | Settings | Screen scan overlay | Delete confirm | Backup codes review |
|  | Desktop tray menu |  | Replace backup codes confirm |  |

### Flow Diagrams

```text
Vault use loop
Unlock -> scan list -> copy code -> optionally auto-clear clipboard -> return to list
```

```text
Add flow
Menu / tray -> Add Account -> [URI | Manual | Scan]
-> validate -> optimistic placeholder row -> refresh list
```

```text
Safety flow
Unsafe state detected -> Safety Setup intro -> lock selection -> recovery/defaults -> mark complete
```

```text
Desktop scan flow
Tray or menu -> open scan mode -> drag-select overlay window -> image capture -> QR decode
-> no QR -> retry
-> decoded otpauth -> preview -> confirm add
```

### Wireframe-Like Descriptions

```text
Main Vault
[optional desktop title bar]
[toast stack, top-right]
[centered large card]
  [brand dot + Vault Authenticator]
  [account count pill]
  [empty state | skeleton rows | list/grid rows]
[floating menu button, bottom-right]
```

```text
Lock Screen
[full-screen translucent overlay]
  [centered lock card]
    [animated lock icon]
    [status message]
    [Lock: current method chip]
    [mode helper text]
    [PIN keypad | password row | pattern pad | passkey button | swipe area]
    [Other ways to sign in]
```

```text
Settings
[overlay]
  [settings modal]
    [header]
    [left rail or mobile category toggle]
    [scrollable right panel]
      [section title]
      [field grid]
      [inline notes / warnings / actions]
    [close footer]
```

```text
Safety Setup
[wide modal]
  [header + progress bar]
  [status rail / step map on left]
  [current step content on right]
  [back / continue / complete footer]
```

## Top 10 UX Patterns Worth Reusing

1. Single secure home screen with overlays instead of deep route transitions.
2. Account row that treats the OTP pill itself as a primary action.
3. Keyboard-first search palette alongside mouse-first list browsing.
4. Safety Setup as a guided remediation flow triggered by real protection state.
5. Inline setup panels that appear only when a selected security method is not configured.
6. One-time recovery-code review with explicit save acknowledgement.
7. Conditional clipboard auto-clear that checks whether clipboard content changed first.
8. Desktop QR capture that requires user review before committing the account.
9. Settings category rail that collapses to a compact mobile chooser without changing the IA.
10. Alternate sign-in menu in the lock screen instead of burying fallback methods in settings.

## Top 10 UI Components Worth Extracting into a Shared Library

1. `ThemedSelect`
2. `AccountRow`
3. `HeaderMenu`
4. `CommandPalette`
5. modal / confirm / settings shells
6. toast host and banner cards
7. settings rail items and toggle
8. OTP progress bar
9. PIN keypad and dot row
10. Safety step rail / status cards

## Critical Screens to Replicate First

1. Main vault screen
2. Lock overlay
3. Add account modal with scan confirmation
4. Settings shell with category rail
5. Safety Setup walkthrough

## Hidden Interaction Logic Discovered in Code

1. Safety Setup auto-opens only when the vault is still unprotected and the user has neither completed nor skipped it: `authenticator/packages/ui/src/App.tsx:1014-1019`.
2. If the user skips Safety Setup, the app stores a reminder timestamp and waits 24 hours before nudging again: `authenticator/packages/ui/src/App.tsx:1705-1752`.
3. Locking the app immediately closes all open transient UI, including add, search, settings, delete, and backup dialogs: `authenticator/packages/ui/src/App.tsx:1101-1116`.
4. OTP codes stop refreshing while the app is backgrounded when motion pause is enabled: `authenticator/packages/ui/src/App.tsx:900-931`.
5. Clipboard auto-clear only erases the clipboard if the copied code is still present; it will not destroy unrelated clipboard content: `authenticator/packages/ui/src/__tests__/clipboard.test.ts:108-183`.
6. New PIN setups require 6 digits, but legacy 4-digit PINs still unlock and trigger a warning rather than forced migration: `authenticator/packages/ui/src/components/SecurityPicker.pin-policy.test.tsx:63-125`.
7. Passkey quick unlock is deliberately outside the two-lock-method selector; it is treated as a fast secondary affordance, not a primary protection model: `authenticator/packages/ui/src/components/SecurityPicker.pin-policy.test.tsx:127-150`.
8. Desktop screen scan intentionally adds a confirm step after QR decode instead of creating the account immediately: `authenticator/packages/ui/src/components/AddModal.test.tsx:146-176`.
9. Settings category navigation changes shape twice: single-column layout at `<=860px`, then collapsible category list at `<=560px`: `authenticator/packages/ui/src/ui.css:4708-4869`, `authenticator/packages/ui/src/ui.css:5057-5088`.
10. Motion system can silently downgrade to reduced mode on low-end hardware when the user leaves motion on `System`: `authenticator/packages/ui/src/App.tsx:192-210`, `authenticator/packages/ui/src/App.motion.test.tsx:149-187`.

## Risks When Porting This Design to Another App

1. The shell is monolithic; copying `App.tsx` directly will pull in too much auth-specific orchestration.
2. Desktop and mobile feature support are not symmetrical; the shared UI can expose options the mobile bridge rejects: `authenticator/apps/mobile/src/mobile-bridge.ts:528-543`.
3. `color-mix` and container queries are central to the visual quality; older runtimes will need fallback styling.
4. Pattern lock is not keyboard-friendly in its current form.
5. The current copy and safety language is tightly coupled to a security product; reuse in a non-security app will feel overly severe unless adapted.
6. Tray menu, title bar, always-on-top, and privacy-screen behaviors depend on Electron window APIs.
7. The current theming model assumes a dark-first aesthetic even though light mode exists; other products may need a different default mood.
8. Search palette, backup export/import, and passkey flows all assume immediate access to bridge APIs rather than HTTP-backed async workflows.

## UI Reuse Map

| Original screen / component | Purpose | Reuse as-is or adapt | Dependencies | Complexity | Suggested priority |
| --- | --- | --- | --- | --- | --- |
| `auth-root` + shell card | Core product frame | Adapt | tokens, layout CSS | Medium | 1 |
| `AccountRow` | Primary content unit | As-is | OTP data, copy handlers | High | 1 |
| `HeaderMenu` | Quick action launcher | As-is | menu actions | Medium | 1 |
| `CommandPalette` | Fast search/copy | As-is | search dataset, copy handler | Medium | 1 |
| `ThemedSelect` | Shared form primitive | As-is | none beyond portal target | Medium | 1 |
| Lock overlay + `LockScreen` | Re-entry / secure access | Adapt | auth provider, credential APIs | High | 2 |
| Add modal | Multi-method creation | Adapt | add handlers, scanner APIs | High | 2 |
| Settings shell | Secondary management IA | As-is | category definitions | Medium | 2 |
| `SecurityPicker` | Complex protection config | Adapt | auth platform capabilities | High | 3 |
| `SafetySetupModal` | Guided onboarding/remediation | Adapt | security settings and copy | High | 3 |
| Backup code dialogs | Recovery confirmation | As-is for secret flows, else adapt | secret generation/export | Low | 3 |
| `CustomTitleBar` | Desktop window chrome | Adapt or replace | Electron window API | Medium | 4 |
| Desktop screen scan overlay | Screen-area QR capture | Adapt | Electron, screen capture, `jsQR` | High | 4 |

## Design Token Extraction Table

| Token name | Value | Where found | Usage examples | Migrate or replace |
| --- | --- | --- | --- | --- |
| `--radius-sm` | `9px` | `authenticator/packages/ui/src/ui.css:90` | small buttons, select options | Migrate |
| `--radius-md` | `14px` | `authenticator/packages/ui/src/ui.css:91` | inputs, buttons, settings cards | Migrate |
| `--radius-lg` | `20px` | `authenticator/packages/ui/src/ui.css:92` | account rows, safety cards | Migrate |
| `--radius-xl` | `22px` | `authenticator/packages/ui/src/ui.css:93` | main shell card, lock card | Migrate |
| `--radius-full` | `999px` | `authenticator/packages/ui/src/ui.css:94` | pills, circular buttons, dots | Migrate |
| `--control-height` | `40px` | `authenticator/packages/ui/src/ui.css:96` | standard buttons, inputs, selects | Migrate |
| `--control-height-sm` | `32px` | `authenticator/packages/ui/src/ui.css:97` | compact buttons/menu items | Migrate |
| `--dur-fast` | `120ms` | `authenticator/packages/ui/src/ui.css:99` | hover/focus state changes | Migrate |
| `--dur-base` | `180ms` | `authenticator/packages/ui/src/ui.css:100` | default transitions | Migrate |
| `--dur-slow` | `240ms` | `authenticator/packages/ui/src/ui.css:101` | emphasis transitions | Migrate |
| `--dur-modal` | `220ms` | `authenticator/packages/ui/src/ui.css:102` | modal and overlay enter/exit | Migrate |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | `authenticator/packages/ui/src/ui.css:106` | default transitions | Migrate |
| `--ease-emphasis` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | `authenticator/packages/ui/src/ui.css:107-108` | surface rise-in, emphasized motion | Migrate |
| `--max-content-width` | `1200px` | `authenticator/packages/ui/src/ui.css:113` | shell width cap | Migrate |
| `--surface-page` | computed `color-mix(...)` | `authenticator/packages/ui/src/ui.css:67` | page background | Migrate with browser support check |
| `--surface-card` | computed `color-mix(...)` | `authenticator/packages/ui/src/ui.css:68` | cards, modals, settings panels | Migrate |
| `--surface-card-alt` | computed `color-mix(...)` | `authenticator/packages/ui/src/ui.css:69` | secondary panels, inputs | Migrate |
| `--surface-border` | computed `color-mix(...)` | `authenticator/packages/ui/src/ui.css:71` | nearly every card/control border | Migrate |
| `--text-primary` | dark mode `#e9effa`; light mode `#0f172a` | `authenticator/packages/ui/src/ui.css:74`, `authenticator/packages/ui/src/ui.css:155` | titles, body text | Migrate |
| `--text-secondary` | dark mode `#ced9ea`; light mode `#475569` | `authenticator/packages/ui/src/ui.css:75`, `authenticator/packages/ui/src/ui.css:156` | supporting text | Migrate |
| `--text-muted` | dark mode `#9eacc2`; light mode `#64748b` | `authenticator/packages/ui/src/ui.css:76`, `authenticator/packages/ui/src/ui.css:157` | meta text, notes | Migrate |
| `--color-success` | `#22c55e` | `authenticator/packages/ui/src/ui.css:63` | copied state, safe status | Migrate |
| `--color-danger` | `#ef4444` | `authenticator/packages/ui/src/ui.css:64` | destructive actions, errors | Migrate |
| `--color-warning` | `#f59e0b` | `authenticator/packages/ui/src/ui.css:65` | warnings, Safety Setup caution | Migrate |
| `--pill-min` | `200px` | `authenticator/packages/ui/src/ui.css:21` | minimum width of OTP pill | Adapt if content unit changes |
| `--pill-max` | `clamp(260px, 26vw, 360px)` | `authenticator/packages/ui/src/ui.css:22` | max width of OTP pill | Adapt |
| `--totp-progress-h` | `5px` | `authenticator/packages/ui/src/ui.css:25` | OTP progress bar height | Migrate for status widgets |
| `BASE_MODE_OPTIONS` | `light`, `dark`, `amoled` | `authenticator/packages/ui/src/bridge.ts:24-28` | base theme selection | Migrate |
| `THEME_COLOR_OPTIONS` | `neutral` through `purple` (23 options) | `authenticator/packages/ui/src/bridge.ts:32-56` | theme-color selector | Migrate or trim |
| `ACCENT_OVERRIDE_OPTIONS` | `theme`, `none`, plus 17 overrides | `authenticator/packages/ui/src/bridge.ts:60-80` | accent override selector | Migrate or trim |

## Feature Flow Blueprint

| Feature | Trigger | UI steps | Decision points | System feedback | Completion state |
| --- | --- | --- | --- | --- | --- |
| Unlock | app start, manual lock, privacy lock | load lock method -> render mode -> verify -> unlock animation | primary vs alternate method, passkey available, lockout active | status message, attempts used, countdown, unlocking state | vault visible |
| Add account | menu, tray, command | choose method -> submit URI/manual/scan -> refresh list | scan capability, URI validity, confirm preview | inline error, scanning status, optimistic row | new row added |
| Search and copy | `Ctrl+K`, menu, list | search -> choose result -> copy | clipboard safety enabled, no matches | copied state, banner, optional countdown | code on clipboard |
| Edit account | account row edit | open modal -> change values -> save | validation failure, bridge error | inline error, saving label, success banner | row refreshed |
| Security setup | settings or auto-open | select lock -> finish inline setup -> optional passkey -> backup codes | credential exists, passkey support, method support on platform | notices, warnings, saved states | updated security snapshot |
| Backup export/import | Accounts settings | enter passphrase -> export or import -> refresh state | merge vs replace, passphrase valid, file valid | success/cancel/error banners | backup file handled |
| Recovery codes | Security or Safety Setup | generate -> maybe confirm replacement -> review codes -> copy/save | PIN enabled, existing code set | warning copy, one-time dialog | codes stored and reviewed |

## New App Migration Checklist

### Navigation

- Keep a single primary shell for daily work.
- Recreate modal layering before rebuilding feature details.
- Preserve keyboard search and secondary utility entry points.

### Layout Shell

- Port `auth-root`, shell width constraints, card surfaces, and floating menu anchor.
- Rebuild the title bar only if the destination app is desktop and frameless.

### Component Library

- Extract button, input, select, modal, banner, pill, and row primitives first.
- Move `AccountRow`, `HeaderMenu`, `CommandPalette`, and settings rail into a shared package.

### Forms

- Keep inline note + warning patterns.
- Preserve select menus with keyboard support and portal positioning.

### Feedback States

- Implement both local control-level success/error and global banner feedback.
- Preserve one-time recovery and destructive-confirmation patterns.

### Responsive Rules

- Copy the list/grid breakpoints at 720 / 900 / 1320.
- Keep the 560px account-row container query reflow.
- Preserve settings collapse behavior at 860 and 560.

### Accessibility

- Preserve dialog semantics, live regions, focus-visible styling, and progressbar roles.
- Add a keyboard alternative if pattern lock is reused.

### Theming

- Migrate CSS tokens before component extraction.
- Keep mode, theme color, accent override, and motion as separate concerns.
- Verify `color-mix` and container-query support in the target stack.

### Analytics Hooks

- No analytics instrumentation is visible in the inspected code. Do not assume an existing event model.
- If the new app needs analytics, add hooks around add, copy, search, settings changes, and Safety Setup completion without polluting component primitives.

## Portable UX/UI Blueprint

Rebuild in this order:

1. Theme, motion, radius, surface, and typography tokens from `authenticator/packages/ui/src/ui.css` and `authenticator/packages/ui/src/bridge.ts`.
2. Shared primitives: buttons, inputs, selects, banners, modal shells, pills.
3. The main vault shell and `AccountRow` pattern, including list/grid responsiveness and the OTP progress widget.
4. `HeaderMenu` and `CommandPalette` so the app regains its fast action/search loop.
5. The lock overlay, then the SecurityPicker and Safety Setup flows.
6. Product-specific shell integrations: desktop title bar, tray menu, screen scan overlay, mobile camera scan.

If another team rebuilds only the first four items, they will already recover most of the app's recognizable experience. The remaining items add the secure-product personality and platform-specific depth.
