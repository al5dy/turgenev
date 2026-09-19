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
 * This runs entirely server-side, so it holds even when a script calls the AJAX endpoint
 * directly and skips the editor's busy-state UI, and it always runs before any outbound
 * request to the provider.
 *
 * Two independent buckets are enforced for every request:
 *
 * - a "post" bucket, keyed by user + post (or, for `balance` with no post context, user +
 *   0), a tight burst limit matching how fast a human clicks "Analyze" on one document;
 * - a "global" bucket, keyed by user + operation only, a looser ceiling on total requests
 *   across *every* post. Without this, a user could reset their budget at will simply by
 *   switching from post 42 to post 43, since a fresh post ID always starts a fresh "post"
 *   bucket. The global bucket cannot be bypassed by post rotation.
 *
 * A request is rejected the moment either bucket is exceeded.
 *
 * Both buckets are counted with a fixed-window counter keyed to the current window
 * ("bucket id" = floor(time / window)), so the counter itself never needs a separately
 * stored reset timestamp: an old window's key simply expires (or is never reused) and a
 * new window starts at zero. This also means there is nothing to clean up as time passes;
 * nothing here is a permanently growing option or transient.
 *
 * Counting is atomic:
 *
 * - when a persistent external object cache is active, `wp_cache_add()` +
 *   `wp_cache_incr()` are atomic at the cache backend and are used directly;
 * - otherwise (the common case: no Redis/Memcached, only the DB-backed default), a short
 *   `add_option()`-based mutex guards a `get_transient()`/`set_transient()`
 *   read-increment-write, because `add_option()` fails atomically (a unique index on
 *   `option_name`) when another request already holds the same lock. The lock is deleted
 *   as soon as the critical section finishes, and a lock left behind by a crashed request
 *   is force-reclaimed once it is older than {@see LOCK_STALE_AFTER} seconds, so a lock can
 *   never wedge a bucket shut permanently.
 * - if the lock cannot be acquired even after reclaiming a stale one (pathological
 *   contention), the request is treated as rate-limited (fails closed). For a billed,
 *   third-party API, silently letting an uncounted request through is worse than an
 *   occasional extra 429 under contention that essentially never happens for one user
 *   acting on one post/operation.
 */
final class RateLimiter {
	private const BUCKET_PREFIX       = 'turgenev_rl_';
	private const CACHE_GROUP         = 'turgenev_rate_limit';
	private const LOCK_PREFIX         = '_turgenev_rl_lock_';
	private const LOCK_STALE_AFTER    = 5;
	private const LOCK_MAX_ATTEMPTS   = 8;
	private const LOCK_RETRY_DELAY_US = 2000;

	/**
	 * Default requests allowed per rolling window, keyed by operation.
	 *
	 * `post` bounds one user acting on one post (or, for `balance` outside the editor, one
	 * user with no post context). `global` bounds one user across every post combined, so
	 * rotating between posts cannot multiply the effective budget.
	 *
	 * @var array<string, array{post: array{limit: int, window: int}, global: array{limit: int, window: int}}>
	 */
	private const DEFAULTS = array(
		// A manual pass clicks "Analyze" a handful of times per minute at most.
		'risk'       => array(
			'post'   => array(
				'limit'  => 12,
				'window' => 60,
			),
			'global' => array(
				'limit'  => 30,
				'window' => 60,
			),
		),
		// Each analysis can surface one highlight link per report section.
		'highlights' => array(
			'post'   => array(
				'limit'  => 20,
				'window' => 60,
			),
			'global' => array(
				'limit'  => 40,
				'window' => 60,
			),
		),
		// One request per accordion section opened; a full pass over all 6 sections is a
		// handful of clicks, matching the 'highlights' budget it is paired with.
		'details'    => array(
			'post'   => array(
				'limit'  => 20,
				'window' => 60,
			),
			'global' => array(
				'limit'  => 40,
				'window' => 60,
			),
		),
		// Free to call, but still a real outbound provider request; an editor should never
		// be able to hammer it in a tight loop from the settings screen or the editor.
		'balance'    => array(
			'post'   => array(
				'limit'  => 20,
				'window' => 60,
			),
			'global' => array(
				'limit'  => 40,
				'window' => 60,
			),
		),
	);

	/**
	 * Record an attempt and report whether it exceeds either bucket for this identity.
	 *
	 * @param string $operation Rate-limited operation: 'risk', 'highlights', 'details' or 'balance'.
	 * @param int    $user_id   Current user ID.
	 * @param int    $post_id   Target post ID, or 0 when the operation has no post context.
	 * @return bool True when the request must be rejected before contacting the provider.
	 */
	public function tooManyRequests( string $operation, int $user_id, int $post_id ): bool {
		$defaults = self::DEFAULTS[ $operation ] ?? array(
			'post'   => array(
				'limit'  => 0,
				'window' => 60,
			),
			'global' => array(
				'limit'  => 0,
				'window' => 60,
			),
		);

		/**
		 * Filters the per-post/per-user burst limit applied to a Turgenev operation.
		 *
		 * Return a non-positive `limit` to disable this bucket for that operation. This
		 * filter's shape is unchanged from the single-bucket rate limiter: existing code
		 * hooking it continues to control the tight, per-post burst budget.
		 *
		 * @param array{limit: int, window: int} $limits    Requests allowed per window (seconds).
		 * @param string                          $operation Operation being limited ('risk', 'highlights', 'details', 'balance').
		 */
		$post_limits = apply_filters( 'turgenev_rate_limit', $defaults['post'], $operation );

		/**
		 * Filters the global (all posts combined) limit applied to a Turgenev operation.
		 *
		 * Return a non-positive `limit` to disable this bucket for that operation.
		 *
		 * @param array{limit: int, window: int} $limits    Requests allowed per window (seconds).
		 * @param string                          $operation Operation being limited ('risk', 'highlights', 'details', 'balance').
		 */
		$global_limits = apply_filters( 'turgenev_rate_limit_global', $defaults['global'], $operation );

		$post_exceeded   = $this->consume( self::BUCKET_PREFIX . 'p_' . md5( $operation . '|' . $user_id . '|' . $post_id ), $post_limits, $defaults['post'] );
		$global_exceeded = $this->consume( self::BUCKET_PREFIX . 'u_' . md5( $operation . '|' . $user_id ), $global_limits, $defaults['global'] );

		return $post_exceeded || $global_exceeded;
	}

