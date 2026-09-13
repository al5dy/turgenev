<?php
/**
 * Ensure public version metadata is synchronized.
 */

$root = dirname( __DIR__ );
$plugin = file_get_contents( $root . '/turgenev.php' );
$readme = file_get_contents( $root . '/readme.txt' );
$package = json_decode( file_get_contents( $root . '/package.json' ), true, 512, JSON_THROW_ON_ERROR );

preg_match( '/^ \* Version:\s*([^\r\n]+)/m', $plugin, $plugin_match );
preg_match( "/define\( 'TURGENEV_VERSION', '([^']+)' \);/", $plugin, $constant_match );
preg_match( '/^Stable tag:\s*([^\r\n]+)/m', $readme, $stable_match );

$versions = array(
	'plugin header' => trim( $plugin_match[1] ?? '' ),
	'constant'      => trim( $constant_match[1] ?? '' ),
	'readme'        => trim( $stable_match[1] ?? '' ),
	'package.json'  => (string) ( $package['version'] ?? '' ),
);

$unique = array_unique( array_values( $versions ) );
if ( 1 !== count( $unique ) || '' === reset( $unique ) ) {
	fwrite( STDERR, 'Version mismatch: ' . json_encode( $versions, JSON_PRETTY_PRINT ) . PHP_EOL );
	exit( 1 );
}

echo 'Version metadata OK: ' . reset( $unique ) . PHP_EOL;
