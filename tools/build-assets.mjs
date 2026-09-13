import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve( import.meta.dirname, '..' );
const output = resolve( root, 'assets/build' );
await mkdir( output, { recursive: true } );

const files = [
	[ 'src/js/client.js', 'assets/build/client.js' ],
	[ 'src/js/classic.js', 'assets/build/classic.js' ],
	[ 'src/js/editor.js', 'assets/build/editor.js' ],
	[ 'src/css/admin.css', 'assets/build/admin.css' ],
];

for ( const [ source, target ] of files ) {
	await copyFile( resolve( root, source ), resolve( root, target ) );
}

console.log( `Built ${ files.length } runtime assets.` );
