# Release Checklist

Target version: `<set before release>`

## 1) Signing Inputs

- [ ] Windows release machine has `WINDOWS_CERTIFICATE_FILE`
- [ ] Windows release machine has either `WINDOWS_CERTIFICATE_PASSWORD` or `WINDOWS_SIGN_WITH_PARAMS`
- [ ] Optional Windows signing metadata set if needed:
  - `WINDOWS_TIMESTAMP_SERVER`
  - `WINDOWS_SIGN_DESCRIPTION`
  - `WINDOWS_SIGN_WEBSITE`
- [ ] If building a macOS release, release machine has:
  - `APPLE_SIGN_IDENTITY`
  - and either:
    - `APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`
    - or `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`

## 2) Pre-release

- [ ] Desktop version bumped in `apps/desktop/package.json`
- [ ] Changelog updated
- [ ] Release notes drafted
- [ ] `pnpm --filter desktop test`
- [ ] `pnpm --filter desktop exec tsc --noEmit`

## 3) Build

- [ ] `pnpm --filter desktop package`
- [ ] `pnpm --filter desktop make`
- [ ] No signing warnings appear for release builds
- [ ] Produced Windows installer is signed
- [ ] Produced packaged binaries are signed

## 4) Post-build Checksums

- [ ] `pnpm --filter desktop checksums`
- [ ] `apps/desktop/out/make/CHECKSUMS.txt` created
- [ ] Checksums reviewed before upload

## 5) Publish

- [ ] Upload release artifacts and `CHECKSUMS.txt` together
- [ ] Do not publish unsigned installers as official releases
- [ ] Record release operator and timestamp

## 6) Verification

### Verify Windows Authenticode Signature

Run in PowerShell:

```powershell
Get-AuthenticodeSignature ".\Vault Authenticator Setup <version>.exe" | Format-List Status,StatusMessage,SignerCertificate
```

Expected:

- `Status` is `Valid`
- signer certificate matches the intended publisher

### Verify SHA256 Checksum

Run in PowerShell:

```powershell
Get-FileHash -Algorithm SHA256 ".\Vault Authenticator Setup <version>.exe"
```

Compare the hash to the matching line in `CHECKSUMS.txt`.

## 7) Final Sign-off

- [ ] Installer signature verified manually
- [ ] Checksum verified manually
- [ ] Release announcement approved
