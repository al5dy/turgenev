# Turgenev for WordPress

[![WordPress](https://img.shields.io/badge/WordPress-6.6%2B-21759B?logo=wordpress&logoColor=white)](https://wordpress.org/)
[![PHP](https://img.shields.io/badge/PHP-8.1%2B-777BB4?logo=php&logoColor=white)](https://www.php.net/)
[![License](https://img.shields.io/badge/license-GPL--2.0--or--later-blue.svg)](LICENSE)

**Turgenev for WordPress** is a production-oriented integration with the Turgenev content-analysis API for SEO over-optimization, keyword repetition, style, readability, query coverage, "wateriness"/formality signals, and Yandex Baden-Baden risk.

Version 2.0.0 is not a thin browser wrapper around a third-party endpoint. The integration is deliberately built around a server-side trust boundary: the provider credential remains in WordPress, the browser talks only to authenticated WordPress AJAX, every document operation is authorized against the exact post being edited, remote responses are validated before they reach the UI, and report highlighting is presentation-only.

## What this repository is designed to guarantee

The core engineering goals are straightforward:

1. **The Turgenev API key must never enter the browser.**
2. **A WordPress user must never be able to analyze a post they cannot edit.**
3. **A provider response must never become executable browser markup.**
4. **Highlighting must never mutate or contaminate `post_content`.**
5. **A bad replacement API key or provider outage must never destroy a working configuration.**
6. **A browser-side race or scripted request loop must not bypass server-side request limits.**
7. **The release ZIP must be reproducible from allowlisted runtime files rather than from the developer working tree.**

Those constraints shape the entire architecture.

---

## Requirements

### Runtime

- WordPress **6.6+**
- PHP **8.1+**
- JavaScript enabled in `wp-admin`
- A Turgenev account and API key
- PHP DOM extension (`ext-dom`) **optional**: required only for in-editor report highlighting/details that need provider HTML parsing

### Development

- Node.js **20.19+**
- npm **10+**
- Composer 2
- Docker for `@wordpress/env` E2E testing
- Chromium for Playwright-based browser tests

---

## Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│ WordPress editor                                                   │
│                                                                    │
│ Gutenberg toolbar + Turgenev overlay / Classic Editor metabox      │
│                                                                    │
│ Sends only: nonce + operation + post_id + current editor content   │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                │ POST /wp-admin/admin-ajax.php
                                │ action=turgenev_api
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ Al5dy\Turgenev\Ajax\ApiController                                  │
│                                                                    │
│ • WordPress nonce validation                                       │
│ • existing positive post ID validation                             │
│ • current_user_can( 'edit_post', $post_id )                        │
│ • manage_options for settings-only balance calls                   │
│ • per-post + per-user/global server-side rate limiting             │
│ • secret-safe error normalization                                  │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                ▼
┌────────────────────────────────────────────────────────────────────┐
│ Al5dy\Turgenev\Api\ApiClient                                       │
│                                                                    │
│ • reads turgenev[api_key] only on the server                       │
│ • bounded HTTPS POST requests                                      │
│ • SSL verification enabled                                         │
│ • redirects disabled                                               │
│ • response-size limits                                             │
│ • provider JSON / HTML validation                                  │
│ • secret redaction                                                 │
└───────────────────────────────┬────────────────────────────────────┘
                                │
                                │ HTTPS
                                ▼
                    https://turgenev.ashmanov.com/
```

The browser never receives the provider API key. The credential is injected only at the PHP transport boundary.

---

## Request lifecycle

### 1. Editor snapshot

The integration reads the **current in-memory document**, not merely the last saved database revision. Gutenberg analysis therefore works against unsaved changes.

By default, the plugin builds an analysis payload from visible document text while retaining block boundaries so words from adjacent blocks are not accidentally concatenated.

An explicit **HTML analysis (send markup)** mode is also available when the editor needs the provider to analyze markup-aware content.

### 2. WordPress authorization boundary

The browser sends an authenticated AJAX request to WordPress.

For document operations, the controller requires:

```php
current_user_can( 'edit_post', $post_id )
```

A generic `edit_posts` capability is not accepted as a substitute for object-level authorization.

The controller also rejects missing, malformed, non-positive, or non-existent post IDs before the provider can be contacted.

### 3. Server-side abuse control

`Support\RateLimiter` applies two fixed-window buckets per operation:

- **per user + post** — prevents one document from being hammered;
- **per user across all posts** — prevents post rotation from multiplying the request budget.

The default operations are:

- `risk`
- `highlights`
- `details`
- `balance`

With a persistent external object cache, atomic cache primitives are used. Without one, the plugin serializes transient increments behind an `add_option()` mutex, including stale-lock recovery. If a counter cannot be updated safely, the limiter fails closed rather than allowing an uncounted paid request through.

Both rate-limit layers are filterable:

```php
turgenev_rate_limit
turgenev_rate_limit_global
```

### 4. Provider request

`ApiClient` sends requests through the WordPress HTTP API with:

- HTTPS;
- `sslverify => true`;
- redirects disabled;
- bounded timeout;
- bounded response size;
- plugin-scoped User-Agent;
- server-only API-key injection.

Supported provider operations used by the integration include:

```text
risk
frequency
style
keywords
formality
readability
balance
```

The editor's primary analysis request uses `risk` with extended details, then uses report references returned by the provider for section details and highlight data.

### 5. Response validation

Provider data is treated as untrusted input.

The transport rejects or normalizes:

- network failures;
- non-2xx HTTP responses;
- empty bodies;
- oversized responses;
- malformed JSON;
- unexpected top-level JSON shapes;
- provider-level `error` responses;
- malformed balance values;
- invalid report references;
- malformed report HTML.

Provider-controlled text is not rendered through arbitrary `innerHTML`.

### 6. Presentation-only highlighting

The highlight subsystem maps validated report ranges back to the live editor surface.

Highlighting is intentionally **decoupled from stored content**:

- it does not inject persistent highlight markup into Gutenberg block attributes;
- it does not modify `post_content`;
- it survives editor rendering without becoming part of save/autosave payloads;
- it can be removed/rebuilt independently of the document.

This invariant is covered by browser and real WordPress E2E tests.

---

## Content model and limits

The current runtime accepts up to **50,000 visible Unicode characters per analysis**.

Important implementation details:

- limits are based on Unicode characters, not raw byte length;
- malformed UTF-8 is rejected;
- embedded NUL bytes are rejected;
- HTML mode counts visible text rather than markup bytes;
- a defensive payload-byte ceiling still prevents pathological markup expansion;
- visible-text normalization preserves meaningful block separation.

This matters for Cyrillic and other multibyte content where `strlen()` alone would produce an incorrect character count.

---

## Gutenberg integration

The Gutenberg implementation is intentionally independent of block selection.

It provides:

- a **Turgenev** button in the editor toolbar;
- a dedicated Turgenev overlay synchronized with the WordPress settings-sidebar geometry;
- full-document analysis;
- support for unsaved editor state;
- current API balance;
- balance refresh;
- direct top-up link;
- plain-text / HTML analysis mode;
- overall risk;
- expandable report sections;
- validated report details;
- presentation-only highlighting.

The integration tracks Gutenberg DOM remounts and layout changes rather than assuming that the editor toolbar or sidebar is permanently mounted.

That matters on modern WordPress screens where editor regions can be recreated during view changes, template editing, responsive transitions, or plugin-driven UI updates.

---

## Classic Editor integration

For non-block-editor screens, Turgenev registers a side metabox for editor-enabled post types.

The adapter supports:

- TinyMCE visual mode;
- text/textarea mode;
- current balance;
- top-up link;
- analysis without exposing the provider key;
- the same AJAX/security boundary as Gutenberg;
- presentation-only report highlighting where supported.

The editor implementation is selected from the active `WP_Screen`, not inferred only from post-type capabilities. This avoids incorrect behavior when the Classic Editor switches individual screens away from Gutenberg.

---

## API-key lifecycle

The key is stored in the existing WordPress option:

```text
turgenev[api_key]
```

This preserves compatibility with 1.x installations.

The settings flow is intentionally non-destructive:

- the saved key is never printed back into the password input;
- only a fixed-length masked suffix is displayed;
- an empty field means "keep the current key";
- a replacement key is checked through the provider's balance operation before storage;
- a rejected replacement key leaves the previous key untouched;
- a provider/network failure during validation also leaves the previous key untouched;
- deleting the key requires the explicit **Delete API Key** action.

The validation path uses the balance operation instead of burning a content-analysis request merely to test credentials.

---

## External-service boundary

Turgenev is an external service at:

- Service: https://turgenev.ashmanov.com/
- API-key/account page: https://turgenev.ashmanov.com/?a=apikey
- Balance top-up: https://turgenev.ashmanov.com/?a=pay

Document content leaves WordPress only when an authenticated editor explicitly starts an analysis.

A balance request sends the server-side API key but does not send document content.

The Turgenev provider publishes its own pricing, account, privacy, and service terms. Those provider terms are independent of this GPL-licensed WordPress plugin and can change over time.

---

## Security model

### Secret containment

The provider API key is never localized into `TurgenevConfig`, HTML, REST output, or browser-visible AJAX responses.

### CSRF protection

AJAX requests require a WordPress nonce associated with the Turgenev API action.

### Object-level authorization

Analysis, highlights, and section details are authorized against the exact post ID.

### XSS resistance

External strings are rendered with DOM/text primitives. Provider HTML is parsed into constrained internal structures before browser rendering.

### SSRF resistance

The integration uses a fixed provider endpoint and does not let browser input choose arbitrary remote hosts.

### Redirect resistance

Provider requests disable HTTP redirects.

### Transport validation

SSL verification remains enabled.

### Bounded input/output

Text payloads, report bodies, report marks, and response structures are explicitly bounded and validated.

### Fail-closed behavior

When request accounting cannot be updated safely, the plugin rejects the request instead of silently bypassing the limit.

---

## Repository layout

```text
turgenev.php
src/
├── Admin/
│   ├── EditorIntegration.php
│   └── SettingsPage.php
├── Ajax/
│   └── ApiController.php
├── Api/
│   ├── ApiClient.php
│   ├── ApiException.php
│   ├── ReportHighlightParser.php
│   ├── ReportSectionParser.php
│   └── ResponseValidator.php
├── I18n/
│   └── ...
└── Support/
    ├── ContentProtection.php
    ├── OptionStore.php
    ├── RateLimiter.php
    └── Requirements.php

resources/
└── ts/ + scss/          # TypeScript/Sass source

assets/                  # committed production browser assets
languages/               # translation catalogs
tests/
├── php/                 # PHP regression suite
├── js/                  # Node contract/unit tests
├── browser/             # deterministic fixture browser harness
└── e2e/                 # Playwright against disposable WordPress

tools/
├── build-release.php
├── build-zip.sh
├── check-php-syntax.php
├── check-version.php
└── verify-release-assets.mjs
```

---

## Development

Install dependencies:

```bash
composer install
npm ci
```

Run PHP syntax and regression checks:

```bash
php tools/check-php-syntax.php
php tools/check-version.php
php tests/php/run.php
TURGENEV_FORCE_NO_DOM=1 php tests/php/run.php
composer lint
```

Run JavaScript/TypeScript/CSS checks:

```bash
npm run lint:js
npm run check:syntax
npm run test:js
npm run lint:css
npm run lint:pkg-json
```

Build committed runtime assets:

```bash
npm run build
git diff --exit-code -- assets languages
```

---

## Browser testing strategy

The project intentionally has two browser layers.

### Deterministic browser smoke harness

```bash
npm run test:browser
```

This loads actual WordPress browser packages from a WordPress installation while replacing database/login/provider concerns with deterministic fixtures.

It covers editor behavior such as:

- highlight flows;
- Classic Editor rendering;
- text/report mapping;
- saved-post mapping;
- template-aware content handling.

### Real WordPress E2E

```bash
npx wp-env start
npx playwright install chromium
npm run test:e2e
npx wp-env stop
```

The E2E suite runs against a disposable real WordPress environment and covers behavior that cannot be proven by a DOM fixture alone, including:

- WordPress authentication;
- settings and API-key lifecycle;
- Gutenberg integration;
- Classic Editor integration;
- object-level authorization;
- nonce rejection;
- no-secret-in-browser invariants;
- saved-content integrity during highlighting;
- missing-DOM graceful degradation;
- missing runtime-asset observability.

Outbound calls to the live Turgenev provider are intercepted by the E2E support MU plugin so tests do not spend real account balance.

---

## CI and release engineering

The GitHub Actions quality gate separates concerns:

```text
PHP 8.1 ─┐
PHP 8.2  │
PHP 8.3  ├──► WordPress E2E ───► production ZIP
PHP 8.4  │
JS/CSS ──┘
```

The pipeline verifies:

- PHP 8.1–8.4;
- Composer metadata;
- PHP syntax;
- version consistency;
- PHP regression tests;
- forced no-DOM regression path;
- WordPress Coding Standards;
- TypeScript;
- JavaScript syntax/tests;
- CSS;
- `package.json`;
- generated asset drift;
- real WordPress E2E;
- release ZIP integrity;
- packaged runtime assets;
- SHA-256 manifest.

### Deterministic release ZIP

Build:

```bash
bash tools/build-zip.sh
```

The release builder uses an **allowlist**, not a recursive copy of the repository.

Production packages contain only runtime material such as:

- `turgenev.php`
- `uninstall.php`
- `readme.txt`
- `LICENSE`
- runtime PHP under `src/`
- compiled JS/CSS under `assets/`
- translation files under `languages/`

Development infrastructure such as tests, source TypeScript, CI metadata, IDE state, `node_modules`, Composer dependencies, and local browser artifacts is not packaged.

The ZIP is emitted as:

```text
dist/turgenev-<version>.zip
dist/turgenev-<version>.zip.sha256
```

File order, timestamps, and UNIX file attributes are normalized by the release builder.

---

## Operational behavior

### No API key configured

The editor integration remains visible and presents a configuration action rather than silently disappearing.

### Empty provider balance

The panel reports the empty balance and points directly to the provider's top-up page.

### Provider unavailable

The request fails with a plugin-owned message. Secrets and raw provider errors are not reflected to the browser.

### `ext-dom` unavailable

Balance and content analysis continue to work. Features requiring provider-report DOM parsing are disabled gracefully.

### Replacement key invalid

The working key remains stored.

### Text too long

The request is rejected before remote analysis with a consistent 50,000-visible-character limit message.

---

## Privacy

When an editor runs an analysis, the current document content is transmitted to the external Turgenev service for processing.

Site owners should review the provider's current data-processing terms and ensure that sending the content is compatible with their own privacy policy and legal obligations.

The plugin itself does not send the API key to browser JavaScript.

---

## License

Turgenev for WordPress is licensed under **GPL-2.0-or-later**.

See [`LICENSE`](LICENSE).

Copyright © 2026 Anton Lokotkov.
