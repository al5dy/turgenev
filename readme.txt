=== Turgenev ===
Contributors: al5dy
Tags: seo, content analysis, readability, copywriting, yandex
Requires at least: 6.6
Tested up to: 7.1
Requires PHP: 8.1
Stable tag: 2.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

SEO content analysis for WordPress: detect over-optimization, keyword stuffing, readability issues, style problems and Yandex Baden-Baden risk.

== Description ==

**Professional SEO content analysis directly inside WordPress — without copying drafts into a separate tool.**

Turgenev connects the WordPress Block Editor and Classic Editor to the Turgenev content-analysis service. It is built for SEO specialists, copywriters, editors, content teams, agencies and site owners who want to review text quality, search over-optimization and readability before publishing.

Analyze the **current WordPress document, including unsaved changes**, and review Turgenev's overall risk score plus detailed sections for repetition, style, keywords, formality and readability.

No browser extension. No copy/paste workflow. No provider API key exposed to JavaScript.

= What Turgenev helps you review =

The Turgenev service analyzes text using multiple independent signals. According to the provider, these can help identify content patterns associated with unnatural or over-optimized SEO copy, including:

* **SEO over-optimization** and signals associated with Yandex Baden-Baden risk;
* **keyword stuffing** and unnatural keyword repetition;
* unusually frequent words and phrases;
* query / keyword coverage;
* stylistic problems, SEO clichés and bureaucratic wording;
* "wateriness" / low-information wording;
* long or difficult sentences;
* readability;
* the combined Turgenev risk score.

The provider explicitly describes its score as a **risk indicator, not a guarantee of a search-engine penalty**. The goal is not to chase a zero score mechanically, but to find text that may deserve editorial attention.

= Built for SEO and editorial workflows =

Turgenev is useful for:

* SEO landing pages;
* commercial category and service pages;
* blog articles;
* product and category copy;
* agency content QA;
* copywriter review;
* editor approval workflows;
* Russian-language SEO content audits;
* pre-publication readability checks;
* detecting repetitive or template-like text.

Instead of switching between WordPress and a separate analysis page, editors can review the current document from the same editing screen.

= Gutenberg / Block Editor integration =

The plugin adds a **Turgenev** button to the WordPress editor toolbar.

Open it to access a dedicated Turgenev panel with:

* current Turgenev account balance;
* balance refresh;
* a direct balance top-up link;
* **Analyze document**;
* optional **HTML analysis (send markup)** mode;
* overall risk;
* detailed analysis sections;
* links to provider reports;
* in-editor highlighting when the server supports the required DOM component.

Analysis is not tied to the currently selected Gutenberg block. Turgenev analyzes the **whole current document**.

You do **not** need to save the post first: the plugin reads the current in-memory editor state, including unsaved edits.

= Classic Editor support =

Post types using the Classic Editor receive a Turgenev metabox.

The integration supports both TinyMCE visual mode and the underlying textarea/text mode while using the same secure server-side API bridge as Gutenberg.

= Plain-text and HTML analysis =

By default, the plugin sends a normalized representation of the visible document text while preserving meaningful block boundaries.

If you explicitly enable **HTML analysis (send markup)**, the provider receives an HTML-aware payload instead.

The runtime accepts up to **50,000 visible Unicode characters per check**. Invalid UTF-8 and embedded NUL characters are rejected before an outbound analysis request is made.

= API key stays on your WordPress server =

The Turgenev API key is stored in WordPress and is never intentionally exposed through:

* localized editor JavaScript;
* HTML source;
* browser-visible AJAX responses;
* Gutenberg configuration objects.

The browser talks to WordPress. WordPress talks to Turgenev.

Every document-analysis request is protected by:

* a WordPress nonce;
* validation of the target post;
* `current_user_can( 'edit_post', $post_id )` for that exact post;
* server-side per-post and per-user rate limiting.

= Safe API-key replacement =

Go to **Settings → Turgenev** to configure the provider API key.

