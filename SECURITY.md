# Security policy

## Reporting

Please use GitHub private vulnerability reporting for the repository when available. Do not open a public issue containing an API key, authentication material, private WordPress content or an exploitable proof of concept against a live site.

## Security model

- The Turgenev provider API key is server-side only.
- Browser API actions require an authenticated WordPress session, `edit_posts` or `manage_options`, plus a nonce.
- Provider response text is rendered as text, not trusted HTML.
- Remote HTTP/JSON failures do not become successful analyses.
- Real credentials must never be committed to source control or fixtures.

## Supported versions

Security fixes target the current 2.x release line. Version 1.x should be upgraded because it exposes the provider key to browser JavaScript by design.
