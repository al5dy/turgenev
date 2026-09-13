# Contributing

Read `AGENTS.md` and `docs/architecture.md` before making non-trivial changes.

## Local checks

```bash
php tools/check-php-syntax.php
php tools/check-version.php
php tests/php/run.php
npm run check:syntax
npm run test:js
```

For the full toolchain install Composer/npm dependencies and run `composer lint`, `npm run lint:js` and `npm run lint:css`.

## Pull requests

Keep changes scoped. Describe behavior changes, API/security implications and how the change was tested. Do not combine unrelated cleanup with a bug fix unless the cleanup is required for the fix.

Never commit a real API key, production WordPress export, private content, Playwright storage state or provider response containing sensitive material.
