<?php
/**
 * Main plugin coordinator.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev;

use Al5dy\Turgenev\Admin\EditorIntegration;
use Al5dy\Turgenev\Admin\SettingsPage;
use Al5dy\Turgenev\Ajax\ApiController;
use Al5dy\Turgenev\Api\ApiClient;
use Al5dy\Turgenev\Support\OptionStore;
use Al5dy\Turgenev\Support\ContentProtection;

defined( 'ABSPATH' ) || exit;

/** Composes the small runtime without loading obsolete implementations. */
final class Plugin {
	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static ?self $instance = null;
	/**
	 * Whether hooks have been registered.
	 *
	 * @var bool
	 */
	private bool $booted = false;

	/** Return the shared plugin instance. */
	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/** Restrict construction to the singleton factory. */
	private function __construct() {}

	/** Disallow copying a hook registry. */
	private function __clone() {}

	/**
	 * Reject deserialization of a live plugin.
	 *
	 * @throws \LogicException Always.
	 */
	public function __wakeup(): void {
		throw new \LogicException( 'Turgenev cannot be unserialized.' );
	}

	/** Register the integration exactly once. */
	public function boot(): void {
		if ( $this->booted ) {
			return;
		}

		$this->booted = true;

		load_plugin_textdomain( 'turgenev', false, dirname( plugin_basename( TURGENEV_FILE ) ) . '/languages' );

		$options = new OptionStore();
		$client  = new ApiClient( $options );

		( new ApiController( $client ) )->register();
		( new ContentProtection() )->register();

		if ( is_admin() ) {
			( new SettingsPage( $options ) )->register();
			( new EditorIntegration( $options ) )->register();
		}
	}

	/** Return synchronized release metadata. */
	public function version(): string {
		return TURGENEV_VERSION;
	}
}
