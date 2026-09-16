<?php
/**
 * Authenticated AJAX bridge to the Turgenev API.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Ajax;

use Al5dy\Turgenev\Api\ApiClient;
use Al5dy\Turgenev\Api\ApiException;
use Al5dy\Turgenev\Support\RateLimiter;

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
	 * Server-side abuse control, independent of client JavaScript.
	 *
	 * @var RateLimiter
	 */
	private RateLimiter $rate_limiter;

	/**
	 * Bind the provider boundary.
	 *
	 * @param ApiClient   $client Server-side client.
	 * @param RateLimiter $rate_limiter Per-user/post/operation request limiter.
	 */
	public function __construct( ApiClient $client, RateLimiter $rate_limiter ) {
		$this->client       = $client;
		$this->rate_limiter = $rate_limiter;
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

		$operation = isset( $_POST['operation'] ) && is_string( $_POST['operation'] ) ? sanitize_key( wp_unslash( $_POST['operation'] ) ) : '';

		if ( ! in_array( $operation, array( 'balance', 'risk', 'highlights' ), true ) ) {
			wp_send_json_error( array( 'message' => __( 'Unsupported Turgenev request.', 'turgenev' ) ), 400 );
			return;
		}

		// A scalar positive post_id referencing an existing post, never a generic capability fallback.
		$post_id = 0;
		if ( isset( $_POST['post_id'] ) && is_scalar( $_POST['post_id'] ) && is_numeric( $_POST['post_id'] ) && (int) $_POST['post_id'] > 0 ) {
			$post_id = (int) $_POST['post_id'];
		}
		$post = $post_id ? get_post( $post_id ) : null;

		if ( in_array( $operation, array( 'risk', 'highlights' ), true ) ) {
			// Document operations always require a real, editable target post.
			if ( ! $post_id || ! $post ) {
				wp_send_json_error( array( 'message' => __( 'A valid post is required for this request.', 'turgenev' ) ), 400 );
				return;
			}
			if ( ! current_user_can( 'edit_post', $post_id ) ) {
				wp_send_json_error( array( 'message' => __( 'You are not allowed to analyze this post.', 'turgenev' ) ), 403 );
				return;
			}
			// A busy state in the editor is a UX affordance, not a security control; enforce
			// the request cap here so a script calling this endpoint directly is bounded too.
			if ( $this->rate_limiter->tooManyRequests( $operation, get_current_user_id(), $post_id ) ) {
				wp_send_json_error( array( 'message' => __( 'Too many Turgenev requests. Wait a moment and try again.', 'turgenev' ) ), 429 );
				return;
			}
		} else {
			// balance: editor screen needs edit_post on that post; the settings page (no post_id) needs manage_options.
			$allowed = ( $post_id && $post ) ? current_user_can( 'edit_post', $post_id ) : current_user_can( 'manage_options' );
			if ( ! $allowed ) {
				wp_send_json_error( array( 'message' => __( 'You are not allowed to use Turgenev.', 'turgenev' ) ), 403 );
				return;
			}
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
