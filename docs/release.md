# Release process

1. Update `TURGENEV_VERSION`, plugin header `Version`, `Stable tag`, `package.json` and changelog.
2. Run `php tools/check-version.php`.
3. Run all deterministic tests and linters.
4. Build release assets with `npm run build`.
5. Run `bash tools/build-zip.sh`.
6. Install the ZIP on a clean WordPress 6.6+ test site and on the newest supported WordPress release.
7. Test API-key save/rotation/removal, Gutenberg analysis, Classic Editor analysis, balance refresh and provider failure handling.
8. Tag `vX.Y.Z`. This does not publish anything by itself.

The release archive intentionally excludes development-only directories such as `.github`, `tests`, `tools`, `.playwright-cli`, source assets and package metadata.

## WordPress.org listing assets

Icons, banners and screenshots for the WordPress.org plugin directory listing live in
`.wordpress-org/` at the repository root, never under `src/` and never in the release ZIP
(`tools/build-release.php`'s allowlist only ever walks `src` for `.php` files, so listing
assets are excluded structurally, not just by convention). When updating a screenshot or
banner, replace the file in `.wordpress-org/` and update the corresponding caption under
`== Screenshots ==` in `readme.txt`; do not add a new source copy under `src/`.

## What the tag push actually triggers

`.github/workflows/release.yml` never builds or publishes a GitHub Release on its own. Pushing a `vX.Y.Z` tag runs:

1. `quality-gate` — `.github/workflows/quality-gate.yml`, the exact same reusable workflow `ci.yml` runs on every push/PR (PHP syntax, version consistency, PHP tests, PHPCS/WPCS, JS syntax, JS tests, JS/CSS/package.json lint, generated-asset consistency, `npm run build`, and building + packaging the release ZIP). A tag whose commit would fail ordinary CI fails here identically, before anything is published.
2. `publish` (`needs: quality-gate`) — only runs if every job above succeeded. It downloads the ZIP `quality-gate` already built and verified, re-verifies it (`unzip -t` for archive integrity, `tools/verify-release-assets.mjs` to confirm every runtime asset `EditorIntegration.php` enqueues from `assets/build/` is physically present in the packaged plugin), and only then creates the GitHub Release via `softprops/action-gh-release@v2`.

If any check fails, no GitHub Release is created for that tag; delete the tag, fix the issue, and re-tag.
