# AGENTS.md — Turgenev engineering contract

This repository is maintained as production WordPress software. Changes made by Codex or any other coding agent must be review-ready for a senior/lead engineer, safe for real WordPress sites, and understandable without reverse-engineering hidden assumptions.

## Non-negotiable standards

- Target WordPress **6.6+** and PHP **8.1+**. Keep compatibility with currently supported PHP releases unless a documented reason requires otherwise.
- Prefer small, cohesive classes with explicit responsibilities over large procedural files or speculative abstractions.
- Treat the external Turgenev API, browser input, stored options, AJAX payloads and API responses as untrusted boundaries.
- Never expose the API key to browser JavaScript, HTML markup, logs, exceptions, telemetry, tests, fixtures, screenshots or committed files.
- Every paid/remote action initiated from wp-admin must have an appropriate capability check and nonce validation.
- Escape on output, sanitize identifiers on input, and validate structured external data before using it.
- Do not mark analysis as successful when the provider response is malformed, incomplete or reports an error.
- Preserve backwards compatibility where inexpensive and explicit; do not preserve insecure legacy behavior.
- Avoid floats for money-related business decisions. Balance is display-only in this plugin.
- Do not silently truncate content sent for paid analysis. Reject unsupported payload sizes with a clear error.
- User-facing remote-service behavior must be disclosed in `readme.txt`.

## Code quality

- New PHP belongs under `src/` and uses the `Al5dy\\Turgenev` namespace.
- The root plugin file remains a thin bootstrap/autoloader.
- Browser code must not use `innerHTML` with provider-controlled data.
- No inline JavaScript event handlers.
- No credentials in localized script data.
- Catch external-service failures at the integration boundary and return actionable, non-secret error messages.
- Prefer WordPress APIs for HTTP, options, permissions, nonces and admin UI.
- Keep code comments focused on *why*, not line-by-line restatement.

## Required checks before declaring work complete

Run, at minimum:

```bash
php tools/check-php-syntax.php
php tools/check-version.php
php tests/php/run.php
npm run check:syntax
npm run test:js
```

When dependencies are installed, also run:

```bash
composer install
composer lint
npm install
npm run lint:js
npm run lint:css
npm run test:e2e
```

Live provider checks are opt-in because they use a real account:

```bash
TURGENEV_API_KEY='...' php tools/live-api-smoke.php
```

Never hard-code or commit that key.

## Definition of done

A change is done only when code, tests, documentation, version metadata and release packaging agree. A passing happy path alone is insufficient: test invalid API keys, provider errors, malformed JSON, missing permissions, empty content, oversized content and browser-visible secret leakage.
