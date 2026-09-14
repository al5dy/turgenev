<?php
/**
 * Allowlisted provider response contract. Unknown fields never reach the browser.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Api;

defined( 'ABSPATH' ) || exit;

/** Validates provider values without trusting their shape or error messages. */
final class ResponseValidator {
	/** Supported report sections. */
	public const SECTIONS = array( 'frequency', 'style', 'keywords', 'formality', 'readability' );

	/**
	 * Validate a decimal without float-based business decisions.
	 *
	 * @throws ApiException On invalid numeric data.
	 * @param mixed $value Provider value.
	 * @return string
	 */
	public static function decimal( $value ): string {
		if ( ( ! is_string( $value ) && ! is_int( $value ) && ! is_float( $value ) ) || ! preg_match( '/^-?\d{1,12}(?:\.\d{1,8})?$/D', (string) $value ) ) {
			throw new ApiException( __( 'Turgenev returned an invalid numeric value.', 'turgenev' ) );
		}
		return (string) $value;
	}

	/**
	 * Validate an opaque report reference, not a URL.
	 *
	 * @throws ApiException On an invalid report reference.
	 * @param mixed $value Provider reference.
	 * @return string
	 */
	public static function token( $value ): string {
		if ( ! is_string( $value ) || ! preg_match( '/^[A-Za-z0-9_-]{8,128}$/D', $value ) ) {
			throw new ApiException( __( 'Turgenev report reference is invalid.', 'turgenev' ) );
		}
		return $value;
	}

	/**
	 * Validate a complete extended analysis.
	 *
	 * @throws ApiException On incomplete or malformed analysis data.
	 * @param array<string,mixed> $data Provider object.
	 * @return array<string,mixed>
	 */
	public static function analysis( array $data ): array {
		if ( ! isset( $data['risk'], $data['level'], $data['link'], $data['details'] ) || ! is_array( $data['details'] ) || count( $data['details'] ) !== count( self::SECTIONS ) ) {
			throw new ApiException( __( 'Turgenev returned an incomplete analysis.', 'turgenev' ) );
		}
		$result = array(
			'risk'    => self::decimal( $data['risk'] ),
			'level'   => self::label( $data['level'] ),
			'link'    => self::token( $data['link'] ),
			'details' => array(),
		);
		$seen   = array();
		foreach ( $data['details'] as $detail ) {
			if ( ! is_array( $detail ) || ! isset( $detail['block'], $detail['sum'], $detail['link'] ) || ! is_string( $detail['block'] ) || ! in_array( $detail['block'], self::SECTIONS, true ) || isset( $seen[ $detail['block'] ] ) ) {
				throw new ApiException( __( 'Turgenev returned an invalid analysis section.', 'turgenev' ) );
			}
			$seen[ $detail['block'] ] = true;
			$params                   = $detail['params'] ?? array();
			if ( ! is_array( $params ) || count( $params ) > 100 ) {
				throw new ApiException( __( 'Turgenev returned invalid analysis parameters.', 'turgenev' ) );
			}
			$section = array(
				'block'  => $detail['block'],
				'sum'    => self::decimal( $detail['sum'] ),
				'link'   => self::token( $detail['link'] ),
				'params' => array(),
			);
			foreach ( $params as $param ) {
				if ( ! is_array( $param ) || ! isset( $param['name'], $param['value'], $param['score'] ) ) {
					throw new ApiException( __( 'Turgenev returned invalid analysis parameters.', 'turgenev' ) );
				}
				$section['params'][] = array(
					'name'  => self::label( $param['name'] ),
					'value' => self::parameterValue( $param['value'] ),
					'score' => self::decimal( $param['score'] ),
				);
			}
			$result['details'][] = $section;
		}
		return $result;
	}

	/**
	 * Validate display-only measurements, which may be text such as "Нет".
	 *
	 * @throws ApiException On an invalid parameter value.
	 * @param mixed $value Provider measurement.
	 * @return string
	 */
	private static function parameterValue( $value ): string {
		if ( is_int( $value ) || ( is_float( $value ) && is_finite( $value ) ) ) {
			$value = (string) $value;
		}
		$value = self::label( $value );
		if ( '' === $value ) {
			throw new ApiException( __( 'Turgenev returned invalid analysis parameters.', 'turgenev' ) );
		}
		return $value;
	}

	/**
	 * Limit presentation strings.
	 *
	 * @throws ApiException On an invalid label.
	 * @param mixed $value Provider string.
	 * @return string
	 */
	private static function label( $value ): string {
		if ( ! is_string( $value ) || '' === trim( $value ) || strlen( $value ) > 1000 ) {
			throw new ApiException( __( 'Turgenev returned an invalid analysis label.', 'turgenev' ) );
		}
		return sanitize_text_field( $value );
	}
}