When you enter a new key, the plugin verifies it through the Turgenev balance operation **before replacing the working key**.

That means:

* an empty field keeps the current key;
* an invalid replacement does not erase the current key;
* a provider outage during verification does not erase the current key;
* only **Delete API Key** explicitly removes the saved key.

The saved secret is never printed back into the password field. WordPress displays only a masked suffix.

= Report highlighting does not alter your content =

Highlighting is visual only.

The plugin does not persist Turgenev highlight markup into `post_content`, block attributes, revisions or autosaves. Your article remains your article.

= Server-side rate limiting =

Turgenev is an external service with account usage/billing, so the plugin does not rely only on a disabled button in JavaScript.

The WordPress backend applies independent request limits per user/post and per user across all posts. If either limit is exceeded, the request is rejected before contacting the provider.

= Graceful server compatibility =

The PHP DOM extension is optional.

Without `ext-dom`:

* account balance still works;
* normal content analysis still works;
* functionality that requires parsing the provider's HTML report is disabled gracefully rather than crashing the editor.

= How Turgenev scores content =

The Turgenev service describes its total risk as the sum of penalties from independent analysis criteria.

Its published documentation discusses, among other signals:

* word-frequency / repetition metrics;
* unusually frequent words;
* style-problem density;
* low-information wording;
* query coverage;
* readability based in part on sentence and word length.

The provider currently describes risk levels beginning around 5 points as medium, 8 as high and 13 as critical. These are the provider's interpretation thresholds and should be used as editorial guidance, not as a promise or prediction of search-engine action.

= Get an account, API key and balance =

This plugin requires an account with the external Turgenev service.

Useful provider pages:

* Turgenev website: https://turgenev.ashmanov.com/
* API key / account: https://turgenev.ashmanov.com/?a=apikey
* Top up balance: https://turgenev.ashmanov.com/?a=pay

The Turgenev website currently publishes separate pricing for its web interface, subscriptions and API usage. Pricing can change, so always treat the provider's current website as authoritative.

The plugin itself is GPL-licensed and does not include Turgenev service credit.

== Installation ==

= Automatic installation from WordPress =

1. Sign in to your WordPress administration area.
2. Open **Plugins → Add New**.
3. Search for **Turgenev**.
4. Install the plugin.
5. Click **Activate**.
6. Continue with the API/account setup below.

= Manual ZIP installation =

1. Download the production Turgenev plugin ZIP.
2. In WordPress open **Plugins → Add New → Upload Plugin**.
3. Select the ZIP.
4. Click **Install Now**.
5. Activate **Turgenev**.
6. Continue with the API/account setup below.

Do not upload a GitHub source archive containing development files. Use the production plugin ZIP.

= Create or prepare your Turgenev account =

1. Open https://turgenev.ashmanov.com/
2. Sign in or create a Turgenev account.
3. Confirm the account if the provider asks you to verify your email.
4. Open the API-key/account page: https://turgenev.ashmanov.com/?a=apikey
5. Generate or copy your API key.
6. If necessary, add funds through https://turgenev.ashmanov.com/?a=pay

The provider controls account registration, billing, subscriptions and API pricing.

= Connect WordPress to Turgenev =

1. In WordPress open **Settings → Turgenev**.
2. Paste your Turgenev API key into **API key**.
3. Click **Save API key**.
4. The plugin verifies the key using the provider balance operation.
5. If verification succeeds, WordPress shows the current balance.
6. If verification fails, the key is not saved. If an older working key already exists, it is preserved.

= Run your first analysis in Gutenberg =

1. Open a post, page or another post type that uses the Block Editor.
2. Click **Turgenev** in the editor toolbar.
3. Confirm that your current balance is available.
4. Leave **HTML analysis (send markup)** disabled for normal visible-text analysis, or enable it when you intentionally want markup-aware analysis.
5. Click **Analyze document**.
6. Review **Overall risk**.
7. Open the detailed sections to inspect frequency, style, keywords, formality and readability.
8. Use report highlighting where available to inspect problem areas directly in the editor.
9. Edit the content and analyze again when appropriate.

