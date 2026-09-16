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

The PHP smoke suite stubs the WordPress HTTP API and verifies successful balance/risk responses plus malformed JSON, provider errors, unsupported operations and missing-key behavior.

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

Playwright tests expect an existing disposable WordPress installation with Turgenev activated.

```bash
export WP_BASE_URL='http://localhost:8888'
export WP_ADMIN_USER='admin'
export WP_ADMIN_PASSWORD='password'
npx playwright install chromium
npm run test:e2e
```

Optional `TURGENEV_API_KEY` can be supplied to assert that the raw secret is never present in the settings-page HTML. Do not use production credentials in CI.

## Live provider smoke test

`tools/live-api-smoke.php` checks only the balance endpoint and therefore does not submit content for analysis:

```bash
TURGENEV_API_KEY='...' php tools/live-api-smoke.php
```

Network/provider availability is outside the deterministic test suite.
