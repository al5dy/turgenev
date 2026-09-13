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

defined( 'ABSPATH' ) || exit;

final class Plugin {
	private static ?self $instance = null;
	private bool $booted = false;

	public static function instance(): self {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	private function __construct() {}

	private function __clone() {}

	public function __wakeup(): void {
		throw new \LogicException( 'Turgenev cannot be unserialized.' );
	}

	public function boot(): void {
		if ( $this->booted ) {
			return;
		}

		$this->booted = true;

		load_plugin_textdomain( 'turgenev', false, dirname( plugin_basename( TURGENEV_FILE ) ) . '/languages' );

		$options = new OptionStore();
		$client  = new ApiClient( $options );

		( new ApiController( $client ) )->register();

		if ( is_admin() ) {
			( new SettingsPage( $options ) )->register();
			( new EditorIntegration( $options ) )->register();
		}
	}

	public function version(): string {
		return TURGENEV_VERSION;
	}
}
