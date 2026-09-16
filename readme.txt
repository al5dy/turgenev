=== Turgenev ===
Contributors: al5dy
Tags: seo, content analysis, readability, yandex, gutenberg
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Analyze WordPress content for SEO over-optimization, keyword stuffing, readability, style and Yandex Baden-Baden risk with the Turgenev API.

== Description ==

**Bring professional Turgenev content analysis directly into the WordPress editor.**

Turgenev connects WordPress to the Turgenev text-quality and SEO analysis service so editors, copywriters, content teams and SEO specialists can evaluate content without constantly copying drafts between WordPress and a separate browser tab.

Select a supported text block in Gutenberg / the Block Editor and run an analysis from its Turgenev panel in the Block inspector, or use the Classic Editor metabox. Paragraphs, headings, list items, quotes, pullquotes, code, preformatted and verse blocks are supported. Review the overall risk score, analysis sections and links to detailed Turgenev reports.

= SEO and content checks inside WordPress =

Turgenev can help editorial teams review signals related to:

* SEO over-optimization and Baden-Baden risk;
* excessive word and phrase repetition;
* keyword stuffing and query coverage;
* stylistic problems and awkward constructions;
* formality / "wateriness" indicators;
* readability;
* the overall Turgenev risk score.

The plugin is useful for SEO content review, copywriting QA, editorial workflows, landing pages, articles and other WordPress content where text quality matters.

= Built for modern WordPress =

Version 2.0.0 is a major technical rewrite:

* **WordPress 6.6+ and PHP 8.1+** baseline;
* **Block Editor / Gutenberg Block inspector** integration for selected text blocks;
* **Classic Editor metabox** integration;
* **server-side Turgenev API requests** through the WordPress HTTP API;
* **API key never exposed to browser JavaScript**;
* **WordPress nonce and capability checks** for API actions;
* **safe API-key rotation** that keeps the previous key when validation fails;
* **balance validation** instead of spending an analysis request just to test a key;
* **defensive JSON and HTTP error handling**;
* **safe DOM rendering** for external API data;
* development tests, Playwright E2E scaffolding and CI/release automation in the source repository.

= Simple workflow =

1. Install and activate Turgenev.
2. Open **Settings → Turgenev**.
3. Add your Turgenev API key.
4. Open a post or page.
5. Select a text block and click **Analyze selected block** in its Turgenev panel.
6. Review the score and open detailed reports when needed.

= Privacy and API-key security =

The saved API key remains on the WordPress server. It is not inserted into page source or localized JavaScript.

Text from the selected Block Editor text block, or the active Classic Editor document, is sent to the external Turgenev service only after an authenticated editor explicitly starts an analysis.

= External service =

This plugin depends on the third-party **Turgenev** service operated at `https://turgenev.ashmanov.com/`.

When you click **Analyze content**, the text selected for analysis is sent to Turgenev together with the API key stored in WordPress. The plugin also uses Turgenev's balance API to validate a key and display account balance. Turgenev is a separate service and may charge for API usage according to its current terms and pricing.

Service website: https://turgenev.ashmanov.com/
API key/account page: https://turgenev.ashmanov.com/?a=apikey

By configuring and using the API integration, the site administrator is responsible for ensuring that sending content to this external service is appropriate for the site's privacy and data-processing requirements.

== Installation ==

1. In WordPress, go to **Plugins → Add New** and install Turgenev, or upload the plugin ZIP manually.
2. Activate **Turgenev**.
3. Go to **Settings → Turgenev**.
4. Enter your Turgenev API key and save it.
5. Open a post or page in the Block Editor or Classic Editor.
6. Run the content analysis from the Turgenev panel.

== Frequently Asked Questions ==

= Does the plugin expose my Turgenev API key in JavaScript? =

No. Version 2.0.0 performs provider requests server-side. Browser requests contain a WordPress nonce and the content to analyze, not the provider API key.

= What happens if I enter a bad replacement API key? =

The new key is validated before storage. If validation fails, the previously saved key is retained instead of being overwritten.

= Does saving settings spend a text-analysis request? =

Version 2.0.0 validates the API key with the balance operation rather than sending a dummy text to the risk-analysis endpoint.

= Does it work with Gutenberg / the Block Editor? =

Yes. Turgenev adds a dedicated editor sidebar. The Classic Editor is also supported through a metabox.

= Does Turgenev require the PHP DOM extension? =

No. Content analysis and balance checks work without it. Only the optional in-editor "Highlight" preview needs the PHP DOM extension (`ext-dom`) to parse the provider's report markup. If it is not installed, the editor does not offer the Highlight action and shows a short notice instead; nothing else is affected.

= Is Turgenev itself free? =

This WordPress plugin is GPL-licensed software. The external Turgenev service is separate and can have paid API usage. Check the provider website for current terms and pricing.

== Screenshots ==

1. Turgenev API settings.
2. Turgenev content-analysis panel in the editor.

== Changelog ==

= 2.0.0 - 2026-09-13 =
* Major production-focused rewrite for WordPress 6.6+ and PHP 8.1+.
* Keep the Turgenev API key server-side instead of exposing it to editor JavaScript.
* Route balance and analysis requests through authenticated WordPress AJAX with nonce/capability checks.
* Validate new API keys through the balance endpoint and preserve an existing key when validation fails.
* Remove the legacy paid `risk` request that was used only to validate settings.
* Add defensive HTTP/JSON/provider-response validation.
* Replace provider-controlled `innerHTML` rendering with safe DOM/text rendering.
* Improve Classic Editor handling when TinyMCE is unavailable or in text mode.
* Remove arbitrary low-balance workflow deletion from the editor UI.
* Document the previously undocumented `api=balance` operation in `API.md`.
* Fix `tbclass` API documentation typo/ambiguity.
* Add GitHub Actions, dependency updates, release packaging, PHP smoke tests, JavaScript tests and Playwright E2E scaffolding.
* Add `AGENTS.md`, architecture, testing, Codex and release engineering documentation.
* Align project licensing to GPLv2 or later.

= 1.4 - 2020-07-22 =
* Bugfix check balance function.
* Add translations.
* Minor fixes.

= 1.3 - 2020-07-22 =
* Add balance checker in settings page.
* Add translations.
* Minor fixes.

= 1.2 - 2020-07-22 =
* Encode URL for API requests.

= 1.1 - 2020-07-21 =
* Bugfix check content function.

= 1.0 - 2020-07-19 =
* First release.

== Upgrade Notice ==

= 2.0.0 =
Major security and compatibility update. Existing `turgenev[api_key]` settings are reused automatically.
