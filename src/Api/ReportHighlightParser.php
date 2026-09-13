<?php
/**
 * Extracts presentation-safe highlight ranges from a Turgenev HTML report.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Api;

defined( 'ABSPATH' ) || exit;

final class ReportHighlightParser {
	private const MAX_MARKS = 500;

	/**
	 * @return array{text: string, marks: list<array{start: int, end: int, category: string, level: int}>}
	 */
	public function parse( string $report_html, string $expected_text ): array {
		if ( ! class_exists( '\DOMDocument' ) ) {
			throw new ApiException( __( 'This server cannot parse Turgenev report highlights.', 'turgenev' ) );
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
			throw new ApiException( __( 'Turgenev report text does not match the analyzed block.', 'turgenev' ) );
		}

		$marks = array();
		foreach ( $raw_marks as $raw_mark ) {
			$start = $this->utf16_length( $this->normalize_prefix( substr( $raw_text, 0, $raw_mark['start'] ) ) );
			$end   = $this->utf16_length( $this->normalize_prefix( substr( $raw_text, 0, $raw_mark['end'] ) ) );

			if ( $start >= $end || $end > $this->utf16_length( $normalized_text ) ) {
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
			static fn( array $left, array $right ): int => $left['start'] <=> $right['start'] ?: $left['end'] <=> $right['end']
		);

		$non_overlapping = array();
		$last_end        = 0;
		foreach ( $marks as $mark ) {
			if ( $mark['start'] < $last_end ) {
				continue;
			}

			$non_overlapping[] = $mark;
			$last_end          = $mark['end'];
			if ( count( $non_overlapping ) >= self::MAX_MARKS ) {
				break;
			}
		}

		return array(
			'text'  => $normalized_text,
			'marks' => $non_overlapping,
		);
	}

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

		return html_entity_decode( $match[2], ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	}

	/**
	 * @param list<array{start: int, end: int, category: string, level: int}> $marks
	 */
	private function collect( \DOMNode $node, string &$text, array &$marks ): void {
		if ( XML_TEXT_NODE === $node->nodeType || XML_CDATA_SECTION_NODE === $node->nodeType ) {
			$text .= $node->nodeValue;
			return;
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
	}

	/**
	 * @return array{category: string, level: int}|null
	 */
	private function mark_for_element( \DOMElement $element ): ?array {
		$class_names = preg_split( '/\s+/', trim( $element->getAttribute( 'class' ) ) ) ?: array();
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

	private function normalize( string $text ): string {
		return trim( $this->collapse_whitespace( $text ) );
	}

	private function normalize_prefix( string $text ): string {
		return ltrim( $this->collapse_whitespace( $text ) );
	}

	private function collapse_whitespace( string $text ): string {
		return (string) preg_replace( '/[\s\x{00A0}]+/u', ' ', $text );
	}

	private function utf16_length( string $text ): int {
		if ( function_exists( 'mb_convert_encoding' ) ) {
			return (int) ( strlen( mb_convert_encoding( $text, 'UTF-16LE', 'UTF-8' ) ) / 2 );
		}

		return strlen( $text );
	}
}
