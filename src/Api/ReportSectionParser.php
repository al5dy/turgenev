<?php
/**
 * Extracts presentation-safe per-section report details from a Turgenev HTML report.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\Api;

use Al5dy\Turgenev\Support\Requirements;

defined( 'ABSPATH' ) || exit;

/**
 * Converts one provider report tab's markup into a validated, display-only structure.
 *
 * Unlike {@see ReportHighlightParser}, this never needs to reproduce browser text offsets:
 * it only reads presentation values (labels, counts, percentages) out of the report's
 * right-hand info panel, so a plain DOMDocument/DOMXPath pass is enough.
 *
 * The provider's report page also renders a per-document verdict sentence and a "problems
 * in this sentence" preview, but both are populated only inside the provider's own
 * logged-in browser session (confirmed empty on every anonymous, token-only fetch this
 * class receives) - this plugin only ever holds the token, never a session cookie, so
 * neither is parsed here. The overall verdict is derived from `RiskResult.level` instead,
 * which the JSON `risk` operation already provides.
 */
final class ReportSectionParser {
	private const MAX_ITEMS = 200;

	/**
	 * Extract a recognized `xhl <type><level>` pair out of a `class` attribute value.
	 *
	 * Shared by {@see parseLegend()} (an `<em>`'s class) and {@see parseWordStats()} (a
	 * `<tr>`'s class, e.g. a repeated word row's `xhl doubles4 stmhl-btn stm-6-190E7`),
	 * both of which need the provider's exact color subtype, not just a generic severity.
	 *
	 * @param string $class_attribute Attribute value.
	 * @return array{type: string, level: int}|null
	 */
	private static function xhlFromClass( string $class_attribute ): ?array {
		$class_names = preg_split( '/\s+/', trim( $class_attribute ) );
		if ( ! is_array( $class_names ) || ! in_array( 'xhl', $class_names, true ) ) {
			return null;
		}
		foreach ( $class_names as $token ) {
			if ( preg_match( '/^([a-z_]+)([1-9]\d*)$/', $token, $match ) && isset( ReportHighlightParser::CATEGORIES[ $match[1] ] ) ) {
				return array(
					'type'  => $match[1],
					'level' => min( 9, (int) $match[2] ),
				);
			}
		}
		return null;
	}

