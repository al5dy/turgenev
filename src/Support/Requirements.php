<?php
/**
 * Runtime requirements.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Support;

defined( 'ABSPATH' ) || exit;

/** Centralizes the supported WordPress and PHP baseline. */
final class Requirements {
	public const MIN_PHP = '8.1';
	public const MIN_WP  = '6.6';

	/** Check the running environment before registering integrations. */
	public static function isSatisfied(): bool {
		global $wp_version;

		return version_compare( PHP_VERSION, self::MIN_PHP, '>=' )
			&& is_string( $wp_version )
			&& version_compare( $wp_version, self::MIN_WP, '>=' );
	}

	/**
	 * Report the one optional capability the plugin degrades without: highlight rendering.
	 *
	 * Ext-dom is not in composer.json's `require`; core analysis and balance never need it.
	 * Only `ReportHighlightParser` depends on `DOMDocument`, and it degrades to a clear,
	 * non-fatal error when this is false instead of a fatal error.
	 *
	 * The filter exists so a real WordPress E2E run can exercise the missing-capability
	 * path (hidden Highlight button, non-fatal notice) on a host that actually has
	 * ext-dom, via a test-only mu-plugin; only server-side PHP can hook a filter, so this
	 * cannot be triggered by browser input.
	 */
	public static function hasDom(): bool {
		return (bool) apply_filters( 'turgenev_has_dom', class_exists( '\DOMDocument' ) );
	}

	/** Explain an unsupported environment to administrators. */
	public static function registerAdminNotice(): void {
		add_action(
			'admin_notices',
			static function (): void {
				if ( ! current_user_can( 'activate_plugins' ) ) {
					return;
				}

				$message = sprintf(
					/* translators: 1: minimum WordPress version, 2: minimum PHP version. */
					esc_html__( 'Turgenev requires WordPress %1$s or newer and PHP %2$s or newer.', 'turgenev' ),
					esc_html( self::MIN_WP ),
					esc_html( self::MIN_PHP )
				);

				printf( '<div class="notice notice-error"><p>%s</p></div>', $message ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
			}
		);
	}
}
