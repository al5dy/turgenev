import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve( import.meta.dirname, '..' );
const output = resolve( root, 'assets/build' );
await mkdir( output, { recursive: true } );

const files = [
	[ 'src/js/client.js', 'assets/build/client.js' ],
	[ 'src/js/classic.js', 'assets/build/classic.js' ],
	[ 'src/js/editor.js', 'assets/build/editor.js' ],
	[ 'src/js/editor-content.js', 'assets/build/editor-content.js' ],
	[ 'src/css/admin.css', 'assets/build/admin.css' ],
];

for ( const [ source, target ] of files ) {
	await copyFile( resolve( root, source ), resolve( root, target ) );
}

// WordPress resolves translation hashes from the enqueued asset path, not src/js.
const languages = resolve( root, 'languages' );
const catalogs = await readdir( languages );
for ( const [ source, target ] of files.filter( ( [ path ] ) => path.endsWith( '.js' ) ) ) {
	const sourceHash = createHash( 'md5' ).update( source ).digest( 'hex' );
	const targetHash = createHash( 'md5' ).update( target ).digest( 'hex' );
	for ( const catalog of catalogs.filter( ( name ) => name.endsWith( `-${ sourceHash }.json` ) ) ) {
		await copyFile( resolve( languages, catalog ), resolve( languages, catalog.replace( sourceHash, targetHash ) ) );
	}
}

console.log( `Built ${ files.length } runtime assets.` );