Saving the post before analysis is not required.

= Run an analysis in the Classic Editor =

1. Open a post type using the Classic Editor.
2. Find the **Turgenev** metabox.
3. Check your balance.
4. Choose the analysis mode if needed.
5. Click the analysis button.
6. Review the returned risk and details.

= Top up your Turgenev balance =

You can top up directly from the provider:

https://turgenev.ashmanov.com/?a=pay

The editor also exposes a **Top up Turgenev balance** control when appropriate.

After adding funds, use the balance refresh control in WordPress.

== Frequently Asked Questions ==

= What does this WordPress SEO plugin actually analyze? =

Turgenev evaluates content through the external Turgenev text-analysis service. The integration surfaces the provider's overall risk and sections related to repetition/frequency, style, keywords, formality and readability.

It is intended as an editorial and SEO content-quality tool, not as a search-ranking guarantee.

= Is this a Yandex plugin? =

No. This plugin integrates the independent Turgenev service with WordPress. Turgenev's published methodology discusses content signals and risk associated with Yandex's Baden-Baden text-quality / over-optimization algorithm.

= Can Turgenev guarantee that a page will rank higher? =

No. Search rankings depend on many factors. The provider itself describes its score as a risk estimate and recommends applying editorial judgment instead of mechanically removing every highlighted word.

= Does it detect keyword stuffing and SEO over-optimization? =

It exposes Turgenev analysis related to repetition, unusually frequent terms, keyword/query coverage and overall over-optimization risk. These signals can be useful when reviewing SEO copy, landing pages and commercial content.

= Does it check readability? =

Yes. Readability is one of the analysis sections returned by Turgenev.

= Does it work with Gutenberg? =

Yes. The Block Editor integration analyzes the whole current document and is independent of the selected block.

= Does it work with the Classic Editor? =

Yes. The plugin adds a Turgenev metabox on supported Classic Editor screens.

= Do I need to save the post before analyzing it? =

No. Gutenberg analysis reads the current editor state, including unsaved changes.

= Can I analyze HTML instead of plain visible text? =

Yes. Enable **HTML analysis (send markup)** in the Turgenev panel. By default, visible document text is used.

= What is the maximum text length? =

The current plugin runtime accepts up to **50,000 visible Unicode characters per analysis**.

= Where do I get the Turgenev API key? =

Use your Turgenev account:

https://turgenev.ashmanov.com/?a=apikey

= Where do I add money / top up the balance? =

Use the provider's payment page:

https://turgenev.ashmanov.com/?a=pay

The plugin also provides a top-up shortcut from the editor.

= Is the Turgenev service free? =

The WordPress plugin is GPL-licensed software. The external Turgenev service has its own billing model and current pricing. Check the provider website for authoritative pricing.

= Does saving my API key spend a content-analysis request? =

The plugin verifies a new key using the provider's balance operation rather than sending a dummy document to the risk-analysis endpoint.

= Is my API key exposed to JavaScript? =

No. Provider authentication is performed server-side by WordPress.

= What happens if I enter a bad replacement API key? =

The replacement is verified before storage. If it cannot be verified, the existing key remains unchanged.

= What happens if Turgenev is temporarily unavailable while I change the key? =

The new key is not committed and the previous working key is preserved.

= Can another WordPress user analyze a post they cannot edit? =

The plugin checks `current_user_can( 'edit_post', $post_id )` on the server for document operations. A generic ability to edit some posts is not enough.

= Does Highlight modify my saved WordPress content? =

No. Highlighting is presentation-only. It does not intentionally write highlight markup into `post_content`, block attributes, revisions or autosaves.

= Why is Highlight unavailable on my server? =

Report highlighting requires the PHP DOM extension. Normal balance checks and content analysis continue to work without it.

Ask your host to enable the standard PHP DOM/XML extension for your active PHP version if you want report highlighting.

= Why does the plugin have rate limits? =

