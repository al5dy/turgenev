<?php
/**
 * Loading the translations this plugin ships.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\I18n;

defined( 'ABSPATH' ) || exit;

/**
 * Points WordPress at the plugin's own languages/ directory for every locale it ships a
 * translation for.
 *
 * Just-in-time loading only looks for PHP translations in wp-content/languages/plugins/
 * (WordPress.org language packs), and load_plugin_textdomain() merely adds the plugin's
 * directory as a fallback behind it. So a bundled translation was never used for PHP
 * strings, and an older language pack for this slug (one written for the 1.x plugin is in
 * the wild) replaced it with a few obsolete strings, leaving the rest in English. Browser
 * scripts already prefer the bundled JSON files (wp_set_script_translations() is given
 * this directory, which WordPress checks first); this gives PHP the same order. A locale
 * the plugin does not ship still gets its language pack.
 */
final class BundledTranslations {
	public const DOMAIN = 'turgenev';

	/** Register the lookup override. */
	public function register(): void {
		add_filter( 'lang_dir_for_domain', array( $this, 'directory' ), 10, 3 );
	}

	/**
	 * The directory WordPress loads this plugin's translation for one locale from.
	 *
	 * @param string|false $path   Directory WordPress resolved, or false when it found none.
	 * @param string       $domain Text domain.
	 * @param string       $locale Locale.
	 * @return string|false
	 */
	public function directory( $path, $domain, $locale ) {
		if ( self::DOMAIN !== $domain || ! is_string( $locale ) || ! preg_match( '/^[A-Za-z0-9_-]+$/D', $locale ) ) {
			return $path;
		}

		$directory = TURGENEV_DIR . 'languages/';

		return is_readable( $directory . self::DOMAIN . '-' . $locale . '.mo' ) ? $directory : $path;
	}
}
