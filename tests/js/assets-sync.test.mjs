import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve( import.meta.dirname, '../..' );

const sources = [
	...[ 'client', 'content-reset', 'analysis', 'highlights', 'classic', 'editor', 'editor-content' ].map(
		( name ) => [ 'src/js/' + name + '.js', 'assets/build/' + name + '.js' ]
	),
	[ 'src/css/admin.css', 'assets/build/admin.css' ],
];

test( 'every runtime asset exists and is byte-for-byte identical to its source', async () => {
	for ( const [ source, target ] of sources ) {
		let targetContents;
		try {
			targetContents = await readFile( resolve( root, target ) );
		} catch {
			assert.fail( `Missing runtime asset: ${ target }. Run npm run build.` );
		}
		const sourceContents = await readFile( resolve( root, source ) );
		assert.ok(
			sourceContents.equals( targetContents ),
			`Stale compiled asset: ${ target }. Run npm run build.`
		);
	}
} );

test( 'assets/build contains no runtime assets that source no longer produces', async () => {
	const files = await readdir( resolve( root, 'assets/build' ) );
	for ( const file of files ) {
		assert.ok(
			sources.some( ( [ , target ] ) => target === 'assets/build/' + file ),
			`Unexpected runtime asset: ${ file }`
		);
	}
} );

test( 'translation catalogs mapped to runtime asset hashes are synchronized', async () => {
	const catalogs = await readdir( resolve( root, 'languages' ) );
	for ( const [ source, target ] of sources.filter( ( [ path ] ) => path.endsWith( '.js' ) ) ) {
		const sourceHash = createHash( 'md5' ).update( source ).digest( 'hex' );
		const targetHash = createHash( 'md5' ).update( target ).digest( 'hex' );
		for ( const name of catalogs.filter( ( file ) => file.endsWith( '-' + sourceHash + '.json' ) ) ) {
			const [ a, b ] = await Promise.all(
				[ name, name.replace( sourceHash, targetHash ) ].map( ( file ) =>
					readFile( resolve( root, 'languages', file ) )
				)
			);
			assert.ok( a.equals( b ), `Stale compiled translation: ${ name.replace( sourceHash, targetHash ) }` );
		}
	}
} );
