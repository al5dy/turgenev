<?php
/**
 * Fill the Russian translation of every `Turgenev report` msgid with the provider's own
 * original: php tools/i18n-provider-po.php languages/turgenev-ru_RU.po
 *
 * Those msgids are English renderings of what Turgenev writes in Russian
 * (src/I18n/ReportGlossary.php, src/I18n/StyleHintGlossary.php), so their Russian
 * "translation" is never written by hand: it is the exact provider text they translate.
 * A Russian locale shows provider text verbatim and never looks them up; keeping them
 * filled keeps the translation complete and lets tests/php/provider-text.php verify it.
 */

define( 'ABSPATH', dirname( __DIR__ ) . '/' );

/**
 * The glossaries only need their msgids here.
 *
 * @param string $text    Msgid.
 * @param string $context Msgctxt.
 * @param string $domain  Text domain.
 */
function _x( string $text, string $context, string $domain = '' ): string {
	return $text;
}

require dirname( __DIR__ ) . '/src/I18n/ReportGlossary.php';
require dirname( __DIR__ ) . '/src/I18n/StyleHintGlossary.php';

use Al5dy\Turgenev\I18n\ReportGlossary;
use Al5dy\Turgenev\I18n\StyleHintGlossary;

const CONTEXT = 'Turgenev report';

$file = $argv[1] ?? '';
if ( ! is_file( $file ) ) {
	fwrite( STDERR, "Usage: php tools/i18n-provider-po.php <po file>\n" );
	exit( 2 );
}

$originals = array();
foreach ( ReportGlossary::entries() + StyleHintGlossary::entries() as $russian => $english ) {
	$originals[ $english ] = $russian;
}
foreach ( ReportGlossary::patterns() as [ $russian, $english ] ) {
	$originals[ $english ] = $russian;
}

/**
 * A single-line PO string literal, as WP-CLI writes them.
 *
 * @param string $keyword msgid/msgstr.
 * @param string $value   Unescaped value.
 */
function po_string( string $keyword, string $value ): string {
	return $keyword . ' "' . addcslashes( $value, "\\\"\n\t" ) . '"';
}

$blocks  = preg_split( '/\n{2,}/', rtrim( (string) file_get_contents( $file ), "\n" ) );
$filled  = 0;
$missing = array();
foreach ( $blocks as $index => $block ) {
	if ( ! preg_match( '/^msgctxt "' . preg_quote( CONTEXT, '/' ) . '"$/m', $block ) ) {
		continue;
	}
	if ( ! preg_match( '/^msgid ((?:"(?:[^"\\\\]|\\\\.)*"\n?)+)/m', $block, $msgid ) ) {
		continue;
	}
	preg_match_all( '/"((?:[^"\\\\]|\\\\.)*)"/', $msgid[1], $parts );
	$english = stripcslashes( implode( '', $parts[1] ) );
	if ( ! isset( $originals[ $english ] ) ) {
		$missing[] = $english;
		continue;
	}
	$head             = (string) preg_replace( '/^msgstr (?:"(?:[^"\\\\]|\\\\.)*"\n?)+\z/m', '', $block . "\n" );
	$blocks[ $index ] = rtrim( $head, "\n" ) . "\n" . po_string( 'msgstr', $originals[ $english ] );
	++$filled;
}

if ( $missing ) {
	fwrite( STDERR, "No provider original for these report msgids (stale POT?):\n  " . implode( "\n  ", $missing ) . "\n" );
	exit( 1 );
}

file_put_contents( $file, implode( "\n\n", $blocks ) . "\n" );
echo "Filled $filled provider-original translations in $file.\n";