	/**
	 * Whether this environment can parse report markup.
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
	 * Extract one section's presentation data from a full report page.
	 *
	 * @param string $report_html Provider report page for one tab.
	 * @param string $section One of ApiClient::SECTION_TABS's keys.
	 * @throws ApiException On a missing capability, unsupported section or empty report panel.
	 * @return array<string, mixed>
	 */
	public function parse( string $report_html, string $section ): array {
		if ( ! $this->has_dom ) {
			throw new ApiException( __( 'Section details are unavailable on this server (the PHP DOM extension is not installed).', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$document = $this->loadHtml( $report_html );
		$xpath    = new \DOMXPath( $document );

		if ( 0 === $xpath->query( "//*[@id='infoblock']" )->length ) {
			throw new ApiException( __( 'Turgenev report did not contain section details.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$result = array( 'params' => $this->parseParams( $xpath ) );

		switch ( $section ) {
			case 'overall':
				break; // Only the characteristic table applies; see the class docblock.
			case 'frequency':
				$result['words']   = $this->parseWordStats( $xpath, 'words_frq_stat', true );
				$result['phrases'] = $this->parseWordStats( $xpath, 'bgrms_frq_stat', false );
				break;
			case 'keywords':
				$result['breakdown'] = $this->parseBreakdown( $xpath );
				$result['legend']    = $this->parseLegend( $xpath );
				break;
			case 'style':
			case 'formality':
			case 'readability':
				$result['legend'] = $this->parseLegend( $xpath );
				break;
			default:
				throw new ApiException( __( 'Unsupported Turgenev report section.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		return $result;
	}

	/**
	 * Parse the report page with network access disabled.
	 *
	 * @param string $html Full report page markup.
	 * @return \DOMDocument
	 * @throws ApiException On parse failure.
	 */
	private function loadHtml( string $html ): \DOMDocument {
		$document = new \DOMDocument();
		$previous = libxml_use_internal_errors( true );

		try {
			$loaded = $document->loadHTML( '<?xml encoding="UTF-8">' . $html, LIBXML_NONET );
		} finally {
			libxml_clear_errors();
			libxml_use_internal_errors( $previous );
		}

		if ( ! $loaded ) {
			throw new ApiException( __( 'Turgenev report markup could not be parsed.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		return $document;
	}

	/**
	 * Parse the section's main characteristic rows (name, value, score, secondary flag).
	 *
	 * Excludes bullet sub-rows (e.g. the "Keywords" section's coverage breakdown), which
	 * {@see parseBreakdown()} reads separately: both share the same `span.xpname` marker,
	 * distinguished only by whether the first cell carries the `xphintblock` wrapper.
	 *
	 * @param \DOMXPath $xpath Report document.
	 * @return list<array{name: string, value: string, score: string, low: bool}>
	 */
	private function parseParams( \DOMXPath $xpath ): array {
		$rows  = $xpath->query( "//table[contains(concat(' ', normalize-space(@class), ' '), ' xprops ')]//tr" );
		$items = array();
		foreach ( $rows as $row ) {
			if ( count( $items ) >= self::MAX_ITEMS || ! $row instanceof \DOMElement ) {
				continue;
			}
			$first_cell = $xpath->query( './td[1]', $row )->item( 0 );
			if ( ! $first_cell instanceof \DOMElement || false === strpos( (string) $first_cell->getAttribute( 'class' ), 'xphintblock' ) ) {
				continue; // Not a main-characteristic row (either a bullet sub-row or malformed markup).
			}
			$name_node = $xpath->query( ".//span[contains(concat(' ', normalize-space(@class), ' '), ' xpname ')]", $row )->item( 0 );
			$label     = $name_node ? trim( $name_node->textContent ) : '';
			if ( '' === $label ) {
				continue;
			}
			$value_node = $xpath->query( ".//td[@align='right']//span[contains(concat(' ', normalize-space(@class), ' '), ' value ')]", $row )->item( 0 );
			$mark_node  = $xpath->query( ".//span[contains(concat(' ', normalize-space(@class), ' '), ' mark ')]", $row )->item( 0 );
			$items[]    = array(
				'name'  => ResponseValidator::label( $label ),
				'value' => $value_node ? ResponseValidator::label( trim( $value_node->textContent ) ) : '',
				'score' => $mark_node ? (string) max( 0, (int) trim( $mark_node->textContent ) ) : '0',
				'low'   => (bool) preg_match( '/\blow\b/', (string) $row->getAttribute( 'class' ) ),
			);
		}
		return $items;
	}

	/**
	 * Parse the "Keywords" section's coverage breakdown bullets (query/exact/long coverage).
	 *
	 * @param \DOMXPath $xpath Report document.
	 * @return list<array{label: string, value: string}>
	 */
	private function parseBreakdown( \DOMXPath $xpath ): array {
		$rows  = $xpath->query( "//table[contains(concat(' ', normalize-space(@class), ' '), ' xprops ')]//tr" );
		$items = array();
		foreach ( $rows as $row ) {
			if ( count( $items ) >= self::MAX_ITEMS || ! $row instanceof \DOMElement ) {
				continue;
			}
			$first_cell = $xpath->query( './td[1]', $row )->item( 0 );
			if ( $first_cell instanceof \DOMElement && false !== strpos( (string) $first_cell->getAttribute( 'class' ), 'xphintblock' ) ) {
				continue; // Main characteristic row, already covered by parseParams().
			}
			$name_node = $xpath->query( ".//span[contains(concat(' ', normalize-space(@class), ' '), ' xpname ')]", $row )->item( 0 );
			$label     = $name_node ? trim( $name_node->textContent ) : '';
			$label     = (string) preg_replace( '/^[\x{2022}*]+[\s\x{00A0}]*/u', '', $label );
			if ( '' === $label ) {
				continue;
			}
			$value_node = $xpath->query( ".//td[@align='right']//span[contains(concat(' ', normalize-space(@class), ' '), ' value ')]", $row )->item( 0 );
			$value      = $value_node ? trim( $value_node->textContent ) : '';
			if ( '' === $value ) {
				continue;
			}
			$items[] = array(
				'label' => ResponseValidator::label( $label ),
				'value' => ResponseValidator::label( $value ),
			);
		}
		return $items;
	}

	/**
	 * Parse a section's color-coded category legend (severity swatches and their labels).
	 *
	 * `type` preserves the provider's exact class prefix (see
	 * {@see ReportHighlightParser::CATEGORIES}) rather than collapsing it to a generic
	 * severity number: the browser needs it to paint each swatch in the provider's own
	 * color, not an approximation.
	 *
	 * Excludes the overall-risk verdict rows (`legend-active`/`legend-inactive`): those only
	 * ever appear inside a logged-in provider session (see the class docblock) and never on
	 * the 'style', 'keywords', 'formality' or 'readability' tabs this is actually called for.
	 *
	 * @param \DOMXPath $xpath Report document.
	 * @return list<array{type: string, level: int, label: string}>
	 */
	private function parseLegend( \DOMXPath $xpath ): array {
		$rows  = $xpath->query( "//*[@id='legend']//tr" );
		$items = array();
		foreach ( $rows as $row ) {
			if ( count( $items ) >= self::MAX_ITEMS || ! $row instanceof \DOMElement ) {
				continue;
			}
			$class = (string) $row->getAttribute( 'class' );
			if ( false !== strpos( $class, 'legend-active' ) || false !== strpos( $class, 'legend-inactive' ) ) {
				continue;
			}
			$type     = '';
			$level    = 0;
			$em_nodes = $xpath->query( ".//em[contains(concat(' ', normalize-space(@class), ' '), ' xhl ')]", $row );
			if ( $em_nodes->length && $em_nodes->item( 0 ) instanceof \DOMElement ) {
				$xhl = self::xhlFromClass( (string) $em_nodes->item( 0 )->getAttribute( 'class' ) );
				if ( null !== $xhl ) {
					$type  = $xhl['type'];
					$level = $xhl['level'];
				}
			}
			$cells = $xpath->query( './td', $row );
			$label = $cells->length > 1 ? trim( $cells->item( 1 )->textContent ) : '';
			if ( '' === $label ) {
				continue;
			}
			$items[] = array(
				'type'  => $type,
				'level' => $level,
				'label' => ResponseValidator::label( $label ),
			);
		}
		return $items;
	}

	/**
	 * Parse the "Frequency" section's word or phrase repetition table.
	 *
	 * @param \DOMXPath $xpath Report document.
	 * @param string    $container_id Either 'words_frq_stat' or 'bgrms_frq_stat'.
	 * @param bool      $has_percent Whether rows carry a stop-word flag and a share percentage (words only).
	 * @return list<array{text: string, count: int, percent?: string, stopword?: bool, type?: string, level?: int}>
	 */
	private function parseWordStats( \DOMXPath $xpath, string $container_id, bool $has_percent ): array {
		$rows  = $xpath->query( "//*[@id='" . $container_id . "']//table//tr" );
		$items = array();
		foreach ( $rows as $row ) {
			if ( count( $items ) >= self::MAX_ITEMS || ! $row instanceof \DOMElement ) {
				continue;
			}
			$cells = $xpath->query( './td', $row );
			if ( $cells->length < 2 ) {
				continue;
			}
			$text = trim( $cells->item( 0 )->textContent );
			if ( '' === $text ) {
				continue;
			}
			$count_index = $has_percent ? 2 : 1;
			if ( $cells->length <= $count_index ) {
				continue;
			}
			$count_node = $xpath->query( ".//span[contains(concat(' ', normalize-space(@class), ' '), ' value ')]", $cells->item( $count_index ) )->item( 0 );
			$item       = array(
				'text'  => ResponseValidator::label( $text ),
				'count' => $count_node ? max( 0, (int) trim( $count_node->textContent ) ) : 0,
			);
			// A repeated word/phrase row (e.g. "xhl doubles4 stmhl-btn stm-6-190E7") carries the
			// same color class the document's own in-text highlight uses for that word, so the
			// table can be colored to match instead of only flagging stop-words.
			$xhl = self::xhlFromClass( (string) $row->getAttribute( 'class' ) );
			if ( null !== $xhl ) {
				$item['type']  = $xhl['type'];
				$item['level'] = $xhl['level'];
			}
			if ( $has_percent ) {
				$percent_node = $cells->length > 3 ? $xpath->query( ".//span[contains(concat(' ', normalize-space(@class), ' '), ' value ')]", $cells->item( 3 ) )->item( 0 ) : null;
				$percent      = $percent_node ? trim( $percent_node->textContent ) : '';
				if ( preg_match( '/^\d{1,3}(?:\.\d{1,2})?%$/', $percent ) ) {
					$item['percent'] = $percent;
				}
				$item['stopword'] = false !== strpos( (string) $row->getAttribute( 'class' ), 'stop' );
			}
			$items[] = $item;
		}
		return $items;
	}
}
