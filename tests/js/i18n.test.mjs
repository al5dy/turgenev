import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve( import.meta.dirname, '../..' );
const source = ( file ) => readFile( resolve( root, file ), 'utf8' );
const REPORT_CONTEXT = 'Turgenev report';

function unescape( literal, quote ) {
	return literal.replace( /\\(.)/g, ( _, character ) => ( { n: '\n', t: '\t' }[ character ] ?? ( character === quote || character === '\\' ? character : '\\' + character ) ) );
}

/** Translated entries of a PO/POT file, keyed "context\u0004msgid" or "msgid". */
function poEntries( text ) {
	const entries = new Map();
	for ( const block of text.split( /\n{2,}/ ) ) {
		const field = ( name ) => {
			const match = block.match( new RegExp( `^${ name } ((?:"(?:[^"\\\\]|\\\\.)*"\\n?)+)`, 'm' ) );
			return match ? [ ...match[ 1 ].matchAll( /"((?:[^"\\]|\\.)*)"/g ) ].map( ( part ) => unescape( part[ 1 ], '"' ) ).join( '' ) : null;
		};
		const msgid = field( 'msgid' );
		if ( msgid ) {
			const context = field( 'msgctxt' );
			entries.set( ( context === null ? '' : context + '\u0004' ) + msgid, field( 'msgstr' ) ?? '' );
		}
	}
	return entries;
}

/** Every literal gettext call in a source file: { key, msgid, context }. */
function calls( text ) {
	const string = `'((?:[^'\\\\]|\\\\.)*)'`;
	const found = [];
	for ( const match of text.matchAll( new RegExp( `\\b(?:__|_e|esc_html__|esc_html_e|esc_attr__|esc_attr_e)\\(\\s*${ string }\\s*,\\s*'turgenev'`, 'g' ) ) ) {
		found.push( { msgid: unescape( match[ 1 ], "'" ), context: null } );
	}
	for ( const match of text.matchAll( new RegExp( `\\b_x\\(\\s*${ string }\\s*,\\s*${ string }\\s*,\\s*'turgenev'`, 'g' ) ) ) {
		found.push( { msgid: unescape( match[ 1 ], "'" ), context: unescape( match[ 2 ], "'" ) } );
	}
	return found.map( ( call ) => ( { ...call, key: ( call.context === null ? '' : call.context + '\u0004' ) + call.msgid } ) );
}

const pot = poEntries( await source( 'languages/turgenev.pot' ) );
const po = poEntries( await source( 'languages/turgenev-ru_RU.po' ) );
const phpFiles = [ 'turgenev.php', ...( await readdir( resolve( root, 'src' ), { recursive: true } ) ).filter( ( file ) => file.endsWith( '.php' ) ).map( ( file ) => 'src/' + file ) ];
const tsFiles = ( await readdir( resolve( root, 'resources/ts' ) ) ).filter( ( file ) => file.endsWith( '.ts' ) && ! file.endsWith( '.d.ts' ) );

test( 'the plugin is written in English: no interface msgid contains Russian', async () => {
	for ( const file of [ ...phpFiles, ...tsFiles.map( ( file ) => 'resources/ts/' + file ) ] ) {
		for ( const call of calls( await source( file ) ) ) {
			if ( call.context !== REPORT_CONTEXT ) {
				assert.doesNotMatch( call.msgid, /\p{Script=Cyrillic}/u, `${ file }: "${ call.msgid }"` );
			}
		}
	}
} );

test( 'every PHP string is in the POT and translated into Russian', async () => {
	let checked = 0;
	for ( const file of phpFiles ) {
		for ( const call of calls( await source( file ) ) ) {
			assert.ok( pot.has( call.key ), `${ file }: "${ call.msgid }" is missing from turgenev.pot (run npm run i18n)` );
			assert.ok( po.get( call.key ), `${ file }: "${ call.msgid }" has no ru_RU translation` );
			checked++;
		}
	}
	assert.ok( checked > 400, 'the report glossaries are extracted too' );
} );

test( 'every browser string is in the POT, translated, and shipped in the JSON file its script loads', async () => {
	for ( const file of tsFiles ) {
		const found = calls( await source( 'resources/ts/' + file ) );
		const script = 'assets/' + file.replace( /\.ts$/, '.js' );
		if ( ! found.length ) {
			continue;
		}
		// wp_set_script_translations() looks up "<domain>-<locale>-<md5 of the script path>.json".
		const hash = createHash( 'md5' ).update( script ).digest( 'hex' );
		const json = JSON.parse( await source( `languages/turgenev-ru_RU-${ hash }.json` ) );
		const messages = json.locale_data.messages;
		assert.equal( json.source, script );
		assert.equal( messages[ '' ].lang, 'ru_RU', `${ script }: the JSON must declare its own locale` );
		assert.match( messages[ '' ][ 'plural-forms' ], /^nplurals=3;/, `${ script }: Russian plural forms` );
		for ( const call of found ) {
			assert.ok( pot.has( call.key ), `${ file }: "${ call.msgid }" is missing from turgenev.pot (run npm run i18n)` );
			assert.ok( po.get( call.key ), `${ file }: "${ call.msgid }" has no ru_RU translation` );
			assert.equal( messages[ call.msgid ]?.[ 0 ], po.get( call.key ), `${ script }: "${ call.msgid }" is missing or stale in its JSON file` );
		}
	}
} );

test( 'every browser string ships as an i18n.__() call that WordPress.org can extract', async () => {
	// translate.wordpress.org reads translatable strings out of the shipped, minified
	// scripts. The minifier renames a destructured `__`, which hides its strings from there;
	// a property call such as `i18n.__()` keeps its name.
	for ( const file of tsFiles ) {
		const found = calls( await source( 'resources/ts/' + file ) );
		if ( ! found.length ) {
			continue;
		}
		const script = 'assets/' + file.replace( /\.ts$/, '.js' );
		const bundle = await source( script );
		const shipped = new Set(
			[ ...bundle.matchAll( /\.__\(\s*("(?:[^"\\]|\\.)*")\s*,\s*"turgenev"\s*\)/g ) ].map( ( match ) => JSON.parse( match[ 1 ] ) )
		);
		for ( const call of found ) {
			assert.ok( shipped.has( call.msgid ), `${ script }: "${ call.msgid }" is not an i18n.__() call in the shipped bundle` );
		}
	}
} );

test( 'the POT and the Russian PO list exactly the same strings, all translated', () => {
	assert.deepEqual( [ ...po.keys() ].sort(), [ ...pot.keys() ].sort() );
	for ( const [ key, translation ] of po ) {
		assert.ok( translation, `untranslated: ${ key }` );
	}
} );

test( 'a printf placeholder survives translation', () => {
	for ( const [ key, translation ] of po ) {
		const placeholders = ( text ) => ( text.match( /%(?:\d+\$)?[sd]/g ) ?? [] ).sort().join( ' ' );
		assert.equal( placeholders( translation ), placeholders( key.split( '\u0004' ).pop() ), key );
	}
} );
