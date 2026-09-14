<?php
/**
 * Plugin option access.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Support;

defined( 'ABSPATH' ) || exit;

/** Reads legacy-compatible configuration without assuming its shape. */
final class OptionStore {
	public const OPTION_NAME = 'turgenev';

	/**
	 * Retrieve an array even when stored options are corrupted.
	 *
	 * @return array<string, mixed>
	 */
	public function all(): array {
		$value = get_option( self::OPTION_NAME, array() );

		return is_array( $value ) ? $value : array();
	}

	/** Retrieve the stored server-side secret. */
	public function apiKey(): string {
		$options = $this->all();
		$key     = $options['api_key'] ?? '';

		return is_string( $key ) ? trim( $key ) : '';
	}

	/** Report configuration presence, not provider validity. */
	public function hasApiKey(): bool {
		return '' !== $this->apiKey();
	}

	/** Display a masked suffix without exposing short keys. */
	public function maskedApiKey(): string {
		$key = $this->apiKey();

		if ( '' === $key ) {
			return '';
		}

		$tail = strlen( $key ) > 8 ? substr( $key, -4 ) : '';

		return '••••••••' . $tail;
	}
}
