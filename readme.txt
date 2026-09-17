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

The plugin adds a permanent **Turgenev** panel to the Block Editor's document settings sidebar (not the block inspector, and not tied to any block selection), plus a Classic Editor metabox for post types that use the Classic Editor. Clicking **Analyze document** sends the entire current draft — including any unsaved changes — to Turgenev and returns the overall risk score, analysis sections and links to detailed Turgenev reports.

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
* a permanent **Turgenev document settings panel** in the Block Editor sidebar that analyzes the whole current document, not a selected block;
* **Classic Editor metabox** integration;
* **server-side Turgenev API requests** through the WordPress HTTP API;
* **API key never exposed to browser JavaScript**;
* **WordPress nonce and object-level capability checks** (`current_user_can( 'edit_post', $post_id )`) for every document-analysis request;
* **server-side rate limiting**, independent of the editor's UI, bounding both how often one post can be analyzed and how many requests one user can make in total across every post;
* **safe API-key rotation** that keeps the previous key when validation fails;
* **balance validation** instead of spending an analysis request just to test a key;
* **defensive JSON and HTTP error handling**;
* **safe DOM rendering** for external API data — highlight previews are presentation-only and never change the saved post content;
* development tests, Playwright E2E scaffolding and CI/release automation in the source repository.

= Simple workflow =

1. Install and activate Turgenev.
2. Open **Settings → Turgenev**.
3. Add your Turgenev API key.
4. Open a post or page in the Block Editor (or the Classic Editor, if the post type uses it).
5. In the Block Editor, open **Document (Turgenev)** in the settings sidebar; in the Classic Editor, use the Turgenev metabox.
6. Click **Analyze document**. This sends the entire current document text — including unsaved edits — to the Turgenev service.
7. Review the score and analysis sections, and optionally use **Highlight** to preview flagged passages in the editor (this never changes the saved content) or open a detailed report on the Turgenev website.

= Privacy and API-key security =

The saved API key remains on the WordPress server. It is never inserted into page HTML, localized JavaScript, or any other browser-visible output.

See "External service" below for exactly what data leaves WordPress, when, and why.

= External service =

This plugin depends on the third-party **Turgenev** service, operated by **ООО «Интернет-Лингвистика»** ("Internet-Linguistics" LLC; OGRN 1087746363682, INN 7727645011) at `https://turgenev.ashmanov.com/`.

Exactly what is sent, and when:

* **Analyze document**: when an authenticated editor clicks **Analyze document**, the full current text of the document being edited (including unsaved changes) is sent to Turgenev, together with the API key stored in WordPress, so the request can be attributed to your account.
* **API key**: the API key is added to every Turgenev request exclusively by the WordPress server. It is configured once in **Settings → Turgenev** (or validated inline when you save a new key) and is never present in any browser-side JavaScript, page source, or REST/AJAX response sent to the browser.
* **Balance check**: viewing or validating your account balance (in Settings, or from the editor's low-balance notice) sends the API key to Turgenev's balance endpoint; it does not send document content.
* **Highlight**: after an analysis, using **Highlight** may make a further request to Turgenev to retrieve the detailed report used to render highlight ranges in the editor. This request uses a report reference returned by the prior analysis, not a fresh copy of the API key.
* Turgenev may log or retain submitted content and account activity according to its own terms; this plugin does not control Turgenev's own data retention.

Turgenev is a separate, commercial service and may charge for API usage according to its current pricing. By configuring and using this integration, the site administrator is responsible for ensuring that sending content to Turgenev is appropriate for the site's own privacy policy and applicable data-protection obligations (for example, when analyzing content containing personal data).

Turgenev service and account links:

* Service website: https://turgenev.ashmanov.com/
* API key / account page: https://turgenev.ashmanov.com/?a=apikey
* Terms of Service (public offer for the Turgenev service): https://turgenev.ashmanov.com/?a=org
* Personal data processing policy: published on the same page as the Terms of Service above ("Соглашение на обработку персональных данных" / "Personal Data Processing Agreement"), under the same operator, ООО «Интернет-Лингвистика».

No separate, standalone URL for the personal-data policy is published outside of the Terms of Service page linked above; both documents are served from `https://turgenev.ashmanov.com/?a=org`.

== Installation ==

1. In WordPress, go to **Plugins → Add New** and install Turgenev, or upload the plugin ZIP manually.
2. Activate **Turgenev**.
3. Go to **Settings → Turgenev**.
4. Enter your Turgenev API key and save it.
5. Open a post or page in the Block Editor or Classic Editor.
6. Run the content analysis from the Turgenev panel (Block Editor: document settings sidebar; Classic Editor: the Turgenev metabox).

== Frequently Asked Questions ==

= Does the plugin expose my Turgenev API key in JavaScript? =

No. All provider requests are made server-side by WordPress. Browser requests to the plugin's own AJAX endpoint contain a WordPress nonce, the document text (or, for Highlight, a report reference) and the target post ID — never the provider API key.

= What happens if I enter a bad replacement API key? =

The new key is validated (via the balance endpoint) before storage. If validation fails, the previously saved key is retained instead of being overwritten. Submitting a blank field also preserves the current key; only an explicit "clear key" action removes it.

= Does saving settings spend a text-analysis request? =

No. The API key is validated with the balance operation rather than sending a dummy text to the risk-analysis endpoint.

= Does it work with Gutenberg / the Block Editor? =

Yes. Turgenev adds a permanent **Turgenev** panel to the Block Editor's document settings sidebar. It analyzes the entire current document — including changes you have not saved yet — not a selected block or piece of text. The Classic Editor is supported through a metabox instead.

= Does analysis require the document to be saved first? =

No. **Analyze document** reads the current in-memory editor content, so you can check unsaved drafts before publishing or saving.

= Who can analyze a given post? =

Any user who can edit that specific post (WordPress's own `edit_post` capability for that post ID), enforced on the server for every request — a generic "can edit posts" capability is not enough on its own. Viewing your Turgenev balance without selecting a post requires the `manage_options` capability (i.e., the Settings screen).

= Is there a limit on how many times I can analyze the same document? =

Yes. The server enforces its own rate limits, independent of the editor's UI, so scripted or repeated requests cannot be used to exceed normal editorial use or to run up unexpected provider costs.

= Does Turgenev require the PHP DOM extension? =

No. Content analysis and balance checks work without it. Only the optional in-editor "Highlight" preview needs the PHP DOM extension (`ext-dom`) to parse the provider's report markup. If it is not installed, the editor does not offer the Highlight action and shows a short notice instead; nothing else is affected.

= Does Highlight change my saved post content? =

No. Highlight is a presentation-only overlay rendered in the editor. It never modifies `post_content`, before or after saving, autosaving, or reloading the editor.

= Is Turgenev itself free? =

This WordPress plugin is GPL-licensed software. The external Turgenev service is separate and can have paid API usage. Check the provider's website (linked under "External service" above) for current terms and pricing.

== Screenshots ==

1. Turgenev API settings (Settings → Turgenev).
2. The Turgenev panel in the Block Editor, showing analysis results and the current balance.

== Changelog ==

= 2.0.0 - 2026-09-17 =
* Major production-focused rewrite for WordPress 6.6+ and PHP 8.1+.
* Keep the Turgenev API key server-side instead of exposing it to editor JavaScript.
* Route balance and analysis requests through authenticated WordPress AJAX with nonce and object-level (`edit_post`) capability checks; a generic `edit_posts` capability is never accepted on its own for document operations.
* Add independent, server-side, filterable rate limiting for `risk`, `highlights` and `balance`, enforced both per post and per user across all posts combined, so switching between posts cannot be used to exceed the effective budget. Rejected requests never reach the Turgenev provider.
* Validate new API keys through the balance endpoint and preserve an existing key when validation fails or the field is left blank.
* Remove the legacy paid `risk` request that was used only to validate settings.
* Add defensive HTTP/JSON/provider-response validation, including strict Unicode-character length limits (20,000 characters) and rejection of malformed UTF-8 or embedded NUL bytes before any outbound request.
* Replace provider-controlled `innerHTML` rendering with safe DOM/text rendering; highlight previews are presentation-only and never modify saved post content.
* Degrade gracefully when the PHP DOM extension (`ext-dom`) is unavailable: analysis and balance are unaffected, and the Highlight action is hidden with a clear notice instead of failing.
* Improve Classic Editor handling when TinyMCE is unavailable or in text mode.
* Remove arbitrary low-balance workflow deletion from the editor UI.
* Document the previously undocumented `api=balance` operation, and the exact data sent to the third-party Turgenev service, in `API.md` and this readme.
* Fix `tbclass` API documentation typo/ambiguity.
* Add GitHub Actions, dependency updates, release packaging, PHP smoke tests, JavaScript tests and Playwright E2E scaffolding (Gutenberg panel, Classic Editor metabox, authorization, nonce validation, no-API-key-exposure and missing-DOM-extension coverage).
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
