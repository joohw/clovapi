# winget packaging

This directory stores templates and helper scripts for publishing `clovapi` to `winget`.

## Release artifact expectations

`switcher/.goreleaser.yaml` publishes these files (per tag `vX.Y.Z`):

- `clovapi_vX.Y.Z_windows_amd64.zip`
- `clovapi_vX.Y.Z_windows_arm64.zip`
- `checksums.txt`

## Manual rendering

```powershell
pwsh -File .\render.ps1 -Version 0.1.0 -Repo joohw/new-api
```

Generated manifests are written to `generated/`.

## Automated submit flow

The GitHub Actions release workflow can call `wingetcreate`:

- requires `WINGET_CREATE_TOKEN`
- creates/updates package `Clovapi.Clovapi`
- submits PR to `microsoft/winget-pkgs`
