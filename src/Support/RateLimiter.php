<?php
/**
 * Server-side rate limiting for outbound Turgenev requests.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Support;

defined( 'ABSPATH' ) || exit;

/**
 * Bounds repeated document operations per user, post and operation.
 *
 * This runs entirely server-side against a WordPress transient, so it holds even when a
 * script calls the AJAX endpoint directly and skips the editor's busy-state UI.
 */
final class RateLimiter {
	private const TRANSIENT_PREFIX = 'turgenev_rl_';

	/**
	 * Default requests allowed per rolling window, keyed by operation.
	 *
	 * @var array<string, array{limit: int, window: int}>
	 */
	private const DEFAULTS = array(
		// A manual pass clicks "Analyze" a handful of times per minute at most.
		'risk'       => array(
			'limit'  => 12,
			'window' => 60,
		),
		// Each analysis can surface one highlight link per report section.
		'highlights' => array(
			'limit'  => 20,
			'window' => 60,
		),
	);

	/**
	 * Record an attempt and report whether it exceeds the limit for this identity.
	 *
	 * Identity is the current user, the target post and the operation together, so one
	 * user's automated loop against one post cannot hide behind manual traffic elsewhere,
	 * and cannot be inflated by other users' or other posts' legitimate use.
	 *
	 * @param string $operation Rate-limited operation, e.g. 'risk' or 'highlights'.
	 * @param int    $user_id   Current user ID.
	 * @param int    $post_id   Target post ID.
	 * @return bool True when the request must be rejected before contacting the provider.
	 */
	public function tooManyRequests( string $operation, int $user_id, int $post_id ): bool {
		$defaults = self::DEFAULTS[ $operation ] ?? array(
			'limit'  => 0,
			'window' => 60,
		);

		/**
		 * Filters the rate limit applied to a Turgenev operation.
		 *
		 * Return a non-positive `limit` to disable limiting for that operation.
		 *
		 * @param array{limit: int, window: int} $limits    Requests allowed per window (seconds).
		 * @param string                          $operation Operation being limited ('risk', 'highlights').
		 */
		$limits = apply_filters( 'turgenev_rate_limit', $defaults, $operation );
		$limit  = max( 0, (int) ( is_array( $limits ) && isset( $limits['limit'] ) ? $limits['limit'] : $defaults['limit'] ) );
		$window = max( 1, (int) ( is_array( $limits ) && isset( $limits['window'] ) ? $limits['window'] : $defaults['window'] ) );

		if ( $limit <= 0 ) {
			return false;
		}

		$key   = self::TRANSIENT_PREFIX . md5( $operation . '|' . $user_id . '|' . $post_id );
		$now   = time();
		$state = get_transient( $key );
		if ( ! is_array( $state ) || ! isset( $state['count'], $state['reset'] ) || $state['reset'] <= $now ) {
			$state = array(
				'count' => 0,
				'reset' => $now + $window,
			);
		}

		$exceeded = $state['count'] >= $limit;
		if ( ! $exceeded ) {
			++$state['count'];
		}
		set_transient( $key, $state, max( 1, $state['reset'] - $now ) );

		return $exceeded;
	}
}
