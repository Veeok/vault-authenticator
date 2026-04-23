# RELEASE CHECKLIST

Target version: `1.4.7`

## 1) Pre-release quality gates

- [x] Stability audit plan completed (`STABILITY_AUDIT_PLAN.md`)
- [x] Smoke harness in place (`pnpm test:smoke`)
- [x] Deterministic smoke fixtures for 0/1/5/50 accounts
- [x] Regression test for close/background policy
- [x] Secure-store corruption resilience tests added
- [x] Crash/error guardrail tests added
- [x] Workspace automated tests pass (`pnpm test`)
- [ ] Optional lint cleanup pass (known existing lint debt is not release-blocking for runtime stability)

## 2) Bug triage gates

- [x] `BUG_LOG.md` created and updated
- [x] All P0 bugs resolved
- [x] All P1 bugs resolved
- [x] P2 waivers documented (installer icon metadata warning)

## 3) Packaging gates

- [x] Desktop version bumped before packaging (`apps/desktop/package.json` -> `1.4.7`)
- [x] Package build completed (`pnpm --filter desktop package`)
- [x] Installer build completed (`pnpm --filter desktop make`)
- [x] Artifacts generated under `apps/desktop/out/make`

## 4) Manual sanity gates (release operator)

- [ ] Install `Vault Authenticator Setup 1.4.7.exe` on a clean Windows profile
- [ ] Launch app and verify first-run startup success
- [ ] Verify lock screen behavior (if configured)
- [ ] Verify add/edit/delete account flow persists across restart
- [ ] Verify tray open/close behavior with `runInBackground=true/false`
- [ ] Verify copy code and clear clipboard behavior
- [ ] Verify backup export/import with known-good encrypted backup

## 5) Final sign-off

- [x] Stability report published (`STABILITY_REPORT.md`)
- [x] Bug log published (`BUG_LOG.md`)
- [x] Release checklist published (`RELEASE_CHECKLIST.md`)
- [ ] Final human sign-off recorded
