<?php
/**
 * Server-side client for the Turgenev API.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Api;

use Al5dy\Turgenev\Support\OptionStore;

defined( 'ABSPATH' ) || exit;

final class ApiClient {
	public const ENDPOINT        = 'https://turgenev.ashmanov.com/';
	public const REPORT_BASE_URL = 'https://turgenev.ashmanov.com/?t=';
	public const MAX_TEXT_LENGTH = 20000;
	public const MAX_REPORT_LENGTH = 1048576;

	private OptionStore $options;
	private ?string $apiKeyOverride;

	public function __construct( OptionStore $options, ?string $apiKeyOverride = null ) {
		$this->options        = $options;
		$this->apiKeyOverride = null === $apiKeyOverride ? null : trim( $apiKeyOverride );
	}

	public function balance(): string {
		$response = $this->request( 'balance' );
		$balance  = $response['balance'] ?? null;

		if ( ! is_scalar( $balance ) || ! is_numeric( (string) $balance ) ) {
			throw new ApiException( __( 'Turgenev returned an invalid balance response.', 'turgenev' ) );
		}

		return (string) $balance;
	}

	/**
	 * @return array<string, mixed>
	 */
	public function analyze( string $text, bool $more = true ): array {
		$text = trim( str_replace( "\0", '', $text ) );

		if ( '' === $text ) {
			throw new ApiException( __( 'There is no content to analyze.', 'turgenev' ) );
		}

		$length = function_exists( 'mb_strlen' ) ? mb_strlen( $text ) : strlen( $text );
		if ( $length > self::MAX_TEXT_LENGTH ) {
			throw new ApiException(
				sprintf(
					/* translators: %d: maximum character count. */
					__( 'Turgenev accepts up to %d characters per check.', 'turgenev' ),
					self::MAX_TEXT_LENGTH
				)
			);
		}

		return $this->request(
			'risk',
			array(
				'text' => $text,
				'more' => $more ? '1' : '0',
			)
		);
	}

	/**
	 * Fetch report markup through the fixed provider URL and return presentation-safe ranges.
	 *
	 * @return array{text: string, marks: list<array{start: int, end: int, category: string, level: int}>}
	 */
	public function reportHighlights( string $report_token, string $expected_text ): array {
		$report_token = trim( $report_token );
		if ( ! preg_match( '/^[A-Za-z0-9_-]{8,128}$/', $report_token ) ) {
			throw new ApiException( __( 'Turgenev report reference is invalid.', 'turgenev' ) );
		}

		/*
		 * The provider's read-only report form submits its reference with POST.
		 * A GET request may return a report shell without the annotated textarea.
		 */
		$response = wp_remote_post(
			self::ENDPOINT,
			array(
				'timeout'     => 20,
				'redirection' => 0,
				'httpversion' => '1.1',
				'sslverify'   => true,
				'headers'     => array(
					'Accept'     => 'text/html',
					'User-Agent' => 'Turgenev-WordPress/' . TURGENEV_VERSION . '; ' . home_url( '/' ),
				),
				'body'        => array(
					't'         => $report_token,
					'keep_isum' => '',
					'scroll_x'  => '',
					'scroll_y'  => '',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new ApiException(
				sprintf(
					/* translators: %s: WordPress HTTP API error. */
					__( 'Could not retrieve the Turgenev report: %s', 'turgenev' ),
					$response->get_error_message()
				)
			);
		}

		$status = wp_remote_retrieve_response_code( $response );
		if ( $status < 200 || $status >= 300 ) {
			throw new ApiException(
				sprintf(
					/* translators: %d: HTTP status code. */
					__( 'Turgenev report returned HTTP %d.', 'turgenev' ),
					$status
				)
			);
		}

		$markup = wp_remote_retrieve_body( $response );
		if ( '' === trim( $markup ) || strlen( $markup ) > self::MAX_REPORT_LENGTH ) {
			throw new ApiException( __( 'Turgenev report markup is unavailable.', 'turgenev' ) );
		}

		return ( new ReportHighlightParser() )->parse( $markup, $expected_text );
	}

	/**
	 * @param string               $operation API operation.
	 * @param array<string, mixed> $parameters Additional request parameters.
	 * @return array<string, mixed>
	 */
	public function request( string $operation, array $parameters = array() ): array {
		$allowed = array( 'risk', 'frequency', 'style', 'keywords', 'formality', 'readability', 'balance' );
		if ( ! in_array( $operation, $allowed, true ) ) {
			throw new ApiException( __( 'Unsupported Turgenev API operation.', 'turgenev' ) );
		}

		$key = $this->apiKey();
		if ( '' === $key ) {
			throw new ApiException( __( 'Configure a Turgenev API key first.', 'turgenev' ) );
		}

		$body = array_merge(
			array(
				'api' => $operation,
				'key' => $key,
			),
			$parameters
		);

		$response = wp_remote_post(
			self::ENDPOINT,
			array(
				'timeout'     => 20,
				'redirection' => 2,
				'httpversion' => '1.1',
				'sslverify'   => true,
				'headers'     => array(
					'Accept'     => 'application/json',
					'User-Agent' => 'Turgenev-WordPress/' . TURGENEV_VERSION . '; ' . home_url( '/' ),
				),
				'body'        => $body,
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new ApiException(
				sprintf(
					/* translators: %s: WordPress HTTP API error. */
					__( 'Could not reach the Turgenev API: %s', 'turgenev' ),
					$response->get_error_message()
				)
			);
		}

		$status = wp_remote_retrieve_response_code( $response );
		if ( $status < 200 || $status >= 300 ) {
			throw new ApiException(
				sprintf(
					/* translators: %d: HTTP status code. */
					__( 'Turgenev API returned HTTP %d.', 'turgenev' ),
					$status
				)
			);
		}

		$raw = wp_remote_retrieve_body( $response );
		if ( '' === trim( $raw ) ) {
			throw new ApiException( __( 'Turgenev API returned an empty response.', 'turgenev' ) );
		}

		try {
			$decoded = json_decode( $raw, true, 512, JSON_THROW_ON_ERROR );
		} catch ( \JsonException $exception ) {
			throw new ApiException( __( 'Turgenev API returned malformed JSON.', 'turgenev' ), 0, $exception );
		}

		if ( ! is_array( $decoded ) ) {
			throw new ApiException( __( 'Turgenev API returned an unexpected response.', 'turgenev' ) );
		}

		if ( isset( $decoded['error'] ) && is_scalar( $decoded['error'] ) ) {
			throw new ApiException( sanitize_text_field( (string) $decoded['error'] ) );
		}

		return $decoded;
	}

	private function apiKey(): string {
		return null === $this->apiKeyOverride ? $this->options->apiKey() : $this->apiKeyOverride;
	}
}
