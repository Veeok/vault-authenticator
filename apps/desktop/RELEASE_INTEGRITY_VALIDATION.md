# Release Integrity Validation

## 1) Fuse Confirmation

Confirmed in `authenticator/apps/desktop/forge.config.ts`:

- `RunAsNode: false`
- `EnableCookieEncryption: true`
- `EnableNodeOptionsEnvironmentVariable: false`
- `EnableNodeCliInspectArguments: false`
- `EnableEmbeddedAsarIntegrityValidation: true`
- `OnlyLoadAppFromAsar: true`

These settings remain enabled after the release-integrity changes.

## 2) Signing Config Review

### Windows

- Packaged Windows binaries are wired through `packagerConfig.windowsSign`.
- NSIS installer signing is wired through `new MakerNSIS({ codesign: ... })`.
- No signing secrets are hardcoded.
- Expected env vars:
  - `WINDOWS_CERTIFICATE_FILE`
  - `WINDOWS_CERTIFICATE_PASSWORD`
  - optional `WINDOWS_SIGN_WITH_PARAMS`
  - optional `WINDOWS_TIMESTAMP_SERVER`
  - optional `WINDOWS_SIGN_DESCRIPTION`
  - optional `WINDOWS_SIGN_WEBSITE`

### macOS

- Guarded `osxSign` and `osxNotarize` config entries were added.
- No Apple secrets are hardcoded.
- Expected env vars:
  - `APPLE_SIGN_IDENTITY`
  - and either:
    - `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
    - or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

## 3) Command Results

### Type Check

Command:

```powershell
pnpm --filter desktop exec tsc --noEmit
```

Result:

- Passed.

### Dev-mode Package Build

Command:

```powershell
pnpm --filter desktop package
```

Result:

- Succeeded without signing credentials.
- Emitted the expected guard warning:

```text
[release-integrity] Windows signing disabled: set WINDOWS_CERTIFICATE_FILE to sign packaged binaries and NSIS installers.
```

This confirms the build pipeline stays usable for local dev packaging while release signing remains opt-in through env vars.

### Make Build

Command:

```powershell
pnpm --filter desktop make
```

Result:

- Forge reached the distributable step.
- NSIS artifact generation started successfully.
- The existing ZIP maker path failed with a separate runtime compatibility issue:

```text
The property 'options.recursive' is no longer supported. Received true
```

Source of failure: current `cross-zip` behavior in the ZIP maker path, not the new signing config.

## 4) Checksum Script Output Example

Command:

```powershell
pnpm --filter desktop checksums
```

Result:

```text
[checksums] Wrote 3 checksum(s) to C:\Users\Veok\Desktop\VS Projects\AuthenticatorApp\authenticator\apps\desktop\out\make\CHECKSUMS.txt
```

Observed `CHECKSUMS.txt` example:

```text
468c425e0b35e184da1e2aaf32bdb896f32750802718666668a0dd19411d8419  nsis/x64/Vault Authenticator Setup 1.8.1.exe
4cd325e7f8d2253c7274568b3bffb33a60228d00f1864a4f829e16352bc8a06b  nsis/x64/Vault Authenticator Setup 1.8.1.exe.blockmap
755979956cc21d3a8d1dd85d43ba2167bc20e16ee296460db112707bf0fbab9d  zip/win32/x64/Vault Authenticator-win32-x64-1.7.0.zip
```

Release note:

- Run `checksums` only after a successful `make` in the release workflow.
- The ZIP artifact inconsistency above should be treated as part of the pre-existing ZIP maker failure and resolved before relying on ZIP output for release publication.

## 5) Manual Windows Verification Steps

### Verify Authenticode Signature

Run in PowerShell:

```powershell
Get-AuthenticodeSignature ".\Vault Authenticator Setup 1.8.1.exe" | Format-List Status,StatusMessage,SignerCertificate
```

Expected release result:

- `Status` is `Valid`
- `SignerCertificate` matches the intended publisher certificate

### Verify SHA256 Checksum

Run in PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 ".\Vault Authenticator Setup 1.8.1.exe"
```

Compare the SHA256 value to the matching line in `CHECKSUMS.txt`.

## 6) Residual Issue

- The repo still has a packaging regression in the Windows ZIP maker path during `electron-forge make` on the current toolchain.
- This should be fixed separately; it is not introduced by the release-integrity hardening in this change.
