import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve( import.meta.dirname, '..' );
const source = resolve( root, 'resources/images' );
const target = resolve( root, 'assets/images' );

await rm( target, { recursive: true, force: true } );

const files = ( await readdir( source ) ).filter(
	( name ) => name !== '.gitkeep'
);

if ( ! files.length ) {
	console.log( 'No images in resources/images, skipping copy.' );
	process.exit( 0 );
}

await mkdir( target, { recursive: true } );
for ( const file of files ) {
	await copyFile( resolve( source, file ), resolve( target, file ) );
}

console.log( `Copied ${ files.length } image(s) from resources/images to assets/images.` );
