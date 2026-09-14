<?php
/**
 * Plugin bootstrap.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev;

use Al5dy\Turgenev\Support\Requirements;

defined( 'ABSPATH' ) || exit;

/** Requirements-aware bootstrap for the thin root plugin file. */
final class Bootstrap {
	/** Start only on a supported runtime. */
	public static function boot(): void {
		if ( ! Requirements::isSatisfied() ) {
			Requirements::registerAdminNotice();
			return;
		}

		$plugin = Plugin::instance();
		$plugin->boot();

		$GLOBALS['turgenev'] = $plugin;

		do_action( 'turgenev_loaded', $plugin );
	}
}
