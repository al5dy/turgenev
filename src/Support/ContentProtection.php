<?php
/**
 * Defense in depth for documents annotated by earlier plugin builds.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Support;

defined( 'ABSPATH' ) || exit;

/** Removes only legacy Turgenev wrappers, preserving other markup byte-for-byte. */
final class ContentProtection {
	/** Register for all post types, including autosave/revision inserts. */
	public function register(): void {
		add_filter( 'wp_insert_post_data', array( $this, 'beforeInsert' ), PHP_INT_MAX, 1 );
		add_filter( 'the_content', array( $this, 'clean' ), PHP_INT_MAX );
		add_filter( 'the_excerpt', array( $this, 'clean' ), PHP_INT_MAX );
		add_filter( 'render_block', array( $this, 'clean' ), PHP_INT_MAX );
	}

	/**
	 * WordPress passes slashed data here, including revision content.
	 *
	 * @param array<string,mixed> $data Post fields.
	 * @return array<string,mixed>
	 */
	public function beforeInsert( array $data ): array {
		foreach ( array( 'post_content', 'post_excerpt', 'post_content_filtered' ) as $field ) {
			if ( isset( $data[ $field ] ) && is_string( $data[ $field ] ) ) {
				$data[ $field ] = wp_slash( $this->clean( wp_unslash( $data[ $field ] ) ) );
			}
		}
		return $data;
	}

	/**
	 * Unwrap plugin-only spans; never parse/re-serialize the whole document.
	 *
	 * @param string $html Existing content.
	 * @return string
	 */
	public function clean( string $html ): string {
		if ( false === stripos( $html, 'turgenev-highlight' ) ) {
			return $html;
		}
		$stack  = array();
		$result = preg_replace_callback(
			'~<!--[\s\S]*?-->|<(script|style|textarea)\b[^>]*>[\s\S]*?</\1\s*>|</?span\b(?:[^>"\']|"[^"]*"|\'[^\']*\')*>~i',
			function ( array $token ) use ( &$stack ): string {
				$tag = $token[0];
				if ( str_starts_with( $tag, '<!--' ) ) {
					return $this->cleanBlockComment( $tag );
				}
				if ( ! preg_match( '~^</?span\b~i', $tag ) ) {
					return $tag;
				}
				if ( str_starts_with( $tag, '</' ) ) {
					return array_pop( $stack ) ? '' : $tag;
				}
				$processor = new \WP_HTML_Tag_Processor( $tag );
				$remove    = $processor->next_tag() && $processor->has_class( 'turgenev-highlight' );
				$stack[]   = $remove;
				return $remove ? '' : $tag;
			},
			$html
		);
		return null === $result ? $html : $result;
	}

	/**
	 * Also handle HTML attributes stored inside Gutenberg's JSON comments.
	 *
	 * @param string $comment Block delimiter.
	 * @return string
	 */
	private function cleanBlockComment( string $comment ): string {
		if ( ! preg_match( '~^(<!--\s+wp:[\w/-]+\s+)(\{[\s\S]*\})(\s*/?-->)$~', $comment, $parts ) ) {
			return $comment;
		}
		$data = json_decode( $parts[2], true );
		if ( ! is_array( $data ) ) {
			return $comment;
		}
		$original = $data;
		array_walk_recursive(
			$data,
			function ( &$value ): void {
				if ( is_string( $value ) ) {
					$value = $this->clean( $value );
				}
			}
		);
		if ( $data === $original ) {
			return $comment;
		}
		// Use the core block attribute serializer to preserve delimiter escaping.
		return $parts[1] . serialize_block_attributes( $data ) . $parts[3];
	}
}
