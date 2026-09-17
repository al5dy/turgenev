# Turgenev 1.4 → 2.0.0 audit

This audit records the material issues found in the supplied `turgenev.zip` and the remediation implemented in 2.0.0.

| Severity | Legacy issue | Impact | 2.0.0 remediation |
| --- | --- | --- | --- |
| Critical | The supplied archive referenced `/build/index.js`, `/build/index_old.js`, `/build/index.css` and `/build/index.asset.php`, but contained no `build/` directory. | Installed plugin could not load its editor UI assets. | Runtime assets are present under `assets/build/`; build and release tooling verify/copy them. |
| Critical | API key was localized into `turgenev_ajax.api_key`. | Any script/user able to inspect the editor page could read the provider secret. | Key stays in PHP; browser calls authenticated WordPress AJAX only. |
| Critical | Provider-controlled values were concatenated into `innerHTML`. | A malicious/compromised provider response could become stored/admin-context XSS. | Result UI uses `createElement`, `textContent` and URL-encoded report tokens. |
| Critical | Saving a key performed `api=risk` on the dummy text `test`. | Settings validation could consume a paid analysis request. | Key validation uses the legacy `api=balance` operation. |
| Critical | Invalid/new keys and provider/network errors overwrote the old option with the failed key state. | A temporary provider outage or typo could destroy a working configuration. | New key is stored only after successful validation; otherwise old key is retained. |
| High | `tgev_is_valid_apikey()` treated an absent option as valid because it only checked whether `api_key_invalid` was empty. | Fresh installs could enqueue assets with no key and produce PHP 8 warnings/undefined offsets. | `OptionStore::hasApiKey()` requires a non-empty saved key. |
| High | Browser called `turgenev.ashmanov.com` directly. | CORS became a functional dependency; browser/network errors bypassed WordPress error handling. | Server-to-server requests use the WordPress HTTP API. |
| High | No nonce/capability boundary existed around paid analysis requests. | The browser-side integration had no WordPress request authorization layer of its own. | `wp_ajax_turgenev_api` requires a valid nonce plus object-level `current_user_can( 'edit_post', $post_id )` for `risk`/`highlights` (never a generic `edit_posts` grant), or `edit_post`/`manage_options` for `balance` depending on whether a post ID is present; server-side rate limiting bounds request volume before any provider call. |
| High | JSON parsing and HTTP error paths had no reliable cleanup. | Invalid JSON/non-2xx/network failures could leave the editor permanently disabled until reload. | Promise `try/catch/finally` always restores UI state; PHP validates transport/status/JSON/API errors. |
| High | `tinymce.activeEditor.getContent()` was used without fallback. | Classic Editor text mode or missing TinyMCE could throw and make analysis unusable. | Uses `tinymce.get('content')` when available, then falls back to the content textarea. |
| High | Arbitrary balance thresholds removed workflow/top-up DOM nodes. | UI could become impossible to recover after balance changed without a page reload. | Balance is informational; workflow is not destructively removed. |
| High | `LICENSE` and distribution metadata declared different GPL versions. | Distribution metadata was internally inconsistent. | License text and metadata are GPLv2 or later. |
| Medium | Plugin required WP 5.0 / PHP 5.6 and used `@wordpress/scripts` 12.x-era tooling. | Unsupported/obsolete development baseline and editor assumptions. | WP 6.6+, PHP 8.1+, current project tooling and CI matrix. |
| Medium | Gutenberg detection used legacy global/plugin heuristics. | Could select the wrong integration for post types/editor configurations. | Uses WordPress screen/post-type editor APIs and current editor package integration. |
| Medium | Classic assets could be enqueued broadly in wp-admin. | Unnecessary scripts/styles and larger compatibility surface. | Assets are scoped to Turgenev settings and relevant editor screens. |
| Medium | Generic global `is_ajax()` helper could collide with other plugins. | Cross-plugin behavior could be silently changed by load order. | Removed; namespaced classes use WordPress APIs directly. |
| Medium | API documentation omitted the working `balance` operation and contained `tblclass`/`tbclass` inconsistency. | Maintainers could not understand the actual plugin/API contract. | `API.md` documents `balance`, request/response validation and correct `tbclass` usage. |
| Medium | Package version (`1.0.4`), plugin version (`1.4`), translations and readme metadata diverged. | Releases were not reproducible or mechanically verifiable. | Version is 2.0.0 across runtime/readme/package metadata; `tools/check-version.php` enforces it. |

## Verification added

- dependency-free PHP API smoke/regression suite;
- API-key keep/rotate/reject/clear tests;
- browser secret-leak contract test;
- `innerHTML` security contract test;
- AJAX nonce/capability contract test;
- PHP and JavaScript syntax checks;
- version-consistency check;
- Playwright admin-page E2E scaffold;
- GitHub CI, dependency review, Dependabot and tag-release packaging.

## Remaining external dependency

A deterministic local test cannot prove a real account key or the live provider's future behavior. `tools/live-api-smoke.php` performs an opt-in balance check when `TURGENEV_API_KEY` is supplied through the environment. No live credential is stored in the repository.

## Editor integration regression

A release-candidate regression hid the editor UI whenever no API key was stored and used post-type-level block-editor detection for the Classic Editor metabox. The final 2.0.0 build keeps the UI registered in both editors, shows a configuration state when no key exists, uses the standard Gutenberg document settings panel, and detects Classic Editor from the active screen. Regression tests cover these contracts.
