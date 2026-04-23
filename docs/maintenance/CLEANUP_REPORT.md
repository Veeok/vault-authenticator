# Cleanup Report

Date: 2026-03-04
Scope: `authenticator/` monorepo only (desktop/mobile/packages). No cleanup was applied outside this folder.

## Inventory and Evidence

### Repo Map (Top Level + Key Subfolders)
- `apps/`
  - `apps/desktop/` (Electron app; `src/`, `assets/`, Forge/Vite configs)
  - `apps/mobile/` (Capacitor app; `src/`, `android/`, Vite config)
- `packages/`
  - `packages/core/` (`src/`, `dist/`)
  - `packages/ui/` (`src/`, tests, `ui.css`)
  - `packages/backup/` (`src/`, tests)
- Root files: `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `README.md`, `.npmrc`, `changelogs.md`

### Script Map (All `package.json` files)
- `package.json` (root)
  - `test: pnpm -r test` (referenced by README command `pnpm test`)
- `apps/desktop/package.json`
  - `start`, `package`, `make`, `publish`, `lint`, `test`
  - `make` is referenced by README; others are standard local workflow scripts.
- `apps/mobile/package.json`
  - `build`, `android:assemble:release`, `android:bundle:release`, `test`
  - `build` is referenced by README.
- `packages/core/package.json`
  - `test`, `build`
- `packages/ui/package.json`
  - `test`
- `packages/backup/package.json`
  - `test`

CI/docs usage scan:
- No repo-level CI workflow folder found (`.github/workflows` absent in project root).
- Commands are documented in `README.md`.

### Reference Scan Summary
For each cleanup candidate, checks were performed against source/config/scripts/tests for:
- import/require usage
- script references
- config references
- build output expectations

## Safe to Remove (High Confidence)

### A) Generated Outputs and Build Artifacts
Removed:
- `apps/desktop/out/`
- `apps/desktop/.vite/`
- `apps/mobile/dist/`
- `apps/mobile/android/.gradle/`
- `apps/mobile/android/build/`
- `apps/mobile/android/app/build/`

Evidence:
- `apps/desktop/.gitignore` ignores `.vite/` and `out/`.
- Desktop runtime/build uses Electron Forge + Vite and regenerates `.vite`/packaging outputs.
- `apps/mobile/vite.config.ts` sets `build.outDir = "dist"` with `emptyOutDir: true` (generated folder).
- `apps/mobile/android/.gitignore` ignores `.gradle/` and `build/`.
- `apps/mobile/android/app/.gitignore` ignores `app/build/*`.

### B) Duplicate Runtime Logs
Removed:
- `apps/desktop-debug.log`
- `apps/desktop/desktop-debug.log`

Evidence:
- Both files had identical SHA256 hash:
  - `0EC5F0CE0DF8EA2CA8D9B1A26E2BD9BA92ADC35C12E46B8DA4D334AD20363C97`
- They are runtime logs and recreated by diagnostics flow as needed.

### C) Redundant/Dead Desktop Package Config
Removed from `apps/desktop/package.json`:
- legacy `build` block (Electron Builder-style icon/NSIS config)

Evidence:
- Active desktop scripts are Electron Forge (`electron-forge start/package/make/publish`).
- Canonical build config is `apps/desktop/forge.config.ts`.
- No scripts or docs invoke Electron Builder.

### D) Unused Dependencies (High Confidence)
Removed from `apps/desktop/package.json`:
- `@electron-forge/maker-deb`
- `@electron-forge/maker-rpm`
- `@electron-forge/maker-squirrel`
- `@zxing/library`

Evidence:
- `forge.config.ts` only uses NSIS + ZIP makers.
- No source/config/test imports for `@zxing/library` in `apps/desktop/src`.

Removed from `packages/ui/package.json`:
- `@authenticator/backup`

Evidence:
- No imports/references to `@authenticator/backup` in `packages/ui/src`.

## Likely Removable but Needs Review

- `apps/desktop/assets/icon.png`
  - No direct file-path references found, but Forge uses extensionless `icon: "./assets/icon"`.
  - Could still be used by certain packaging paths/tool behavior.

- `apps/desktop/src/renderer.d.ts`
  - No direct imports found, but `.d.ts` may still be ambiently included by TS because `tsconfig.json` includes `src`.

## Keep (Used)

- `apps/desktop/assets/icon.ico`
  - Referenced directly by desktop package metadata and Forge packaging conventions.

- `apps/mobile/android/app/src/main/res/**` launcher/splash assets
  - Referenced by Android manifest/resources.

- `packages/core/dist/**`
  - `packages/core/package.json` points `main/types` to `dist` outputs.

- All current app/package source files in `apps/*/src` and `packages/*/src`
  - No high-confidence dead source files were found in this cleanup pass.

## Notes

- No speculative source deletions were made.
- Cleanup focused on generated artifacts, duplicate logs, and proven-unused config/deps.
- Desktop `lint` script currently fails (see validation); failures appear pre-existing and were not introduced by cleanup.

## Validation Summary

Commands executed after cleanup:

- `pnpm -r install` -> PASS
- `pnpm --filter @authenticator/ui exec tsc --noEmit` -> PASS
- `pnpm --filter desktop exec tsc --noEmit` -> PASS
- `pnpm --filter @authenticator/ui test` -> PASS (35 tests)
- `pnpm --filter desktop lint` -> FAIL (pre-existing issues)
  - `src/__tests__/lock-store.test.ts`: `@typescript-eslint/no-empty-function`
  - `src/main/ipc-handlers.ts`: `@typescript-eslint/no-var-requires`
  - `vitest.config.ts`: `import/no-unresolved` for `vitest/config`
  - `src/renderer.ts`: `no-non-null-assertion` warning
- `pnpm --filter desktop start` -> PASS (Electron app launched successfully)

Manual smoke notes:
- Launch verified from CLI output.
- Interactive UI checks (open Add Account, Settings, lock/unlock clicks) should be human-verified in the running window.