The provider is an external service with account usage. Server-side limits help prevent accidental or scripted repeated requests from bypassing normal editor behavior.

= Why does the score change after I edit the text? =

Changing the text changes the analyzed input. The Turgenev provider also continues to improve its algorithms and dictionaries, so results may evolve over time.

= Should I remove every word Turgenev highlights? =

No. The provider explicitly warns against mechanical rewriting. A highlighted phrase is a signal to review context, not an instruction to delete it automatically.

= Does the plugin send my entire database or website to Turgenev? =

No. A document analysis sends the content being analyzed. A balance check sends the API key but not document content.

See the External Service section for details.

== Screenshots ==

1. **Settings → Turgenev** — secure API-key configuration, masked saved-key indicator, current account balance and balance refresh.
2. **Gutenberg Turgenev panel** — toolbar integration, current balance, plain-text/HTML analysis mode and **Analyze document** workflow.
3. **Analysis results** — overall risk with expandable frequency, style, keywords, formality and readability details plus report highlighting.
4. **Classic Editor integration** — Turgenev metabox with the same server-side API workflow.

== External Service ==

This plugin connects WordPress to the external **Turgenev** service at:

https://turgenev.ashmanov.com/

The provider is operated by **ООО "Интернет-лингвистика" / Internet-Linguistics LLC**.

Exactly what is sent:

* **Document analysis:** after an authenticated editor explicitly starts an analysis, the current document content is sent to Turgenev for processing. This can include unsaved editor changes.
* **API key:** the API key is added by the WordPress server to provider requests. It is not intentionally exposed to browser JavaScript.
* **Balance:** balance checks send the API key but do not send document content.
* **Report details/highlights:** after analysis, report-reference data returned by Turgenev can be used to request the provider report required for detailed sections/highlighting.

The plugin does not control how the external service stores or processes data after it is transmitted.

Provider links:

* Service: https://turgenev.ashmanov.com/
* API key / account: https://turgenev.ashmanov.com/?a=apikey
* Balance top-up: https://turgenev.ashmanov.com/?a=pay
* Service terms / company information: https://turgenev.ashmanov.com/?a=org

By configuring this integration, the site administrator is responsible for determining whether sending content to the external service is appropriate for the site's privacy policy and applicable data-protection requirements.

== Changelog ==

= 2.0.0 - 2026-09-17 =
* Major production-focused rewrite for WordPress 6.6+ and PHP 8.1+.
* Keep the Turgenev API key server-side instead of exposing it to editor JavaScript.
* Route balance and analysis requests through authenticated WordPress AJAX with nonce and object-level (`edit_post`) capability checks; a generic `edit_posts` capability is never accepted on its own for document operations.
* Add independent, server-side, filterable rate limiting for `risk`, `highlights` and `balance`, enforced both per post and per user across all posts combined, so switching between posts cannot be used to exceed the effective budget. Rejected requests never reach the Turgenev provider.
* Validate new API keys through the balance endpoint and preserve an existing key when validation fails or the field is left blank.
* Remove the legacy paid `risk` request that was used only to validate settings.
* Add defensive HTTP/JSON/provider-response validation, including strict Unicode-character length limits (50,000 visible characters) and rejection of malformed UTF-8 or embedded NUL bytes before any outbound request.
* Replace provider-controlled `innerHTML` rendering with safe DOM/text rendering; highlight previews are presentation-only and never modify saved post content.
* Degrade gracefully when the PHP DOM extension (`ext-dom`) is unavailable: analysis and balance are unaffected, and the Highlight action is hidden with a clear notice instead of failing.
* Improve Classic Editor handling when TinyMCE is unavailable or in text mode.
* Remove arbitrary low-balance workflow deletion from the editor UI.
* Fix `tbclass` API documentation typo/ambiguity.
* Add GitHub Actions, dependency updates, release packaging, PHP smoke tests, JavaScript tests and Playwright E2E scaffolding (Gutenberg panel, Classic Editor metabox, authorization, nonce validation, no-API-key-exposure and missing-DOM-extension coverage).
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
