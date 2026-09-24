# Turgenev for WordPress

Turgenev integrates the official Turgenev content-analysis service into the WordPress Classic Editor and Block Editor. Version 2.0.0 is a security-focused rewrite of the original plugin with a server-side API boundary, modern WordPress/PHP requirements and a reproducible test/release toolchain.

## Requirements

- WordPress 6.6+
- PHP 8.1+
- A Turgenev API key
- JavaScript-enabled wp-admin editor

## Technical highlights

- **Server-side API proxy.** The Turgenev API key never appears in browser JavaScript or localized script data.
- **Nonce + object-level capability enforcement.** `risk`/`highlights` require a valid WordPress nonce, a scalar positive `post_id` for an existing post, and `current_user_can( 'edit_post', $post_id )` — a generic `edit_posts` grant is never enough. `balance` requires `edit_post` on the post when a post ID is present, or `manage_options` when it is absent (Settings screen).
- **Server-side rate limiting.** Independent of the editor's JS busy state, requests are bounded per user+post (burst) and per user across all posts (global), so post rotation cannot be used to exceed the effective budget. Exceeding either returns HTTP 429 before any outbound request.
- **Safe key rotation.** A new key is validated with the balance endpoint; a typo/provider outage cannot overwrite the previously working key.
- **No paid validation check.** Saving settings no longer performs a `risk` analysis of a dummy string.
- **Defensive provider parsing.** HTTP failures, invalid JSON, API errors and invalid balance payloads fail closed.
- **XSS-resistant rendering.** Provider strings are inserted with DOM/text APIs instead of `innerHTML`.
- **Gutenberg + Classic Editor.** Both editor experiences share the same server-side integration and response handling.
- **Explicit external-service disclosure.** Content leaves WordPress only after the editor clicks Analyze.
- **Automated engineering checks.** PHP smoke tests, JavaScript contract tests, Playwright E2E scaffolding, GitHub Actions and release tooling are included.

## Architecture

```text
Browser editor
    │  nonce + operation + content
    ▼
WordPress admin-ajax.php
    │  capability + nonce validation
    ▼
ApiController
    ▼
ApiClient ───── saved API key (server-side only)
    │
    ▼
https://turgenev.ashmanov.com/
```

See [`docs/architecture.md`](docs/architecture.md) for details and [`API.md`](API.md) for the provider/API contract used by this plugin.

## Installation

1. Upload the `turgenev` directory or install the release ZIP.
2. Activate **Turgenev**.
3. Open **Settings → Turgenev**.
4. Paste an API key and save. The key is verified through the balance endpoint.
5. Open a post/page. In the Block Editor, use the permanent **Turgenev** panel in the document settings sidebar (analyzes the whole current, possibly unsaved, document — not a selected block); in the Classic Editor, use the Turgenev metabox.

## Development

```bash
# Deterministic checks without Composer/npm dependencies.
php tools/check-php-syntax.php
php tools/check-version.php
php tests/php/run.php
npm run check:syntax
npm run test:js

# Full lint/toolchain.
composer install
composer lint
npm install
npm run lint:js
npm run lint:css
```

### Browser tests

`npm run test:e2e` is real Playwright against a disposable WordPress installation; `npm run test:browser` is a self-contained fixture harness that needs no WordPress instance. See [`docs/testing.md`](docs/testing.md) for the difference.

```bash
export WP_BASE_URL='http://localhost:8888'
export WP_ADMIN_USER='admin'
export WP_ADMIN_PASSWORD='password'
npx playwright install chromium
npm run test:e2e
```

## API key handling

The option name remains `turgenev` for backwards compatibility with 1.x installations. Version 2.0.0 reads the existing `api_key` automatically.

The settings screen does not echo the saved secret back into the password field. Below the empty field it shows only a masked suffix, for example `Saved API key: ••••••••••••abcd`; the mask length is fixed and does not reveal how long the key is.

- **Save API key** with an empty field keeps the current key.
- **Save API key** with a new key first verifies it through the balance endpoint and stores it only if the check succeeds; a rejected key or a provider outage leaves the current key in place.
- **Delete API Key**, shown only while a key is saved, explicitly removes it.

## Release build

```bash
npm run build
bash tools/build-zip.sh
```

The production ZIP contains runtime PHP, compiled browser assets, translations, readme/license files and `uninstall.php`; development-only tooling is excluded. See [`docs/release.md`](docs/release.md).

## Security

Report security issues according to [`SECURITY.md`](SECURITY.md). Never include a real Turgenev API key in an issue, log or test fixture.

## License

GPLv2 or later. See [`LICENSE`](LICENSE).
