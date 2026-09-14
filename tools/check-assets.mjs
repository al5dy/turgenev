import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve( import.meta.dirname, '..' );
const sources = [
	...[ 'client', 'analysis', 'highlights', 'classic', 'editor', 'editor-content' ].map( name => [ 'src/js/' + name + '.js', 'assets/build/' + name + '.js' ] ),
	[ 'src/css/admin.css', 'assets/build/admin.css' ],
];
for ( const [ source, target ] of sources ) {
	const [ a, b ] = await Promise.all( [ source, target ].map( file => readFile( resolve( root, file ) ) ) );
	if ( ! a.equals( b ) ) throw new Error( 'Stale compiled asset: ' + target + '. Run npm run build.' );
}
for ( const file of await readdir( resolve( root, 'assets/build' ) ) ) {
	if ( ! sources.some( ( [ , target ] ) => target === 'assets/build/' + file ) ) throw new Error( 'Unexpected runtime asset: ' + file );
}
const catalogs = await readdir( resolve( root, 'languages' ) );
for ( const [ source, target ] of sources.filter( ( [ path ] ) => path.endsWith( '.js' ) ) ) {
	const sourceHash = createHash( 'md5' ).update( source ).digest( 'hex' );
	const targetHash = createHash( 'md5' ).update( target ).digest( 'hex' );
	for ( const name of catalogs.filter( file => file.endsWith( '-' + sourceHash + '.json' ) ) ) {
		const [ a, b ] = await Promise.all( [ name, name.replace( sourceHash, targetHash ) ].map( file => readFile( resolve( root, 'languages', file ) ) ) );
		if ( ! a.equals( b ) ) throw new Error( 'Stale compiled translation: ' + name );
	}
}
console.log( 'Runtime assets and translation mappings are synchronized.' );
