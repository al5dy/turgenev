# Release process

1. Update `TURGENEV_VERSION`, plugin header `Version`, `Stable tag`, `package.json` and changelog.
2. Run `php tools/check-version.php`.
3. Run all deterministic tests and linters.
4. Build release assets with `npm run build`.
5. Run `bash tools/build-zip.sh`.
6. Install the ZIP on a clean WordPress 6.6+ test site and on the newest supported WordPress release.
7. Test API-key save/rotation/removal, Gutenberg analysis, Classic Editor analysis, balance refresh and provider failure handling.
8. Tag `vX.Y.Z`. The GitHub release workflow creates a distributable ZIP.

The release archive intentionally excludes development-only directories such as `.github`, `tests`, `tools`, `.playwright-cli`, source assets and package metadata.
