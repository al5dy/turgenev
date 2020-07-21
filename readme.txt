=== Turgenev ===
Contributors: al5dy
Donate link: https://money.yandex.ru/to/410012328678499
Tags: Content analysis, Readability, seo, gutenberg, gutenberg editor
Requires at least: 5.0
Tested up to: 5.4
Requires PHP: 7.1
Stable tag: 1.3
License: GPLv3
License URI: https://www.gnu.org/licenses/gpl-3.0.html

== Description ==

Assesses the risk of falling under the "Baden-Baden" and shows what needs to be fixed. Enjoy :)

Baden-Baden is Yandex's algorithm for detecting unnatural, over-optimized texts. If there is not a lot of low-quality content on the site, specific pages go down in the ranking. If there is a lot, the whole site will be filtered. Turgenev evaluates the risk of Baden-Baden in points, shows the problems and helps to cope with them.

Plugin uses an [official "Turgenev" API](https://turgenev.ashmanov.com/?a=apikey).

You can find more information on the [official website](https://turgenev.ashmanov.com/?a=home).

Also, you can find the plugin sources in the [following repository](https://github.com/al5dy/turgenev).

= Main Features: =

- "Turgenev" API
- Displaying the current balance
- On-the-fly text analysis in Gutenberg or Classic Editor
- Detailed reports
- Well organized source code
- WP Hooks/Filters
- Russian and English language support


== Installation ==

Automatic installation

1. Log into your WordPress admin area
2. Go to Plugins -> Add New
3. Search for Turgenev -> Install Now (on the side Turgenev)
4. Activate the plugin
5. Go to Settings menu -> "Turgenev" -> [Insert API key](https://turgenev.ashmanov.com/?a=apikey) -> Save changes
6. Go to any page/post etc. -> In the right panel click on the "T" icon or open the "Turgenev" metabox -> click "Check content"


= Manual installation =

The manual installation method involves downloading my Turgenev plugin and uploading it to your webserver
via your favourite FTP application. The WordPress codex contains [instructions on how to do this here](https://codex.wordpress.org/Managing_Plugins#Manual_Plugin_Installation).


= Minimum Requirements =

* PHP version 7.1 or greater
* WP 5.0 or greater

== Screenshots ==

1. API settings.
2. Main Turgenev panel.

== Changelog ==

= 1.3 - 2020-07-22 =
Add balance checker in settings page
Add some translations
Minor fixes

= 1.2 - 2020-07-22 =
Encode URL for API requests

= 1.1 - 2020-07-21 =
Bugfix check content function

= 1.0 - 2020-07-19 =
First Release


== Upgrade Notice ==

= 1.0 =
First Release: Contains a ready to use plugin with all the bugfixes.
