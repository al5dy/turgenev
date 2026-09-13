<?php
/**
 * Runtime requirements.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Support;

defined( 'ABSPATH' ) || exit;

final class Requirements {
	public const MIN_PHP = '8.1';
	public const MIN_WP  = '6.6';

	public static function isSatisfied(): bool {
		global $wp_version;

		return version_compare( PHP_VERSION, self::MIN_PHP, '>=' )
			&& is_string( $wp_version )
			&& version_compare( $wp_version, self::MIN_WP, '>=' );
	}

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
