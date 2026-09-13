<?php
/**
 * Authenticated AJAX bridge to the Turgenev API.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Ajax;

use Al5dy\Turgenev\Api\ApiClient;
use Al5dy\Turgenev\Api\ApiException;

defined( 'ABSPATH' ) || exit;

final class ApiController {
	private ApiClient $client;

	public function __construct( ApiClient $client ) {
		$this->client = $client;
	}

	public function register(): void {
		add_action( 'wp_ajax_turgenev_api', array( $this, 'handle' ) );
	}

	public function handle(): void {
		check_ajax_referer( 'turgenev_api', 'nonce' );

		if ( ! current_user_can( 'edit_posts' ) && ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'You are not allowed to use Turgenev.', 'turgenev' ) ), 403 );
		}

		$operation = isset( $_POST['operation'] ) ? sanitize_key( wp_unslash( $_POST['operation'] ) ) : '';

		try {
			if ( 'balance' === $operation ) {
				wp_send_json_success( array( 'balance' => $this->client->balance() ) );
			}

			if ( 'risk' === $operation ) {
				$text = isset( $_POST['text'] ) && is_string( $_POST['text'] ) ? wp_unslash( $_POST['text'] ) : '';
				wp_send_json_success( array( 'result' => $this->client->analyze( $text, true ) ) );
			}

			wp_send_json_error( array( 'message' => __( 'Unsupported Turgenev request.', 'turgenev' ) ), 400 );
		} catch ( ApiException $exception ) {
			wp_send_json_error( array( 'message' => wp_strip_all_tags( $exception->getMessage() ) ), 502 );
		} catch ( \Throwable $exception ) {
			if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
				error_log( 'Turgenev API error: ' . $exception->getMessage() ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			}

			wp_send_json_error( array( 'message' => __( 'Unexpected Turgenev integration error.', 'turgenev' ) ), 500 );
		}
	}
}
