<?php
/**
 * Deterministic allowlisted release archive; no recursive deletion or source JS.
 */

$root = dirname( __DIR__ );
if ( ! class_exists( ZipArchive::class ) ) {
	throw new RuntimeException( 'The ZIP extension is required to package a release.' );
}
$package = json_decode( file_get_contents( $root . '/package.json' ), true, 512, JSON_THROW_ON_ERROR );
$version = $package['version'] ?? '';
if ( ! preg_match( '/^\d+\.\d+\.\d+$/D', $version ) ) {
	throw new RuntimeException( 'Invalid release version.' );
}
$files = array( 'turgenev.php', 'uninstall.php', 'readme.txt', 'LICENSE' );
foreach ( array( 'src' => array( 'php' ), 'assets/build' => array( 'js', 'css' ), 'languages' => array( 'po', 'mo', 'pot', 'json' ) ) as $directory => $extensions ) {
	foreach ( new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $root . '/' . $directory, FilesystemIterator::SKIP_DOTS ) ) as $file ) {
		if ( $file->isLink() ) { throw new RuntimeException( 'Symlinks are forbidden in release inputs.' ); }
		if ( $file->isFile() && in_array( $file->getExtension(), $extensions, true ) ) {
			$files[] = substr( $file->getPathname(), strlen( $root ) + 1 );
		}
	}
}
sort( $files, SORT_STRING );
$dist = $root . '/dist';
if ( ! is_dir( $dist ) && ! mkdir( $dist, 0755 ) ) { throw new RuntimeException( 'Cannot create dist directory.' ); }
$temporary = tempnam( $dist, 'turgenev-stage-' );
$zip = new ZipArchive();
$target = $dist . '/turgenev-' . $version . '.zip';
try {
	if ( true !== $zip->open( $temporary, ZipArchive::OVERWRITE ) ) { throw new RuntimeException( 'Cannot open release archive.' ); }
	foreach ( $files as $file ) {
		$name = 'turgenev/' . $file;
		if ( ! $zip->addFile( $root . '/' . $file, $name ) ) { throw new RuntimeException( 'Cannot add release file.' ); }
		$zip->setMtimeName( $name, 315532800 );
		$zip->setExternalAttributesName( $name, ZipArchive::OPSYS_UNIX, 0100644 << 16 );
	}
	if ( ! $zip->close() ) { throw new RuntimeException( 'Cannot finalize release archive.' ); }
	if ( ! rename( $temporary, $target ) ) { throw new RuntimeException( 'Cannot publish local release archive.' ); }
	file_put_contents( $target . '.sha256', hash_file( 'sha256', $target ) . '  ' . basename( $target ) . PHP_EOL );
	echo $target . ' (' . count( $files ) . ' allowlisted files)' . PHP_EOL;
} finally {
	if ( is_file( $temporary ) ) { unlink( $temporary ); }
}
