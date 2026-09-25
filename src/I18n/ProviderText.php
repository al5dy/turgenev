<?php
/**
 * Locale-aware presentation of the provider's own (Russian) report text.
 *
 * @package Turgenev
 */

namespace Al5dy\Turgenev\I18n;

use Al5dy\Turgenev\Api\ReportHighlightParser;

defined( 'ABSPATH' ) || exit;

/**
 * Shows provider text exactly as the provider wrote it on a Russian locale, and in English
 * everywhere else.
 *
 * Turgenev only ever answers in Russian. Its fixed report vocabulary (verdicts,
 * characteristic names and explainers, legends, problem lists) is translated through
 * {@see ReportGlossary}; its open-ended Style explainers through {@see StyleHintGlossary},
 * which can never be complete, so a caller can tell an unknown text apart
 * ({@see translation()}) and label it instead. Every English string is a gettext msgid,
 * so other locales can translate it further; a Russian locale never reaches them.
 */
final class ProviderText {
	/**
	 * The help-wiki article every Style explainer's own "more" link points to.
	 */
	private const HINT_ARTICLE = 'oshibki_kopirajterov';

	/**
	 * Locale forced by the caller; null resolves the request's own when first needed.
	 *
	 * @var string|null
	 */
	private ?string $locale;

	/**
	 * Normalized provider text => its translation for the current locale, built on first use.
	 *
	 * @var array<string, string>|null
	 */
	private ?array $entries = null;

	/**
	 * Bind a locale.
	 *
	 * @param string|null $locale Forced locale; null follows `determine_locale()`, which is
	 *                            the user's own locale in wp-admin and admin-ajax.php.
	 */
	public function __construct( ?string $locale = null ) {
		$this->locale = $locale;
	}

	/**
	 * Whether provider text is shown untouched: on a Russian locale, and only there.
	 *
	 * `rue` (Rusyn) is a different language that merely shares the prefix.
	 */
	public function isVerbatim(): bool {
		$locale = $this->locale ?? determine_locale();

		return 'ru' === $locale || str_starts_with( $locale, 'ru_' );
	}

	/**
	 * Provider text as it should be displayed: verbatim on a Russian locale, translated
	 * elsewhere when a translation is known, and otherwise as the provider wrote it.
	 *
	 * @param string $text Provider text.
	 * @return string
	 */
	public function text( string $text ): string {
		return $this->translation( $text ) ?? $text;
	}

	/**
	 * The translation of one provider text.
	 *
	 * @param string $text Provider text.
	 * @return string|null Null on a Russian locale, and for a text no glossary knows.
	 */
	public function translation( string $text ): ?string {
		if ( $this->isVerbatim() ) {
			return null;
		}

		$key     = self::normalize( $text );
		$entries = $this->entries();
		if ( isset( $entries[ $key ] ) ) {
			return $entries[ $key ];
		}

		foreach ( ReportGlossary::patterns() as [ $provider, $format ] ) {
			$pattern = '/^' . str_replace( '%s', '(.+)', preg_quote( $provider, '/' ) ) . '$/su';
			if ( 1 === preg_match( $pattern, $key, $match ) ) {
				return sprintf( $format, $match[1] );
			}
		}

		return null;
	}

	/**
	 * English heading for a Style explainer no glossary knows, so a reader of another
	 * language still learns what kind of problem it describes: the help-wiki section its own
	 * "more" link names, or the general "style problems" section when it names none (or one
	 * this plugin does not know).
	 *
	 * @param string $page Help article from the explainer's own link (empty means the default one).
	 * @param string $anchor Section anchor, with or without its leading `#`; empty without a link.
	 * @return string|null Null on a Russian locale, where provider text is never added to.
	 */
	public function category( string $page = '', string $anchor = '' ): ?string {
		if ( $this->isVerbatim() ) {
			return null;
		}

		$categories = ReportGlossary::categories();
		$section    = in_array( $page, array( '', self::HINT_ARTICLE ), true ) ? ltrim( $anchor, '#' ) : '';

		return ( $categories[ $section ] ?? $categories['style'] )[1];
	}

	/**
	 * One whitespace convention for glossary keys and the text they are looked up for.
	 *
	 * @param string $text Provider text.
	 * @return string
	 */
	public static function normalize( string $text ): string {
		return trim( (string) preg_replace( ReportHighlightParser::WHITESPACE, ' ', $text ) );
	}

	/**
	 * Every known provider text with its translation.
	 *
	 * @return array<string, string>
	 */
	private function entries(): array {
		if ( null === $this->entries ) {
			$entries = array();
			foreach ( array( ReportGlossary::entries(), StyleHintGlossary::entries() ) as $glossary ) {
				foreach ( $glossary as $russian => $translation ) {
					$entries[ self::normalize( $russian ) ] = $translation;
				}
			}
			$this->entries = $entries;
		}

		return $this->entries;
	}
}
