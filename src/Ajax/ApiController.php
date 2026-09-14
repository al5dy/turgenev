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

/** Authenticates document access before any remote action. */
final class ApiController {
	/**
	 * Provider boundary.
	 *
	 * @var ApiClient
	 */
	private ApiClient $client;

	/**
	 * Bind the provider boundary.
	 *
	 * @param ApiClient $client Server-side client.
	 */
	public function __construct( ApiClient $client ) {
		$this->client = $client;
	}

	/** Register only the authenticated AJAX action. */
	public function register(): void {
		add_action( 'wp_ajax_turgenev_api', array( $this, 'handle' ) );
	}

	/** Validate authorization and return a secret-safe JSON response. */
	public function handle(): void {
		if ( false === check_ajax_referer( 'turgenev_api', 'nonce', false ) ) {
			wp_send_json_error( array( 'message' => __( 'Your editor session expired. Reload the editor and try again.', 'turgenev' ) ), 403 );
			return;
		}

		$post_id = isset( $_POST['post_id'] ) && is_scalar( $_POST['post_id'] ) ? absint( $_POST['post_id'] ) : 0;
		$allowed = $post_id ? current_user_can( 'edit_post', $post_id ) : ( current_user_can( 'edit_posts' ) || current_user_can( 'manage_options' ) );
		if ( ! $allowed ) {
			wp_send_json_error( array( 'message' => __( 'You are not allowed to use Turgenev.', 'turgenev' ) ), 403 );
			return;
		}

		$operation = isset( $_POST['operation'] ) && is_string( $_POST['operation'] ) ? sanitize_key( wp_unslash( $_POST['operation'] ) ) : '';

		if ( ! in_array( $operation, array( 'balance', 'risk', 'highlights' ), true ) ) {
			wp_send_json_error( array( 'message' => __( 'Unsupported Turgenev request.', 'turgenev' ) ), 400 );
			return;
		}
		$text  = isset( $_POST['text'] ) && is_string( $_POST['text'] ) ? wp_unslash( $_POST['text'] ) : '';
		$token = isset( $_POST['report_token'] ) && is_string( $_POST['report_token'] ) ? wp_unslash( $_POST['report_token'] ) : '';
		try {
			$data = match ( $operation ) {
				'balance' => array( 'balance' => $this->client->balance() ),
				'risk' => array( 'result' => $this->client->analyze( $text ) ),
				'highlights' => array( 'highlights' => $this->client->reportHighlights( $token, $text ) ),
			};
		} catch ( ApiException $exception ) {
			wp_send_json_error( array( 'message' => wp_strip_all_tags( $exception->getMessage() ) ), 502 );
			return;
		} catch ( \Throwable $exception ) {
			wp_send_json_error( array( 'message' => __( 'Unexpected Turgenev integration error.', 'turgenev' ) ), 500 );
			return;
		}
		wp_send_json_success( $data );
	}
}
