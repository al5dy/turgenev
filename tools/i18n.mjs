// Regenerate languages/: turgenev.pot, turgenev-ru_RU.po/.mo and the ru_RU JSON files the
// browser scripts load. Needs WP-CLI (`wp`, or the WP_CLI environment variable).
//
// WP-CLI cannot read the minified bundles in assets/build (their `__` is renamed), so the
// browser strings are extracted from an unminified TypeScript emit written to the same
// assets/build/<name>.js paths: every reference, and therefore every JSON file name
// (md5 of that path), is exactly what wp_set_script_translations() looks up.
//
// New Russian interface translations are written into the PO by hand; the Russian of every
// `Turgenev report` msgid is the provider's own original, filled in by i18n-provider-po.php.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve( import.meta.dirname, '..' );
const wp = process.env.WP_CLI || 'wp';
const po = 'languages/turgenev-ru_RU.po';

function run( command, args ) {
	const result = spawnSync( command, args, { cwd: root, encoding: 'utf8' } );
	process.stdout.write( result.stdout || '' );
	process.stderr.write( result.stderr || '' );
	if ( result.status !== 0 ) {
		throw new Error( `${ command } ${ args.join( ' ' ) } failed (${ result.status ?? result.error })` );
	}
}

const scratch = mkdtempSync( join( tmpdir(), 'turgenev-i18n-' ) );
try {
	run( resolve( root, 'node_modules/.bin/tsc' ), [ '-p', 'tsconfig.json', '--noEmit', 'false', '--rootDir', 'resources/ts', '--outDir', join( scratch, 'assets/build' ), '--removeComments', 'false' ] );
	run( wp, [ 'i18n', 'make-pot', scratch, join( scratch, 'js.pot' ), '--domain=turgenev', '--skip-php', '--skip-block-json', '--skip-theme-json' ] );
	run( wp, [ 'i18n', 'make-pot', '.', 'languages/turgenev.pot', '--domain=turgenev', '--skip-js', '--include=turgenev.php,uninstall.php,src', '--merge=' + join( scratch, 'js.pot' ) ] );
} finally {
	rmSync( scratch, { recursive: true, force: true } );
}

run( wp, [ 'i18n', 'update-po', 'languages/turgenev.pot', po ] );
run( 'php', [ 'tools/i18n-provider-po.php', po ] );
run( wp, [ 'i18n', 'make-mo', po, 'languages' ] );
for ( const file of readdirSync( resolve( root, 'languages' ) ) ) {
	if ( /^turgenev-ru_RU-[0-9a-f]{32}\.json$/.test( file ) ) {
		rmSync( resolve( root, 'languages', file ) );
	}
}
run( wp, [ 'i18n', 'make-json', po, 'languages', '--no-purge', '--pretty-print' ] );

const untranslated = readFileSync( resolve( root, po ), 'utf8' )
	.split( /\n{2,}/ )
	.filter( ( block ) => /^msgid "./m.test( block ) && /^msgstr ""$/m.test( block ) && ! /^"/m.test( block.split( /^msgstr/m )[ 1 ] ) );
if ( untranslated.length ) {
	console.warn( `\n${ untranslated.length } untranslated entries in ${ po }; translate them and run this again:\n` );
	untranslated.forEach( ( block ) => console.warn( block.match( /^msgid .*$/m )[ 0 ] ) );
	process.exitCode = 1;
}