	/**
	 * Atomically increment one bucket and report whether the increment crossed its limit.
	 *
	 * @param string                               $key      Bucket base key (without the window suffix).
	 * @param array{limit: int, window: int}|mixed $limits   Filtered limit configuration.
	 * @param array{limit: int, window: int}       $defaults Fallback when the filter returns something unusable.
	 */
	private function consume( string $key, $limits, array $defaults ): bool {
		$limit  = max( 0, (int) ( is_array( $limits ) && isset( $limits['limit'] ) ? $limits['limit'] : $defaults['limit'] ) );
		$window = max( 1, (int) ( is_array( $limits ) && isset( $limits['window'] ) ? $limits['window'] : $defaults['window'] ) );

		if ( $limit <= 0 ) {
			return false;
		}

		$bucket_id  = (int) floor( time() / $window );
		$window_key = $key . '_' . $bucket_id;
		$expiration = $window * 2; // Generous margin so a slow request never reads a bucket that already expired mid-window.

		$count = $this->atomicIncrement( $window_key, $expiration );

		return $count > $limit;
	}

	/**
	 * Atomically increment a window's counter and return the resulting count.
	 *
	 * Returns a value greater than any real limit when the counter could not be
	 * incremented safely, so the caller fails closed instead of silently skipping the
	 * limiter.
	 *
	 * @param string $window_key Bucket key including its window's bucket id.
	 * @param int    $expiration Seconds after which the counter may be discarded.
	 */
	private function atomicIncrement( string $window_key, int $expiration ): int {
		if ( wp_using_ext_object_cache() ) {
			return $this->atomicIncrementViaObjectCache( $window_key, $expiration );
		}

		return $this->atomicIncrementViaOptionLock( $window_key, $expiration );
	}

	/**
	 * Atomic increment backed by a persistent external object cache.
	 *
	 * @param string $window_key Bucket key including its window's bucket id.
	 * @param int    $expiration Seconds after which the counter may be discarded.
	 */
	private function atomicIncrementViaObjectCache( string $window_key, int $expiration ): int {
		wp_cache_add( $window_key, 0, self::CACHE_GROUP, $expiration );
		$count = wp_cache_incr( $window_key, 1, self::CACHE_GROUP );

		if ( false === $count ) {
			// The key vanished between add() and incr() (eviction/race); one retry is enough
			// because add() is itself atomic and re-seeds the counter.
			wp_cache_add( $window_key, 0, self::CACHE_GROUP, $expiration );
			$count = wp_cache_incr( $window_key, 1, self::CACHE_GROUP );
		}

		return false === $count ? PHP_INT_MAX : (int) $count;
	}

	/**
	 * Atomic increment for sites with no persistent object cache.
	 *
	 * Guards a transient read-increment-write with an `add_option()` mutex: `add_option()`
	 * fails when the row already exists (a unique index at the database layer), which is
	 * enough to serialize the handful of concurrent requests one user can realistically
	 * generate against one bucket.
	 *
	 * @param string $window_key Bucket key including its window's bucket id.
	 * @param int    $expiration Seconds after which the counter transient expires.
	 */
	private function atomicIncrementViaOptionLock( string $window_key, int $expiration ): int {
		$lock = self::LOCK_PREFIX . md5( $window_key );

		if ( ! $this->acquireLock( $lock ) ) {
			// Fail closed: never let an uncounted request through a billed API boundary.
			return PHP_INT_MAX;
		}

		try {
			$count = (int) get_transient( $window_key );
			++$count;
			set_transient( $window_key, $count, $expiration );

			return $count;
		} finally {
			delete_option( $lock );
		}
	}

	/**
	 * Try to take the mutex, reclaiming a stale lock left by a crashed request.
	 *
	 * @param string $lock Lock option name.
	 */
	private function acquireLock( string $lock ): bool {
		for ( $attempt = 0; $attempt < self::LOCK_MAX_ATTEMPTS; $attempt++ ) {
			if ( add_option( $lock, time(), '', 'no' ) ) {
				return true;
			}

			$held_since = (int) get_option( $lock, 0 );
			if ( $held_since > 0 && ( time() - $held_since ) > self::LOCK_STALE_AFTER ) {
				delete_option( $lock );
				continue; // Try to take it immediately on the next loop iteration.
			}

			usleep( self::LOCK_RETRY_DELAY_US );
		}

		return false;
	}
}
