# Architecture

Turgenev 2.0.0 deliberately uses a small layered architecture rather than mirroring a payment plugin one-for-one.

## Request flow

1. An authenticated editor opens the Classic Editor metabox, or the permanent **Turgenev** panel in the Block Editor's document settings sidebar.
2. Browser code receives only the WordPress AJAX URL, a nonce, the report base URL and the maximum text length — never the API key.
3. Clicking **Analyze document** sends the entire current document text (including unsaved edits) to `wp_ajax_turgenev_api`.
4. `ApiController` validates the nonce, requires a scalar positive `post_id` for an existing post, and requires `current_user_can( 'edit_post', $post_id )` for `risk`/`highlights` (or `edit_post`/`manage_options` for `balance`, depending on whether a post ID is present). A generic `edit_posts` capability is never sufficient on its own.
5. `RateLimiter` checks a per-user/post burst bucket and a per-user global bucket (across every post) for the operation; either being exceeded rejects the request with HTTP 429 before any outbound request.
6. `ApiClient` reads the API key server-side and sends the request through the WordPress HTTP API.
7. The provider response is checked for HTTP failure, malformed JSON, provider-level errors and operation-specific fields.
8. The AJAX response returns analysis data to the browser; the API key never crosses the PHP/browser boundary.
9. The UI renders provider data with `textContent`/DOM APIs rather than injecting HTML. Highlight rendering is presentation-only and never modifies `post_content`.

## Modules

- `turgenev.php` — metadata, constants, autoloading and boot hook.
- `src/Bootstrap.php` — requirements gate and plugin startup.
- `src/Plugin.php` — composition root.
- `src/Support/OptionStore.php` — central API-key option access.
- `src/Api/ApiClient.php` — external HTTP boundary and response validation.
- `src/Ajax/ApiController.php` — authenticated browser-to-server bridge.
- `src/Support/RateLimiter.php` — server-side, per-post and per-user-global rate limiting, independent of the editor's UI.
- `src/Admin/SettingsPage.php` — secret-safe settings and key rotation.
- `src/Admin/EditorIntegration.php` — Gutenberg/Classic Editor integration.
- `src/js/client.js` — AJAX client and safe result rendering.

## Security decisions

The 1.x plugin sent the API key to JavaScript and called the provider directly from the browser. Version 2.0.0 intentionally breaks that implementation detail. It prevents key disclosure to editor-page source and removes CORS from the critical path.

A new key is validated with the `balance` operation instead of a `risk` analysis. This avoids spending a content-analysis request merely to save settings. If validation fails, a previously stored key is retained.

## Compatibility

The `turgenev()` helper and `$GLOBALS['turgenev']` provide lightweight access to the main plugin instance for other code (e.g. `WP_CLI` scripts or a future integration). Internal legacy classes/functions are not treated as a public API.

## Optional capability: highlight rendering

`ext-dom` is not in `composer.json`'s `require`; only highlight rendering needs it, not the plugin as a whole. `Requirements::hasDom()` is the single source of truth; `ReportHighlightParser` and `EditorIntegration` both resolve it (with a constructor override for tests, so `tests/php/run.php` never depends on whether the machine running it actually has `ext-dom`).

- `ReportHighlightParser::parse()` throws a plain `ApiException` — never a fatal error — when `DOMDocument` is unavailable.
- `EditorIntegration` reports `highlightsAvailable` to the browser through `TurgenevConfig`, so `src/js/analysis.js` never renders a Highlight button that is guaranteed to fail, and shows a short, non-fatal note instead.
- Balance and document analysis (`risk`) never touch `ReportHighlightParser` and are unaffected either way.
