<?php
/**
 * Server-side client for the Turgenev API.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Api;

use Al5dy\Turgenev\Support\OptionStore;

defined( 'ABSPATH' ) || exit;

/** Owns provider transport, size limits and operation validation. */
final class ApiClient {
	public const ENDPOINT          = 'https://turgenev.ashmanov.com/';
	public const REPORT_BASE_URL   = 'https://turgenev.ashmanov.com/?t=';
	public const MAX_TEXT_LENGTH   = 20000;
	public const MAX_REPORT_LENGTH = 1048576;

	/**
	 * Server-side configuration.
	 *
	 * @var OptionStore
	 */
	private OptionStore $options;
	/**
	 * Candidate used only during key rotation.
	 *
	 * @var string|null
	 */
	private ?string $api_key_override;

	/**
	 * Bind the saved configuration or a candidate key.
	 *
	 * @param OptionStore $options Stored configuration.
	 * @param string|null $api_key_override Candidate key.
	 */
	public function __construct( OptionStore $options, ?string $api_key_override = null ) {
		$this->options          = $options;
		$this->api_key_override = null === $api_key_override ? null : trim( $api_key_override );
	}

	/**
	 * Retrieve a validated decimal balance.
	 *
	 * @return string
	 * @throws ApiException On transport or validation failure.
	 */
	public function balance(): string {
		$response = $this->request( 'balance' );
		$balance  = $response['balance'] ?? null;

		try {
			return ResponseValidator::decimal( $balance );
		} catch ( ApiException $exception ) {
			throw new ApiException( __( 'Turgenev returned an invalid balance response.', 'turgenev' ) );
		}
	}

	/**
	 * Analyze text without truncation.
	 *
	 * @param string $text Document text or explicit HTML payload.
	 * @param bool   $more Request extended criteria.
	 * @return array<string, mixed>
	 * @throws ApiException On invalid content or response.
	 */
	public function analyze( string $text, bool $more = true ): array {
		$text = $this->validateTextPayload( $text );

		return ResponseValidator::analysis(
			$this->request(
				'risk',
				array(
					'text' => $text,
					'more' => $more ? '1' : '0',
				)
			)
		);
	}

	/**
	 * Fetch report markup through the fixed provider URL and return presentation-safe ranges.
	 *
	 * @param string $report_token Opaque report identifier.
	 * @param string $expected_text Current document text.
	 * @throws ApiException On invalid or mismatched report data.
	 *
	 * @return array{text: string, marks: list<array{start: int, end: int, category: string, level: int}>}
	 */
	public function reportHighlights( string $report_token, string $expected_text ): array {
		$report_token  = ResponseValidator::token( $report_token );
		$expected_text = $this->validateTextPayload( $expected_text );

		/*
		 * The provider's read-only report form submits its reference with POST.
		 * A GET request may return a report shell without the annotated textarea.
		 */
		$response = wp_remote_post(
			self::ENDPOINT,
			array(
				'timeout'             => 20,
				'redirection'         => 0,
				'limit_response_size' => self::MAX_REPORT_LENGTH + 1,
				'httpversion'         => '1.1',
				'sslverify'           => true,
				'headers'             => array(
					'Accept'     => 'text/html',
					'User-Agent' => 'Turgenev-WordPress/' . TURGENEV_VERSION,
				),
				'body'                => array(
					't'         => $report_token,
					'keep_isum' => '',
					'scroll_x'  => '',
					'scroll_y'  => '',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new ApiException( __( 'Could not retrieve the Turgenev report. Try again later.', 'turgenev' ) );
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
	 * Execute a bounded authenticated provider request.
	 *
	 * @throws ApiException On transport, JSON or provider errors.
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
			$parameters,
			array(
				'api' => $operation,
				'key' => $key,
			)
		);

		$response = wp_remote_post(
			self::ENDPOINT,
			array(
				'timeout'             => 20,
				'redirection'         => 0,
				'limit_response_size' => self::MAX_REPORT_LENGTH + 1,
				'httpversion'         => '1.1',
				'sslverify'           => true,
				'headers'             => array(
					'Accept'     => 'application/json',
					'User-Agent' => 'Turgenev-WordPress/' . TURGENEV_VERSION,
				),
				'body'                => $body,
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new ApiException( __( 'Could not reach the Turgenev API. Try again later.', 'turgenev' ) );
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
		if ( strlen( $raw ) > self::MAX_REPORT_LENGTH ) {
			throw new ApiException( __( 'Turgenev API returned an oversized response.', 'turgenev' ) );
		}
		if ( '' === trim( $raw ) ) {
			throw new ApiException( __( 'Turgenev API returned an empty response.', 'turgenev' ) );
		}

		try {
			$decoded = json_decode( $raw, true, 512, JSON_THROW_ON_ERROR );
		} catch ( \JsonException $exception ) {
			throw new ApiException( __( 'Turgenev API returned malformed JSON.', 'turgenev' ), 0, $exception );
		}

		if ( ! is_array( $decoded ) || array_is_list( $decoded ) ) {
			throw new ApiException( __( 'Turgenev API returned an unexpected response.', 'turgenev' ) );
		}

		if ( array_key_exists( 'error', $decoded ) ) {
			// Provider/transport messages can reflect secrets. Only plugin-owned messages cross this boundary.
			$error = is_string( $decoded['error'] ) ? $decoded['error'] : '';
			if ( preg_match( '/balanc|fund|credit|баланс|средств|денег/iu', $error ) ) {
				throw new ApiException( __( 'Turgenev reports insufficient balance. Top up your account and try again.', 'turgenev' ) );
			}
			throw new ApiException( __( 'Turgenev rejected the request. Check the API key and account status in Settings → Turgenev.', 'turgenev' ) );
		}

		// Do not forward a reflected key, including unexpected fields, to any caller.
		array_walk_recursive(
			$decoded,
			static function ( &$value ) use ( $key ): void {
				if ( is_string( $value ) ) {
					$value = str_replace( $key, '[redacted]', $value ); }
			}
		);

		return $decoded;
	}

	/**
	 * Resolve the secret without exposing it outside this transport.
	 *
	 * @return string
	 */
	private function apiKey(): string {
		return null === $this->api_key_override ? $this->options->apiKey() : $this->api_key_override;
	}

	/**
	 * Validate a document text payload against the one contract shared by risk and highlights.
	 *
	 * Length is counted in Unicode characters, never bytes: `strlen()` over-counts every
	 * multi-byte character, so a byte-length check against `MAX_TEXT_LENGTH * 4` lets narrow
	 * (e.g. ASCII) payloads through at up to 4x the intended character limit.
	 *
	 * @param string $text Untrusted document text.
	 * @throws ApiException On empty content, invalid encoding or an oversized payload.
	 * @return string Trimmed, validated text.
	 */
	private function validateTextPayload( string $text ): string {
		$text = trim( $text );

		if ( '' === $text ) {
			throw new ApiException( __( 'There is no content to analyze.', 'turgenev' ) );
		}

		if ( str_contains( $text, "\0" ) || ! preg_match( '//u', $text ) ) {
			throw new ApiException( __( 'The content contains invalid text encoding.', 'turgenev' ) );
		}

		if ( preg_match_all( '/./us', $text ) > self::MAX_TEXT_LENGTH ) {
			throw new ApiException(
				sprintf(
					/* translators: %d: maximum character count. */
					__( 'Turgenev accepts up to %d characters per check.', 'turgenev' ),
					self::MAX_TEXT_LENGTH
				)
			);
		}

		return $text;
	}
}
