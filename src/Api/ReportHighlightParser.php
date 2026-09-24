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
	/** Bounds each per-span class list (type classes, fragments, stems); live reports never send more than three of one kind. */
	private const MAX_CLASS_LIST = 8;
	/** ECMAScript whitespace: the browser and provider ranges must use the same offsets. */
	public const WHITESPACE = '/[\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]+/u';
	/**
	 * A "Frequency" stem class: `stm-<length>-<hex id>`, or `stm-<length>--<UTF-8 hex of the
	 * word>` for a word the provider has no stem for (confirmed live: "роутер" is
	 * `stm-5--d180d0bed183d182d0b5d180`). bb-hl.js accepts any `stm-` class alike.
	 */
	public const STEM_PATTERN = '/^stm-\d{1,3}--?[0-9A-Fa-f]{1,256}$/D';
	/** Elements that separate words, exactly as the browser's text model (client.ts `blockBoundary`). */
	public const BLOCK_ELEMENTS = 'address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|h[1-6]|hr|li|main|ol|p|pre|section|table|td|th|tr|ul';

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
	 * @return array{text: string, marks: list<array{start: int, end: int, category: string, type: string, level: int, classes: list<string>, xhint: bool, sentence: ?string, fragments: list<string>, stems: list<string>}>}
	 */
	public function parse( string $report_html, string $expected_text ): array {
		if ( ! $this->has_dom ) {
			throw new ApiException( __( 'Highlighting is unavailable on this server (the PHP DOM extension is not installed). Analysis and balance are unaffected.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$markup = $this->report_markup( $report_html );
		if ( '' === $markup ) {
			throw new ApiException( __( 'Turgenev report did not contain highlight markup.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$expected = $this->normalize( $expected_text );
		$reading  = '' === $expected ? null : $this->matching_reading( $markup, $expected );
		if ( null === $reading ) {
			throw new ApiException( __( 'Turgenev report text does not match the analyzed document.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		$marks   = array();
		$offsets = $this->normalized_offsets( $reading['raw_text'] );
		$length  = $this->utf16_length( $expected );
		foreach ( $reading['raw_marks'] as $raw_mark ) {
			$start = $offsets[ $raw_mark['start'] ];
			$end   = $offsets[ $raw_mark['end'] ];
			if ( null !== $reading['alignment'] ) {
				$start = $reading['alignment']['starts'][ $start ] ?? null;
				$end   = $reading['alignment']['ends'][ $end ] ?? null;
				if ( null === $start || null === $end ) {
					continue;
				}
			}
			$end = min( $length, $end );

			if ( $start >= $end ) {
				continue;
			}

			$marks[] = array(
				'start'     => $start,
				'end'       => $end,
				'category'  => $raw_mark['category'],
				'type'      => $raw_mark['type'],
				'level'     => $raw_mark['level'],
				'classes'   => $raw_mark['classes'],
				'xhint'     => $raw_mark['xhint'],
				'sentence'  => $raw_mark['sentence'],
				'fragments' => $raw_mark['fragments'],
				'stems'     => $raw_mark['stems'],
			);
		}

		usort(
			$marks,
			static fn( array $left, array $right ): int => ( $left['start'] === $right['start'] ? $left['end'] <=> $right['end'] : $left['start'] <=> $right['start'] )
		);

		if ( count( $marks ) > self::MAX_MARKS ) {
			throw new ApiException( __( 'This report contains too many highlights. Use the full report.', 'turgenev' ) ); // phpcs:ignore WordPress.Security.EscapeOutput.ExceptionNotEscaped -- ApiException messages are never echoed directly; ApiController::handle() strips tags before any reaches the browser.
		}

		return array(
			'text'  => $expected,
			'marks' => $marks,
		);
	}

	/**
	 * Read the report's annotated text the way that yields the analyzed document.
	 *
	 * The textarea holds the provider's HTML serialization, but its escaping depends on the
	 * input (confirmed live): usually the text is escaped twice for the textarea (`&amp;lt;`,
	 * undone once by the browser before its editor parses it), sometimes only once (`&lt;`).
	 * Both readings are tried, exactly first, then through align().
	 *
	 * @param string $markup Raw textarea contents.
	 * @param string $expected Normalized document text.
	 * @return array{raw_text: string, raw_marks: list<array<string, mixed>>, alignment: ?array{starts: array<int, int>, ends: array<int, int>}}|null
	 */
	private function matching_reading( string $markup, string $expected ): ?array {
		$readings = array();
		foreach ( array_unique( array( $markup, str_replace( '&amp;', '&', $markup ) ) ) as $candidate ) {
			$raw_text  = '';
			$raw_marks = array();
			$this->collect( $this->load_html( $candidate ), $raw_text, $raw_marks );
			$reading = array(
				'raw_text'  => $raw_text,
				'raw_marks' => $raw_marks,
				'alignment' => null,
			);
			if ( $this->normalize( $raw_text ) === $expected ) {
				return $reading;
			}
			$readings[] = $reading;
		}
		foreach ( $readings as $reading ) {
			$reading['alignment'] = $this->align( $this->normalize( $reading['raw_text'] ), $expected );
			if ( null !== $reading['alignment'] ) {
				return $reading;
			}
		}
		return null;
	}

	/**
	 * Map the report's text onto the document's when the provider only dropped parts of it.
	 *
	 * Confirmed live, the provider removes invisible format characters (a soft hyphen, a
	 * zero-width space) and turns text that merely looks like a tag ("<b>", "<p>") into
	 * markup, dropping `<script>`/`<style>` content with it. Those are the only differences
	 * accepted: every other report character must match the document's, in order, or the
	 * report is rejected as before. A tag the provider now renders as a block may add one
	 * space the document does not have.
	 *
	 * @param string $report Normalized report text.
	 * @param string $expected Normalized document text.
	 * @return array{starts: array<int, int>, ends: array<int, int>}|null UTF-16 report offset => document offset, for a mark's start and for its end; null when not alignable.
	 */
	private function align( string $report, string $expected ): ?array {
		preg_match_all( '/./us', $report, $report_chars );
		preg_match_all( '/./us', $expected, $expected_chars, PREG_OFFSET_CAPTURE );
		$r        = $report_chars[0];
		$e        = $expected_chars[0];
		$starts   = array();
		$ends     = array( 0 => 0 );
		$i        = 0;
		$j        = 0;
		$r_pos    = 0;
		$e_pos    = 0;
		$past_tag = false;
		$count_r  = count( $r );
		$count_e  = count( $e );
		while ( $j < $count_r || $i < $count_e ) {
			if ( $i < $count_e && $j < $count_r && $e[ $i ][0] === $r[ $j ] ) {
				$starts[ $r_pos ] = $e_pos;
				$r_pos           += $this->utf16_length( $r[ $j++ ] );
				$e_pos           += $this->utf16_length( $e[ $i++ ][0] );
				$ends[ $r_pos ]   = $e_pos;
				$past_tag         = false;
				continue;
			}
			// A space is dropped only where a dropped tag left it doubled, or trailing.
			$collapse = ( $past_tag && ( 0 === $j || ' ' === $r[ $j - 1 ] ) ) || $j === $count_r;
			$dropped  = $i < $count_e ? $this->dropped_length( $expected, $e, $i, $collapse ) : 0;
			if ( $dropped > 0 ) {
				$past_tag = $past_tag || $dropped > 1;
				for ( $end = $i + $dropped; $i < $end; ++$i ) {
					$e_pos += $this->utf16_length( $e[ $i ][0] );
				}
				continue;
			}
			if ( $past_tag && $j < $count_r && ' ' === $r[ $j ] ) {
				$starts[ $r_pos ] = $e_pos;
				++$r_pos;
				++$j;
				$ends[ $r_pos ] = $e_pos;
				continue;
			}
			return null;
		}
		return array(
			'starts' => $starts,
			'ends'   => $ends,
		);
	}

	/**
	 * How many document characters from `$index` on the provider drops (see align()).
	 *
	 * @param string                         $text Normalized document text.
	 * @param list<array{0: string, 1: int}> $chars Its characters with byte offsets.
	 * @param int                            $index Current character.
	 * @param bool                           $collapse Whether a space here only doubles one a dropped tag left behind.
	 * @return int Characters dropped; 0 when this one must match.
	 */
	private function dropped_length( string $text, array $chars, int $index, bool $collapse ): int {
		$character = $chars[ $index ][0];
		if ( preg_match( '/^\p{Cf}$/u', $character ) ) {
			return 1;
		}
		if ( ' ' === $character ) {
			return $collapse ? 1 : 0;
		}
		if ( '<' !== $character || ! preg_match( '~\G</?([a-z][a-z0-9-]*)\b[^<>]*>~i', $text, $tag, 0, $chars[ $index ][1] ) ) {
			return 0;
		}
		$bytes = strlen( $tag[0] );
		// Raw-text elements go with their content, as the provider drops them.
		if ( '/' !== $tag[0][1] && preg_match( '/^(?:script|style|template|noscript|iframe|svg|canvas|textarea|title)$/i', $tag[1] ) && preg_match( '~\G.*?</' . $tag[1] . '\s*>~is', $text, $element, 0, $chars[ $index ][1] ) ) {
			$bytes = strlen( $element[0] );
		}
		return (int) preg_match_all( '/./us', substr( $text, $chars[ $index ][1], $bytes ) );
	}

	/**
	 * Parse inert HTML with network access disabled.
	 *
	 * Wrapped in a `<div>` before parsing: libxml2's HTML parser drops whitespace-only
	 * text nodes that sit between top-level inline siblings (e.g. `<span>a</span>
	 * <span>b</span>`) until a block element has been opened. Reports whose first
	 * highlighted word is also the document's first word start with a bare `<span>`,
	 * so without this wrapper every following inter-word space up to the first block
	 * boundary is silently lost and the normalized text no longer matches the browser's.
	 *
	 * @param string $html Markup fragment.
	 * @return \DOMDocument
	 * @throws ApiException On parse failure.
	 */
	private function load_html( string $html ): \DOMDocument {
		$document = new \DOMDocument();
		$previous = libxml_use_internal_errors( true );

		try {
			$loaded = $document->loadHTML( '<?xml encoding="UTF-8"><div>' . $html . '</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET );
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
		 *
		 * Those contents are the provider's own HTML serialization of the analyzed text,
		 * not an escaped copy of it (confirmed live: a literal "<" arrives as `&lt;`, a
		 * literal "&amp;" as `&amp;amp;`, markup as-is), so they are parsed exactly once.
		 * Decoding them first would turn escaped text back into markup or entities, even
		 * in a report with no highlight at all.
		 */
		$matched = preg_match(
			'/<textarea\\b(?=[^>]*\\bid\\s*=\\s*([\'\"])textfield\\1)[^>]*>(.*?)<\\/textarea\\s*>/is',
			$report_html,
			$match
		);

		if ( 1 !== $matched || ! isset( $match[2] ) ) {
			return '';
		}

		return $match[2];
	}

	/**
	 * Collect visible text and byte ranges before UTF-16 conversion.
	 *
	 * @param \DOMNode                                                                                                                                                                           $node Current inert node.
	 * @param string                                                                                                                                                                             $text Accumulated source text.
	 * @param list<array{start: int, end: int, category: string, type: string, level: int, classes: list<string>, xhint: bool, sentence: ?string, fragments: list<string>, stems: list<string>}> $marks Collected annotations.
	 */
	private function collect( \DOMNode $node, string &$text, array &$marks ): void {
		if ( XML_TEXT_NODE === $node->nodeType || XML_CDATA_SECTION_NODE === $node->nodeType ) {
			$text .= $node->nodeValue;
			return;
		}

		if ( $node instanceof \DOMElement && ( in_array( strtolower( $node->tagName ), array( 'script', 'style', 'template', 'noscript', 'svg', 'canvas', 'iframe' ), true ) || $node->hasAttribute( 'hidden' ) || 'true' === $node->getAttribute( 'aria-hidden' ) ) ) {
			return;
		}
		$separated = $node instanceof \DOMElement && preg_match( '/^(?:' . self::BLOCK_ELEMENTS . ')$/i', $node->tagName );
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
	 * Maps each provider highlight class prefix to one of the browser's five report
	 * sections. Shared with {@see ReportSectionParser::parseLegend()}, which reads the
	 * same class prefixes off the report's color legend rather than off text spans.
	 *
	 * @var array<string, string>
	 */
	public const CATEGORIES = array(
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

	/**
	 * Every `<type><level>` class the provider's stylesheet (css/bb_xhl.css) colors, in the
	 * order it defines those rules. They all share one specificity, so on a span carrying
	 * several (live reports send `fog1 stop1` and `top_notstop2 doubles5`) the rule defined
	 * last is the one that paints it, whatever order the classes themselves come in.
	 *
	 * @var list<string>
	 */
	private const CASCADE = array( 'bb1', 'bb2', 'bb3', 'slop1', 'slop2', 'slop3', 'fog1', 'stop1', 'doubles1', 'doubles2', 'doubles3', 'doubles4', 'doubles5', 'top_and1', 'top_notstop1', 'top_and2', 'top_notstop2', 'queries1', 'cqueries1', 'queries_strict1', 'cqueries2', 'fre1', 'ari1', 'fre2', 'ari2' );

	/**
	 * Read the provider's highlight classes off one element's class list.
	 *
	 * `type`/`level` name the class that actually paints the element (see CASCADE); `classes`
	 * keeps every recognized one, which the provider still consults on its own, e.g. to
	 * pick the legend row a hovered span belongs to. Shared with
	 * {@see ReportSectionParser}, whose legend swatches and word-table rows carry the same
	 * classes as the text they describe.
	 *
	 * @param array<int, string> $class_names Element classes, in document order.
	 * @return array{type: string, level: int, classes: list<string>}|null Null without a recognized class.
	 */
	public static function typeClasses( array $class_names ): ?array {
		$classes = array();
		$winner  = null;
		$rank    = -1;
		foreach ( $class_names as $class_name ) {
			if ( count( $classes ) >= self::MAX_CLASS_LIST || in_array( $class_name, $classes, true ) || ! preg_match( '/^([a-z_]+)([1-9]\d*)$/', $class_name, $match ) || ! isset( self::CATEGORIES[ $match[1] ] ) ) {
				continue;
			}
			$classes[] = $class_name;
			// A class with no color rule of its own never overrides one that has.
			$class_rank = array_search( $class_name, self::CASCADE, true );
			$class_rank = false === $class_rank ? -1 : $class_rank;
			if ( null === $winner || $class_rank > $rank ) {
				$winner = $match;
				$rank   = $class_rank;
			}
		}

		if ( null === $winner ) {
			return null;
		}

		return array(
			'type'    => $winner[1],
			// The provider's own scale goes no higher than 5 (doubles1..doubles5); 9 is a
			// defensive upper bound, not a real value it is expected to send.
			'level'   => min( 9, (int) $winner[2] ),
			'classes' => $classes,
		);
	}

	/**
	 * Accept only recognized category/severity classes.
	 *
	 * `type` is the exact class prefix (e.g. `doubles`, `queries_strict`), preserved
	 * alongside the broader `category` so the browser can look up the provider's own
	 * per-subtype color instead of a generic severity scale: the provider highlights
	 * "purple gradient" repeated words (`doubles1`..`doubles5`) very differently from a
	 * "red" over-concentrated connective (`top_and1`/`top_and2`) even though both are
	 * `frequency`, and `bb`/`slop` (both `style`) resolve to the same colors only because
	 * the provider's own stylesheet happens to reuse them across two different tabs.
	 *
	 * @param \DOMElement $element Provider element.
	 * @return array{category: string, type: string, level: int, classes: list<string>, xhint: bool, sentence: ?string, fragments: list<string>, stems: list<string>}|null
	 */
	private function mark_for_element( \DOMElement $element ): ?array {
		$class_names = (array) preg_split( '/\s+/', trim( $element->getAttribute( 'class' ) ) );
		if ( ! in_array( 'xhl', $class_names, true ) ) {
			return null;
		}

		$type_classes = self::typeClasses( $class_names );
		if ( null === $type_classes ) {
			return null;
		}

		$sentence  = null;
		$fragments = array();
		$stems     = array();
		foreach ( $class_names as $class_name ) {
			// The "Overall risk" report groups every span within one sentence under a shared
			// `xhint-<word offset>-<word count>` class, matching a key in that same report's
			// `XHints` script variable ({@see ReportSectionParser::parseSentenceProblems()}):
			// the browser needs this to resolve a hover anywhere in a highlighted sentence to
			// its own "problems in this sentence" breakdown.
			if ( null === $sentence && preg_match( '/^xhint-(\d+-\d+)$/', $class_name, $match ) ) {
				$sentence = $match[1];
			}
			// The provider wraps every word of a flagged sentence or phrase in a span of its
			// own and ties them together only through a shared `xhint-*`/`xhlln-*` class
			// (a word can sit in several overlapping fragments). Its report lights up every
			// span sharing any of these with the hovered one (bb-hl.js `showXHintProcess()`),
			// so the browser needs all of them to highlight the whole problem, not one word.
			if ( count( $fragments ) < self::MAX_CLASS_LIST && preg_match( '/^(?:xhint|xhlln)-\d+-\d+$/', $class_name ) && ! in_array( $class_name, $fragments, true ) ) {
				$fragments[] = $class_name;
			}
			// "Frequency" ties every occurrence of a repeated word to its row in the report's
			// word table through `stm-*` stem classes (bb-hl.js `higlightByStm()`).
			if ( count( $stems ) < self::MAX_CLASS_LIST && preg_match( self::STEM_PATTERN, $class_name ) && ! in_array( $class_name, $stems, true ) ) {
				$stems[] = $class_name;
			}
		}

		return array(
			'category'  => self::CATEGORIES[ $type_classes['type'] ],
			'type'      => $type_classes['type'],
			'level'     => $type_classes['level'],
			'classes'   => $type_classes['classes'],
			// The bare `xhint` class marks a span the provider underlines (bb/slop only).
			'xhint'     => in_array( 'xhint', $class_names, true ),
			'sentence'  => $sentence,
			'fragments' => $fragments,
			'stems'     => $stems,
		);
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
