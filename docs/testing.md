# Testing

## Dependency-free checks

These checks can run immediately after cloning:

```bash
php tools/check-php-syntax.php
php tools/check-version.php
php tests/php/run.php
npm run check:assets
npm run check:syntax
npm run test:js
```

`npm run check:assets` fails if `assets/build/*` (or the language catalogs mapped to it) is missing or does not byte-for-byte match its `src/` counterpart. Run `npm run build` to regenerate it. CI runs `check:assets` before `build` so a source change committed without a matching rebuild fails the pipeline instead of being silently repaired.

The PHP smoke suite stubs the WordPress HTTP API and verifies successful balance/risk responses plus malformed JSON, provider errors, unsupported operations and missing-key behavior. It also forces the optional highlight-rendering capability (`ReportHighlightParser`'s `ext-dom` dependency) both on and off through a constructor override, so the suite never depends on whether `ext-dom` actually happens to be installed on the machine running it.

## Static analysis / coding standards

After `composer install`:

```bash
composer lint
```

After `npm install`:

```bash
npm run lint:js
npm run lint:css
```

## End-to-end

`npm run test:e2e` and `npm run test:browser` are two different, non-interchangeable checks; using the wrong one gives a false sense of coverage.

### `npm run test:e2e` — real WordPress, real Playwright

Runs `tests/e2e/*.spec.js` (`playwright test`) against an existing disposable WordPress installation with Turgenev activated. This is the only check in this project that exercises the real `wp_ajax_turgenev_api` endpoint, real nonces, real capabilities and a real database.

```bash
export WP_BASE_URL='http://localhost:8888'
export WP_ADMIN_USER='admin'
export WP_ADMIN_PASSWORD='password'
npx playwright install chromium
npm run test:e2e
```

Optional `TURGENEV_API_KEY` can be supplied to assert that the raw secret is never present in the settings-page HTML. Do not use production credentials in CI: provider requests (`risk`, `highlights`, `balance`) must be mocked through the WordPress HTTP API (`pre_http_request`), never sent to the real paid Turgenev account. `tests/e2e/mu-plugins/turgenev-e2e-support.php` does this — copy it into the target site's `wp-content/mu-plugins/` before running this suite; it only intercepts requests to `ApiClient::ENDPOINT` and is never included in the release ZIP (`tools/build-release.php`'s allowlist never touches `mu-plugins/`).

### `npm run test:browser` — fixture harness, no WordPress required

Runs `tools/browser-smoke.mjs`, a self-contained Gutenberg/Classic-editor DOM smoke test. It serves the plugin's own built assets plus WordPress core JS packages (read directly from `WP_TEST_ROOT`, default the sibling WordPress checkout) from a throwaway local HTTP server — there is no PHP backend, no database, no real AJAX endpoint and no login. Useful for fast local iteration on editor JS; it does not exercise `ApiController`, nonces or capabilities and is not a substitute for `test:e2e`.

## Live provider smoke test

`tools/live-api-smoke.php` checks only the balance endpoint and therefore does not submit content for analysis:

```bash
TURGENEV_API_KEY='...' php tools/live-api-smoke.php
```

Network/provider availability is outside the deterministic test suite.
