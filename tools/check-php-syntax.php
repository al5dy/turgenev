<?php
/**
 * Dependency-free PHP syntax check.
 */

$root = dirname( __DIR__ );
$iterator = new RecursiveIteratorIterator(
	new RecursiveCallbackFilterIterator(
		new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ),
		static function ( SplFileInfo $file ): bool {
			if ( $file->isDir() && in_array( $file->getFilename(), array( 'vendor', 'node_modules' ), true ) ) {
				return false;
			}
			return true;
		}
	)
);

$files = array();
foreach ( $iterator as $file ) {
	if ( $file instanceof SplFileInfo && $file->isFile() && 'php' === strtolower( $file->getExtension() ) ) {
		$files[] = $file->getPathname();
	}
}

sort( $files );
foreach ( $files as $file ) {
	$command = escapeshellarg( PHP_BINARY ) . ' -l ' . escapeshellarg( $file );
	exec( $command, $output, $status );
	if ( 0 !== $status ) {
		fwrite( STDERR, implode( PHP_EOL, $output ) . PHP_EOL );
		exit( $status );
	}
}

echo 'PHP syntax OK (' . count( $files ) . ' files).' . PHP_EOL;
