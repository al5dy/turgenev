<?php
/**
 * Plugin option access.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Support;

defined( 'ABSPATH' ) || exit;

final class OptionStore {
	public const OPTION_NAME = 'turgenev';

	/**
	 * @return array<string, mixed>
	 */
	public function all(): array {
		$value = get_option( self::OPTION_NAME, array() );

		return is_array( $value ) ? $value : array();
	}

	public function apiKey(): string {
		$options = $this->all();
		$key     = $options['api_key'] ?? '';

		return is_string( $key ) ? trim( $key ) : '';
	}

	public function hasApiKey(): bool {
		return '' !== $this->apiKey();
	}

	public function maskedApiKey(): string {
		$key = $this->apiKey();

		if ( '' === $key ) {
			return '';
		}

		$tail = substr( $key, -4 );

		return '••••••••' . $tail;
	}
}
