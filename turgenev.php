<?php
/**
 * Plugin Name: Turgenev
 * Plugin URI: https://wordpress.org/plugins/turgenev/
 * Description: Analyze WordPress content with the official Turgenev API for SEO over-optimization, readability, style, keyword stuffing and Baden-Baden risk.
 * Version: 2.0.0
 * Requires at least: 6.6
 * Requires PHP: 8.1
 * Author: al5dy
 * Author URI: https://ziscod.com
 * License: GPLv2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: turgenev
 * Domain Path: /languages
 *
 * @package Turgenev
 */

defined( 'ABSPATH' ) || exit;

define( 'TURGENEV_VERSION', '2.0.0' );
define( 'TURGENEV_FILE', __FILE__ );
define( 'TURGENEV_DIR', plugin_dir_path( __FILE__ ) );
define( 'TURGENEV_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	static function ( string $class ): void {
		$prefix = 'Al5dy\\Turgenev\\';

		if ( 0 !== strpos( $class, $prefix ) ) {
			return;
		}

		$file = TURGENEV_DIR . 'src/' . str_replace( '\\', '/', substr( $class, strlen( $prefix ) ) ) . '.php';

		if ( is_readable( $file ) ) {
			require_once $file;
		}
	}
);

/**
 * Backward-compatible access to the main plugin instance.
 *
 * @return \Al5dy\Turgenev\Plugin
 */
function TGEV(): \Al5dy\Turgenev\Plugin { // phpcs:ignore WordPress.NamingConventions.ValidFunctionName.FunctionNameInvalid
	return \Al5dy\Turgenev\Plugin::instance();
}

add_action(
	'plugins_loaded',
	static function (): void {
		\Al5dy\Turgenev\Bootstrap::boot();
	},
	20
);
