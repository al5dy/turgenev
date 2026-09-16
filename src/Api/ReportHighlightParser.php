<?php
/**
 * Extracts presentation-safe highlight ranges from a Turgenev HTML report.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Api;

use Al5dy\Turgenev\Support\Requirements;

defined( 'ABSPATH' ) || exit;

/** Converts untrusted provider markup to validated text offsets, never HTML. */
final class ReportHighlightParser {
	private const MAX_MARKS = 20000;
	/** ECMAScript whitespace: the browser and provider ranges must use the same offsets. */
	private const WHITESPACE = '/[\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+/u';

	/**
	 * Whether this environment can parse highlight markup.
	 *
	 * @var bool
	 */
	private bool $has_dom;

	/**
	 * Resolve the environment's DOM capability, overridable for tests.
	 *
	 * @param bool|null $has_dom Forced capability; null resolves `Requirements::hasDom()`.
	 */
	public function __construct( ?bool $has_dom = null ) {
		$this->has_dom = $has_dom ?? Requirements::hasDom();
	}

	/**
	 * Extract ranges only when the complete document text matches.
	 *
	 * @param string $report_html Provider report page.
	 * @param string $expected_text Current normalized document text.
	 * @throws ApiException On missing, mismatched or oversized markup.
	 * @return array{text: string, marks: list<array{start: int, end: int, category: string, level: int}>}
	 */
	public function parse( string $report_html, string $expected_text ): array {
		if ( ! $this->has_dom ) {
			throw new ApiException( __( 'Highlighting is unavailable on this server (the PHP DOM extension is not installed). Analysis and balance are unaffected.', 'turgenev' ) );
		}

		$markup = $this->report_markup( $report_html );
		if ( '' === $markup ) {
			throw new ApiException( __( 'Turgenev report did not contain highlight markup.', 'turgenev' ) );
		}

		$markup_document = $this->load_html( $markup );
		$raw_text        = '';
		$raw_marks       = array();
		$this->collect( $markup_document, $raw_text, $raw_marks );

		$normalized_text = $this->normalize( $raw_text );
		if ( '' === $normalized_text || $normalized_text !== $this->normalize( $expected_text ) ) {
			throw new ApiException( __( 'Turgenev report text does not match the analyzed document.', 'turgenev' ) );
		}

		$marks   = array();
		$offsets = $this->normalized_offsets( $raw_text );
		$length  = $this->utf16_length( $normalized_text );
		foreach ( $raw_marks as $raw_mark ) {
			$start = $offsets[ $raw_mark['start'] ];
			$end   = min( $length, $offsets[ $raw_mark['end'] ] );

			if ( $start >= $end ) {
				continue;
			}

			$marks[] = array(
				'start'    => $start,
				'end'      => $end,
				'category' => $raw_mark['category'],
				'level'    => $raw_mark['level'],
			);
		}

		usort(
			$marks,
			static fn( array $left, array $right ): int => ( $left['start'] === $right['start'] ? $left['end'] <=> $right['end'] : $left['start'] <=> $right['start'] )
		);

		if ( count( $marks ) > self::MAX_MARKS ) {
			throw new ApiException( __( 'This report contains too many highlights. Use the full report.', 'turgenev' ) );
		}

		return array(
			'text'  => $normalized_text,
			'marks' => $marks,
		);
	}

	/**
	 * Parse inert HTML with network access disabled.
	 *
	 * @param string $html Markup fragment.
	 * @return \DOMDocument
	 * @throws ApiException On parse failure.
	 */
	private function load_html( string $html ): \DOMDocument {
		$document = new \DOMDocument();
		$previous = libxml_use_internal_errors( true );

		try {
			$loaded = $document->loadHTML( '<?xml encoding="UTF-8">' . $html, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET );
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors( $previous );
		}

		if ( ! $loaded ) {
			throw new ApiException( __( 'Turgenev report markup could not be parsed.', 'turgenev' ) );
		}

		return $document;
	}

