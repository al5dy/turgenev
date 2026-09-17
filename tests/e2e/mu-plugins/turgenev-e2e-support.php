<?php
/**
 * Test-only support for `npm run test:e2e`: mocks the Turgenev provider and adds a
 * capability toggle Playwright can flip through wp-cli.
 *
 * Copy this file into a disposable test site's `wp-content/mu-plugins/` before running
 * Playwright.
 *
 * - `pre_http_request`: short-circuits every WordPress HTTP request aimed at the real
 *   Turgenev endpoint with a deterministic, canned response, so E2E runs never spend real
 *   provider credit and never depend on network/provider availability. It intercepts by
 *   URL prefix only (`ApiClient::ENDPOINT`), so it never affects any other HTTP request.
 * - `turgenev_has_dom`: lets a test force the "missing ext-dom" code path (see below).
 * - `turgenev_e2e_force_outage` / `turgenev_e2e_force_balance_error` options: let a settings
 *   test simulate a transport failure or a rejected candidate key without a real invalid
 *   key or network outage.
 * - `turgenev_e2e_mock_request_count` option: counts every outbound request this mock
 *   intercepts, so a test can prove a rejected AJAX request never reached the provider.
 * - `turgenev_e2e_classic`: a post type with `show_in_rest => false`, so WordPress always
 *   opens it in the Classic Editor. Lets the Classic Editor metabox be exercised without
 *   installing the separate Classic Editor plugin or a global settings flip.
 *
 * Never install this on a production site or point it at a real account: it makes every
 * "risk"/"balance" check succeed and every "highlights" report resolve, regardless of the
 * configured API key.
 *
 * @package Turgenev
 */

defined( 'ABSPATH' ) || exit;

// Lets a Playwright test simulate a host without ext-dom (`wp option update
// turgenev_e2e_force_no_dom 1`) without touching the real environment's DOMDocument.
// Only server-side PHP (this filter) can set this; it is never reachable from a browser.
add_filter(
	'turgenev_has_dom',
	static function ( $has_dom ) {
		return get_option( 'turgenev_e2e_force_no_dom' ) ? false : $has_dom;
	}
);

add_action(
	'init',
	static function (): void {
		register_post_type(
			'turgenev_e2e_classic',
			array(
				'label'        => 'Turgenev E2E (Classic)',
				'public'       => false,
				'show_ui'      => true,
				'show_in_rest' => false, // No REST support: WordPress always uses the Classic Editor.
				'supports'     => array( 'title', 'editor' ),
			)
		);
	}
);

add_filter(
	'pre_http_request',
	static function ( $preempt, array $args, string $url ) {
		if ( 0 !== strpos( $url, 'https://turgenev.ashmanov.com/' ) ) {
			return $preempt;
		}

		// Lets a test prove a rejected AJAX request never reached the provider transport at
		// all (not just that the mock returned an error): `wp option get
		// turgenev_e2e_mock_request_count` after `wp option delete` counts real outbound
		// attempts intercepted here.
		update_option( 'turgenev_e2e_mock_request_count', 1 + (int) get_option( 'turgenev_e2e_mock_request_count', 0 ) );

		// Lets a settings-page test simulate a total provider/network outage (`wp option
		// update turgenev_e2e_force_outage 1`) to prove key rotation preserves the old key
		// on a transport failure, not only on a well-formed provider error.
		if ( get_option( 'turgenev_e2e_force_outage' ) ) {
			return new WP_Error( 'turgenev_e2e_forced_outage', 'Simulated provider outage for E2E.' );
		}

		$body = is_array( $args['body'] ?? null ) ? $args['body'] : array();

		// Lets a settings-page test simulate the provider rejecting a candidate key (`wp
		// option update turgenev_e2e_force_balance_error 1`) to prove key rotation preserves
		// the old key when validation fails, without needing a real invalid key.
		if ( 'balance' === ( $body['api'] ?? '' ) && get_option( 'turgenev_e2e_force_balance_error' ) ) {
			return array(
				'headers'  => array(),
				'body'     => wp_json_encode( array( 'error' => 'Simulated invalid key for E2E.' ) ),
				'response' => array(
					'code'    => 200,
					'message' => 'OK',
				),
				'cookies'  => array(),
				'filename' => null,
			);
		}

		static $mock_response;
		$mock_response = static function ( string $body ): array {
			return array(
				'headers'  => array(),
				'body'     => $body,
				'response' => array(
					'code'    => 200,
					'message' => 'OK',
				),
				'cookies'  => array(),
				'filename' => null,
			);
		};

		// ApiClient::reportHighlights() posts the provider's report-form token, never an
		// `api` operation. Echo back whatever text the last `risk` request analyzed, since
		// ReportHighlightParser requires the report markup's text to match it exactly. The
		// first word is wrapped in a real `xhl` highlight span (not left as plain text), so
		// tests exercise an actual highlight mark end to end, not just an empty-marks response.
		if ( isset( $body['t'] ) && ! isset( $body['api'] ) ) {
			$text  = get_option( 'turgenev_e2e_mock_last_text', 'Mock analyzed text.' );
			$inner = '';
			if ( preg_match( '/^(\S+)(.*)$/su', $text, $matches ) ) {
				$inner = '<span class="xhl slop2 xhint xhint-1-1">' . esc_html( $matches[1] ) . '</span>' . esc_html( $matches[2] );
			} else {
				$inner = esc_html( $text );
			}

			return $mock_response(
				'<html><body><textarea id="textfield"><p>' . $inner . '</p></textarea></body></html>'
			);
		}

		if ( isset( $body['text'] ) && is_string( $body['text'] ) ) {
			update_option( 'turgenev_e2e_mock_last_text', wp_strip_all_tags( $body['text'] ) );
		}

		$sections = array( 'frequency', 'style', 'keywords', 'formality', 'readability' );
		$payload  = match ( $body['api'] ?? '' ) {
			'balance' => array( 'balance' => '42.50' ),
			'risk'    => array(
				'risk'    => '3',
				'level'   => 'low',
				'link'    => 'e2emockreport',
				'details' => array_map(
					static fn( string $block ): array => array(
						'block'  => $block,
						'sum'    => '1',
						'link'   => 'e2emock' . $block,
						'params' => array(
							array(
								'name'  => 'Mock parameter',
								'value' => 'None',
								'score' => '0',
							),
						),
					),
					$sections
				),
			),
			default   => array( 'error' => 'Unsupported mock operation.' ),
		};

		return $mock_response( wp_json_encode( $payload ) );
	},
	10,
	3
);
