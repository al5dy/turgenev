# Changelog

## 2.0.0 — 2026-09-17

2.0.0 has not previously been published to WordPress.org or tagged as a GitHub release; all
of the following (originally tracked as separate "Unreleased" work) is folded into this
single 2.0.0 entry rather than shipped as a later patch release.

- Rewrote `Support\RateLimiter` around two independent, atomically-counted buckets instead of
  one: a per-user/per-post burst bucket (unchanged defaults: 12/60s `risk`, 20/60s
  `highlights`) and a new per-user *global* bucket across every post combined (defaults:
  30/60s `risk`, 40/60s `highlights`), so switching between post IDs cannot be used to reset
  or multiply the effective budget. Counting uses a fixed-window key (`floor(time/window)`)
  so there is nothing to expire manually; increments are atomic via `wp_cache_add()` +
  `wp_cache_incr()` on a persistent object cache, or a bounded `add_option()`-based mutex
  (atomic on the database's unique `option_name` index) guarding a transient read-increment
  write otherwise, with automatic reclaim of a lock left behind by a crashed request and a
  fail-closed result (treated as rate-limited) if the lock cannot be acquired at all — a
  billed API boundary should never silently skip its own counter under contention. Added a
  small, independent `balance` bucket (20/60s per post-or-none, 40/60s global) so an editor
  cannot hammer that endpoint either, even though it is not itself metered by the provider.
  Both the per-post filter (`turgenev_rate_limit`) and the new global filter
  (`turgenev_rate_limit_global`) are documented and filterable. Added regression tests for
  per-post limits, cross-post global-limit enforcement, per-user isolation, risk/highlights
  isolation, window reset, lock contention/staleness, and the persistent-object-cache path;
  every rejected case still asserts `wp_remote_post()` is never called.
- Fixed a false-positive E2E authorization test (`tests/e2e/editor.spec.js`): the previous
  "Post-level authorization" test read `window.TurgenevConfig?.nonce ?? ''` from
  `/wp-admin/profile.php`, a screen Turgenev's assets are not enqueued on, so the optional
  chaining silently sent an empty nonce and the resulting 403 proved only nonce validation,
  not `edit_post`-scoped authorization. Rewrote it to log in as a contributor, open a post
  the contributor actually owns and can edit (where `TurgenevConfig.nonce` is asserted to be
  genuinely present and non-empty), then send a *valid* nonce against a separate
  admin-owned post; the test now asserts both the 403 and the specific
  "not allowed to analyze this post" error message, proving the request passed nonce
  validation and was rejected by object-level authorization specifically. The invalid-nonce
  scenario remains a separate test. The provider mock now counts intercepted outbound
  requests (`turgenev_e2e_mock_request_count`) so this test also asserts the provider was
  never contacted.
- Split `tests/php/run.php`'s DOM-dependent assertions from its DOM-independent ones behind
  `Support\Requirements::hasDom()`, and added a `TURGENEV_FORCE_NO_DOM=1` override (via the
  existing `turgenev_has_dom` filter) so the suite can be run in, and CI now runs, both an
  ext-dom-present and an ext-dom-absent configuration on the same PHP build — previously the
  suite unconditionally asserted `ReportHighlightParser` output that only holds when ext-dom
  is actually installed, so it would fail outright on a host without it, silently
  contradicting the runtime's own documented DOM-optional behavior.
- Rewrote `readme.txt`'s Description, workflow, FAQ and External service/Privacy sections,
  which still described a since-replaced "select a block, Analyze selected block, Block
  inspector" workflow. The actual implementation adds a permanent Turgenev document settings
  panel that analyzes the entire current (possibly unsaved) document via an explicit
  **Analyze document** action. Documented exactly what is sent to Turgenev and when (analysis
  text, API key added server-side only, balance checks, and highlight report retrieval), and
  added the Turgenev service's Terms of Service and personal-data-policy links (operated by
  ООО «Интернет-Лингвистика», OGRN 1087746363682) alongside the existing service/account
  links.
- Added an mu-plugin-driven `turgenev_e2e_force_outage` / `turgenev_e2e_force_balance_error`
  toggle and settings-page E2E coverage (`tests/e2e/admin.spec.js`) for API key save, blank
  preserving the current key, an invalid replacement preserving the current key, a simulated
  provider outage preserving the current key, explicit clearing, and the plaintext candidate
  key never appearing in page HTML — verified against the actual stored option via wp-cli,
  not only the UI's own state.