	/**
	 * Preserve provider textarea contents before HTML parsing.
	 *
	 * @param string $report_html Full report page.
	 * @return string
	 */
	private function report_markup( string $report_html ): string {
		/*
		 * Turgenev writes annotated HTML directly inside a textarea. DOMDocument
		 * normalizes that non-standard markup and drops the nested span elements,
		 * so preserve the raw textarea contents before parsing the annotation HTML.
		 */
		$matched = preg_match(
			'/<textarea\\b(?=[^>]*\\bid\\s*=\\s*([\'\"])textfield\\1)[^>]*>(.*?)<\\/textarea\\s*>/is',
			$report_html,
			$match
		);

		if ( 1 !== $matched || ! isset( $match[2] ) ) {
			return '';
		}

		return preg_match( '/<(?:p|span|div)\b/i', $match[2] ) ? $match[2] : html_entity_decode( $match[2], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	}

	/**
	 * Collect visible text and byte ranges before UTF-16 conversion.
	 *
	 * @param \DOMNode                                                        $node Current inert node.
	 * @param string                                                          $text Accumulated source text.
	 * @param list<array{start: int, end: int, category: string, level: int}> $marks Collected annotations.
	 */
	private function collect( \DOMNode $node, string &$text, array &$marks ): void {
		if ( XML_TEXT_NODE === $node->nodeType || XML_CDATA_SECTION_NODE === $node->nodeType ) {
			$text .= $node->nodeValue;
			return;
		}

		if ( $node instanceof \DOMElement && ( in_array( strtolower( $node->tagName ), array( 'script', 'style', 'template', 'noscript', 'svg', 'canvas', 'iframe' ), true ) || $node->hasAttribute( 'hidden' ) || 'true' === $node->getAttribute( 'aria-hidden' ) ) ) {
			return;
		}
		$separated = $node instanceof \DOMElement && preg_match( '/^(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|h[1-6]|hr|li|main|ol|p|pre|section|table|td|th|tr|ul)$/i', $node->tagName );
		if ( $separated ) {
			$text .= ' ';
		}
		$mark  = $node instanceof \DOMElement ? $this->mark_for_element( $node ) : null;
		$start = strlen( $text );

		foreach ( $node->childNodes as $child ) {
			$this->collect( $child, $text, $marks );
		}

		if ( null !== $mark && $start < strlen( $text ) ) {
			$mark['start'] = $start;
			$mark['end']   = strlen( $text );
			$marks[]       = $mark;
		}
		if ( $separated ) {
			$text .= ' ';
		}
	}

	/**
	 * Accept only recognized category/severity classes.
	 *
	 * @param \DOMElement $element Provider element.
	 * @return array{category: string, level: int}|null
	 */
	private function mark_for_element( \DOMElement $element ): ?array {
		$class_names = (array) preg_split( '/\s+/', trim( $element->getAttribute( 'class' ) ) );
		if ( ! in_array( 'xhl', $class_names, true ) ) {
			return null;
		}

		$categories = array(
			'slop'           => 'style',
			'bb'             => 'style',
			'doubles'        => 'frequency',
			'top_and'        => 'frequency',
			'top_notstop'    => 'frequency',
			'queries'        => 'keywords',
			'queries_strict' => 'keywords',
			'cqueries'       => 'keywords',
			'fog'            => 'formality',
			'stop'           => 'formality',
			'fre'            => 'readability',
			'ari'            => 'readability',
		);

		foreach ( $class_names as $class_name ) {
			if ( ! preg_match( '/^([a-z_]+)([1-9]\d*)$/', $class_name, $match ) || ! isset( $categories[ $match[1] ] ) ) {
				continue;
			}

			return array(
				'category' => $categories[ $match[1] ],
				'level'    => min( 3, (int) $match[2] ),
			);
		}

		return null;
	}

	/**
	 * Trim collapsed whitespace to match browser text.
	 *
	 * @param string $text Source text.
	 * @return string
	 */
	private function normalize( string $text ): string {
		return trim( $this->collapse_whitespace( $text ) );
	}

	/**
	 * Map byte boundaries to normalized UTF-16 offsets in one pass, even for dense reports.
	 *
	 * @param string $text Source text.
	 * @return array<int,int>
	 */
	private function normalized_offsets( string $text ): array {
		$offsets = array( 0 => 0 );
		$length  = 0;
		$space   = false;
		preg_match_all( '/./us', $text, $characters, PREG_OFFSET_CAPTURE );
		foreach ( $characters[0] as [ $character, $offset ] ) {
			if ( preg_match( self::WHITESPACE, $character ) ) {
				if ( $length > 0 && ! $space ) {
					++$length;
				}
				$space = true;
			} else {
				$length += 4 === strlen( $character ) ? 2 : 1;
				$space   = false;
			}
			$offsets[ $offset + strlen( $character ) ] = $length;
		}
		return $offsets;
	}

	/**
	 * Use the shared Unicode whitespace convention.
	 *
	 * @param string $text Source text.
	 * @return string
	 */
	private function collapse_whitespace( string $text ): string {
		return (string) preg_replace( self::WHITESPACE, ' ', $text );
	}

	/**
	 * Count browser UTF-16 units even without mbstring.
	 *
	 * @param string $text Source text.
	 * @return int
	 */
	private function utf16_length( string $text ): int {
		if ( function_exists( 'mb_convert_encoding' ) ) {
			return (int) ( strlen( mb_convert_encoding( $text, 'UTF-16LE', 'UTF-8' ) ) / 2 );
		}

		return (int) preg_match_all( '/./us', $text ) + (int) preg_match_all( '/[\x{10000}-\x{10FFFF}]/u', $text );
	}
}
