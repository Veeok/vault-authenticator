# Security Dependency Remediation

Date: 2026-03-05

## Baseline (before remediation)

Command:

- `pnpm audit --audit-level low`

Result before changes:

- Total: **11 vulnerabilities**
- Severity: **7 high**, **1 moderate**, **3 low**

Main affected packages:

- `tar` (multiple high advisories)
- `serialize-javascript` (high)
- `esbuild` (moderate)
- `tmp` (low)
- `@tootallnate/once` (low)
- `elliptic` (low, no patch available)

## Triage notes

- `pnpm -r why tar` showed broad forge/rebuild toolchain usage in desktop and `@capacitor/cli` usage in mobile.
- `pnpm -r why serialize-javascript` traced to `@electron-forge/template-webpack-typescript -> webpack -> terser-webpack-plugin`.
- `pnpm -r why esbuild` traced to Vite/Vitest chains across workspace packages.
- `pnpm -r why tmp` and `pnpm -r why @tootallnate/once` traced to forge CLI and rebuild-related chains.
- `pnpm -r why elliptic` traced to mobile `vite-plugin-node-polyfills -> crypto-browserify` path.

## Remediation applied

Updated root `pnpm` overrides in `package.json`:

- `@tootallnate/once`: `3.0.1`
- `esbuild`: `0.25.0`
- `serialize-javascript`: `7.0.3`
- `tar`: `7.5.10`
- `tmp`: `0.2.5`

Then:

- `pnpm install` (lockfile refreshed)

## Validation after remediation

Commands:

- `pnpm audit --audit-level low`
- `pnpm audit --json`

Result after changes:

- Total: **1 vulnerability**
- Severity: **0 high**, **0 moderate**, **1 low**

Remaining advisory:

- `elliptic@6.6.1` (low) via mobile polyfill chain
  - Advisory indicates no patched version available (`patched_versions: <0.0.0`).
  - Current action recommendation from audit is `review` (no direct patch target).

## Residual risk and follow-up

- Residual low risk remains only in mobile dev/polyfill crypto dependency chain.
- Follow-up options:
  1. Remove/replace the affected polyfill path if no longer needed.
  2. Track upstream fixes in `node-stdlib-browser` / `crypto-browserify` / `elliptic` ecosystem.
  3. Re-run `pnpm audit` in CI to catch future patch availability.
