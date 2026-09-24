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
	 * Maps each analysis section to the provider's report tab identifier.
	 *
	 * The provider's report page renders one section per request via a `coverdict` form
	 * field (the same field its own tab navigation submits); this is not a separate,
	 * documented API operation, just the read-only report form already used by
	 * {@see reportHighlights()} with one extra field.
	 *
	 * @var array<string, string>
	 */
	public const SECTION_TABS = array(
		'overall'     => 'bb-mix',
		'frequency'   => 'doubles',
		'style'       => 'slop_words',
		'keywords'    => 'queries-mix',
		'formality'   => 'fog-mix',
		'readability' => 'fre',
	);

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
			throw new ApiException( __( 'Turgenev returned an invalid balance response.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
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
	 * @return array{text: string, marks: list<array{start: int, end: int, category: string, type: string, level: int, classes: list<string>, xhint: bool, sentence: ?string, fragments: list<string>, stems: list<string>}>}
	 */
	public function reportHighlights( string $report_token, string $expected_text ): array {
		$report_token  = ResponseValidator::token( $report_token );
		$expected_text = $this->validateTextPayload( $expected_text );
		$markup        = $this->fetchReportMarkup( $report_token );

		return ( new ReportHighlightParser() )->parse( $markup, $expected_text );
	}

	/**
	 * Fetch the read-only report page for one section and return presentation-safe details.
	 *
	 * @param string $report_token Opaque report identifier (the analysis's overall `link`).
	 * @param string $section One of {@see SECTION_TABS}'s keys ('overall' or a `ResponseValidator::SECTIONS` block).
	 * @throws ApiException On an unsupported section or invalid/unavailable report data.
	 * @return array<string, mixed>
	 */
	public function reportSectionDetails( string $report_token, string $section ): array {
		if ( ! isset( self::SECTION_TABS[ $section ] ) ) {
			throw new ApiException( __( 'Unsupported Turgenev report section.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$report_token = ResponseValidator::token( $report_token );
		$markup       = $this->fetchReportMarkup( $report_token, array( 'coverdict' => self::SECTION_TABS[ $section ] ) );

		return ( new ReportSectionParser() )->parse( $markup, $section );
	}

	/**
	 * Fetch the provider's read-only report page.
	 *
	 * The provider's read-only report form submits its reference with POST. A GET request
	 * may return a report shell without the annotated textarea. `$extra_body` selects which
	 * tab renders (see {@see SECTION_TABS}); an empty value matches the default ("Overall
	 * risk") tab, which is what {@see reportHighlights()} relies on for highlight markup.
	 *
	 * @param string               $report_token Already-validated opaque report identifier.
	 * @param array<string, mixed> $extra_body Additional POST fields merged into the request.
	 * @throws ApiException On transport failure or an invalid/oversized response.
	 * @return string
	 */
	private function fetchReportMarkup( string $report_token, array $extra_body = array() ): string {
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
				'body'                => array_merge(
					array(
						't'         => $report_token,
						'keep_isum' => '',
						'scroll_x'  => '',
						'scroll_y'  => '',
					),
					$extra_body
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new ApiException( __( 'Could not retrieve the Turgenev report. Try again later.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$status = wp_remote_retrieve_response_code( $response );
		if ( $status < 200 || $status >= 300 ) {
			throw new ApiException(
				sprintf(
					/* translators: %d: HTTP status code. */
					__( 'Turgenev report returned HTTP %d.', 'turgenev' ), // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
					$status // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
				)
			);
		}

		$markup = wp_remote_retrieve_body( $response );
		if ( '' === trim( $markup ) || strlen( $markup ) > self::MAX_REPORT_LENGTH ) {
			throw new ApiException( __( 'Turgenev report markup is unavailable.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		return $markup;
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
			throw new ApiException( __( 'Unsupported Turgenev API operation.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$key = $this->apiKey();
		if ( '' === $key ) {
			throw new ApiException( __( 'Configure a Turgenev API key first.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
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
			throw new ApiException( __( 'Could not reach the Turgenev API. Try again later.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$status = wp_remote_retrieve_response_code( $response );
		if ( $status < 200 || $status >= 300 ) {
			throw new ApiException(
				sprintf(
					/* translators: %d: HTTP status code. */
					__( 'Turgenev API returned HTTP %d.', 'turgenev' ), // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
					$status // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
				)
			);
		}

		$raw = wp_remote_retrieve_body( $response );
		if ( strlen( $raw ) > self::MAX_REPORT_LENGTH ) {
			throw new ApiException( __( 'Turgenev API returned an oversized response.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}
		if ( '' === trim( $raw ) ) {
			throw new ApiException( __( 'Turgenev API returned an empty response.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		try {
			$decoded = json_decode( $raw, true, 512, JSON_THROW_ON_ERROR );
		} catch ( \JsonException $exception ) {
			throw new ApiException( __( 'Turgenev API returned malformed JSON.', 'turgenev' ), 0, $exception ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		if ( ! is_array( $decoded ) || array_is_list( $decoded ) ) {
			throw new ApiException( __( 'Turgenev API returned an unexpected response.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		if ( array_key_exists( 'error', $decoded ) ) {
			// Provider/transport messages can reflect secrets. Only plugin-owned messages cross this boundary.
			$error = is_string( $decoded['error'] ) ? $decoded['error'] : '';
			if ( preg_match( '/balanc|fund|credit|баланс|средств|денег/iu', $error ) ) {
				throw new ApiException( __( 'Turgenev reports insufficient balance. Top up your account and try again.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
			}
			throw new ApiException( __( 'Turgenev rejected the request. Check the API key and account status in Settings → Turgenev.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
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
			throw new ApiException( __( 'There is no content to analyze.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		if ( str_contains( $text, "\0" ) || ! preg_match( '//u', $text ) ) {
			throw new ApiException( __( 'The content contains invalid text encoding.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		if ( preg_match_all( '/./us', $text ) > self::MAX_TEXT_LENGTH ) {
			throw new ApiException(
				sprintf(
					/* translators: %d: maximum character count. */
					__( 'Turgenev accepts up to %d characters per check.', 'turgenev' ), // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
					self::MAX_TEXT_LENGTH // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
				)
			);
		}

		return $text;
	}
}
