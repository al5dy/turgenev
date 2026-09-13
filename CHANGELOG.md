# Changelog

## 2.0.0 — 2026-09-13

- Reworked the plugin around WordPress 6.6+ and PHP 8.1+.
- Moved Turgenev API communication from browser JavaScript to server-side WordPress HTTP requests.
- Stopped exposing the API key to browser code.
- Added nonce/capability checks for remote API actions.
- Added safe API-key rotation and explicit key removal.
- Changed key verification from dummy risk analysis to the legacy balance endpoint.
- Added defensive HTTP/JSON/provider-response validation.
- Replaced provider-controlled HTML interpolation with safe DOM rendering.
- Improved Classic Editor and Gutenberg integration and failure recovery.
- Documented the legacy `api=balance` operation and corrected `tbclass` documentation.
- Added GitHub CI/release/dependency workflows, Dependabot, WPCS configuration, deterministic PHP/JS tests, Playwright scaffolding and release tooling.
- Added `AGENTS.md`, architecture/testing/release/Codex documentation and an external-service disclosure.
- Corrected the license mismatch and standardized the project on GPLv2 or later.