- Strengthened the Highlight-persistence E2E test to assert a real highlight annotation
  actually renders (the provider mock now returns one genuine `xhl` mark instead of plain
  text) in addition to the saved `post_content` staying byte-identical after an explicit
  save, a forced autosave, and a full editor reload.
- Added a `wordpress-e2e` CI job (`.github/workflows/quality-gate.yml`) that provisions a
  disposable WordPress site with `wp-env`, installs the existing provider-mocking mu-plugin,
  and runs `npm run test:e2e` against it; added `npm run test:browser` to the existing
  JavaScript CI job. The release `package` job now depends on `wordpress-e2e`, so a GitHub
  Release is never published if the WordPress E2E suite fails.
- Added `dom`, `mbstring`, `zip`, `xmlwriter`, `simplexml` as explicit PHP extensions in CI's
  PHP job, and added an explicit `TURGENEV_FORCE_NO_DOM=1 php tests/php/run.php` step there.

- Fixed `assets/build/*` runtime JS falling out of sync with `src/js/*` (a missing `content-reset.js` and four stale files carried an older build, so the shipped editor lacked the content-reset integration). Rebuilt via `tools/build-assets.mjs`; no source behavior changed.
- Added a regression test (`tests/js/assets-sync.test.mjs`) and moved `npm run check:assets` ahead of `npm run build` in CI so a source change committed without a matching rebuild fails the pipeline instead of shipping stale assets.
- Fixed an authorization bypass in `ApiController::handle()`: `risk`/`highlights` accepted any request from a user with the generic `edit_posts` capability whenever `post_id` was absent or `0`, instead of requiring `edit_post` on a specific, existing post. `risk`/`highlights` now always require a scalar positive `post_id` for an existing post plus `current_user_can( 'edit_post', $post_id )`, checked before any outbound HTTP request; `balance` requires `edit_post` on the post when a post ID is present, or `manage_options` when it is absent (Settings → Turgenev), and never falls back to `edit_posts`.
- Fixed `tests/php/run.php`'s `current_user_can()` stub, which previously matched on capability name alone and ignored the object ID argument, so a test granting `edit_post` for one post ID would silently authorize a request for a different one. The stub now records each call's capability, arguments and object ID, and grants must match the exact object argument to authorize a call. Added regression cases proving a grant scoped to one post ID never authorizes another, plus the full accept/reject matrix for `risk`/`highlights`/`balance`; each rejected case asserts `wp_remote_post()` is never called, and each accepted case asserts it is called exactly once.
- Added server-side rate limiting (`Support\RateLimiter`) for `risk` and `highlights`, since the editor's JS busy state can be skipped by calling the AJAX endpoint directly. Requests are counted per current user, post ID and operation via a WordPress transient and rejected with HTTP 429, before any outbound request to Turgenev, once a filterable limit (`turgenev_rate_limit`, default 12/60s for `risk` and 20/60s for `highlights`) is exceeded within the window. `balance` is unaffected.
- Fixed `ApiClient::reportHighlights()` measuring its text-length limit with `strlen( $expected_text ) > MAX_TEXT_LENGTH * 4`, a byte budget that let narrow (e.g. ASCII) payloads through at up to 4x the intended 20,000-character limit (an 80,000-character ASCII string previously passed). `analyze()` and `reportHighlights()` now share one private `validateTextPayload()` contract (non-empty, valid UTF-8, no NUL, `MAX_TEXT_LENGTH` measured in Unicode characters via `preg_match_all( '/./us', ... )`, never `strlen()`), checked before either makes an outbound request.
- Handled a missing PHP DOM extension without a fatal error: `ext-dom` was never declared as required (it isn't in `composer.json`), but `ReportHighlightParser` depended on `DOMDocument` unconditionally. Analysis and balance never used it and were already unaffected. Added `Requirements::hasDom()` as the single source of truth (overridable via constructor injection on `ReportHighlightParser` and `EditorIntegration`, so `tests/php/run.php` never depends on whether the host actually has `ext-dom`). The server now reports `highlightsAvailable` to the browser through `TurgenevConfig`; `src/js/analysis.js` no longer offers a Highlight button that is guaranteed to fail and shows a short, non-fatal notice instead.
- Fixed `package-lock.json` being out of sync with `package.json` (missing `@emnapi/core`/`@emnapi/runtime`), which made `npm ci` fail with `EUSAGE` on a clean checkout even though `npm install` silently tolerated it. Switched CI's `javascript` and would-be `package` install steps from `npm install` to `npm ci` for reproducible installs now that the lock file is consistent.
- Fixed `package.json` failing its own `lint:pkg-json` check (`wp-scripts lint-pkg-json`): added the required `bugs` field and reordered properties (`keywords`/`homepage`/`repository`/`bugs` before `devDependencies`/`scripts`) to satisfy `prefer-property-order`.
- Reordered `.github/workflows/ci.yml`'s `javascript` job so `check:assets` runs immediately after install (unchanged) but `build` now runs *after* all lint/test steps, followed by `git diff --exit-code -- assets/build languages`. This is a second, independent generated-state gate: unlike `check:assets`, it does not depend on that script's own logic being complete, and fails the job if `build` touches any tracked file at all. Removed the `package` job's `npm run build` step, which — by rebuilding before its own `check-assets.mjs` call inside `tools/build-zip.sh` — could silently repair a stale committed asset and let the job pass; added the same post-build `git diff --exit-code` gate there instead.
- Fixed `release.yml` publishing a GitHub Release for any `vX.Y.Z` tag after only a version check and an unguarded `npm run build` — no PHP/JS tests, no lint, no asset-consistency check, and no dependency on `ci.yml` passing at all; a tag on a commit that would fail ordinary CI could still ship a release. Extracted CI's three jobs into a reusable `.github/workflows/quality-gate.yml`; `ci.yml` and `release.yml` now both call it, so a release runs the identical checks CI runs, not a hand-maintained approximation that can drift out of sync. `release.yml`'s new `publish` job (`needs: quality-gate`, elevated to `contents: write` only for this one job) re-downloads the artifact `quality-gate` already built, verifies archive integrity (`unzip -t`) and that every runtime asset `EditorIntegration.php` enqueues from `assets/build/` is physically present in the packaged plugin (new `tools/verify-release-assets.mjs`, extracting to a temp directory), and only then creates the GitHub Release.
- Removed the WordPress site URL (`home_url( '/' )`) from `ApiClient`'s `User-Agent` header sent to the Turgenev provider on every `risk`/`highlights`/`balance` request. It served no functional purpose (the provider already receives the API key to identify the account) and was undocumented in `readme.txt`'s external-service disclosure. The header is now a plain `Turgenev-WordPress/<version>` with no site-identifying data.
- Fixed the two `npm run test:e2e*` scripts having a self-contradictory contract: `test:e2e` ran a fixture-only DOM harness with no WordPress/database/AJAX at all, while `test:e2e:admin` was the real Playwright-against-WordPress suite `README.md`/`docs/testing.md` described as `test:e2e`, and `AGENTS.md` separately listed `test:e2e` alongside checks needing no live site. Renamed the fixture harness to `test:browser` and gave `test:e2e` the real-WordPress meaning the existing docs already assumed, so `README.md`/`docs/testing.md` needed no prose changes; corrected `AGENTS.md`'s contradiction directly.
- Added a real WordPress E2E suite (`tests/e2e/editor.spec.js`, `tests/e2e/support/wp-cli.mjs`) covering: the Gutenberg document panel and Classic Editor metabox are visible; a document can be analyzed unsaved (never mutates the stored draft); an invalid nonce is rejected with a non-fatal message; a contributor without `edit_post` on a specific post is rejected (proving the object-ID-scoped authorization fix, not just a generic capability check); running Highlight leaves the saved `post_content` byte-identical; the configured API key never reaches page HTML or `TurgenevConfig`; the missing-`ext-dom` path hides the Highlight action and shows a notice; and a missing runtime asset produces a real, detectable browser-side failure rather than a silent no-op.
- Added `tests/e2e/mu-plugins/turgenev-e2e-support.php` (install only on a disposable test site, never production) so `test:e2e` mocks every Turgenev provider request through `pre_http_request` instead of hitting a real paid account, adds a `turgenev_has_dom` filter (`Requirements::hasDom()`) a test can flip via `wp option update turgenev_e2e_force_no_dom 1` to exercise the missing-DOM path without an environment that actually lacks `ext-dom`, and registers a `show_in_rest => false` post type so the Classic Editor metabox scenario doesn't depend on installing the separate Classic Editor plugin.
- Closed two security-regression coverage gaps found while auditing the existing guarantees against their tests: added a `dangerouslySetInnerHTML` absence check next to the existing `innerHTML` one in `tests/js/security-contract.test.mjs`, and added `tests/php/run.php` cases proving `ApiClient::request()`/`reportHighlights()` reject an oversized raw response body (`> MAX_REPORT_LENGTH`) before parsing, not just relying on the HTTP layer's own `limit_response_size` cap. Both new checks were verified to fail against the prior (unprotected) code before being added.
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
