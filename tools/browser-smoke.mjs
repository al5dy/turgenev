// Reproducible CLI-driven browser tests; fixtures replace the provider, never editor APIs.
import { spawn } from 'node:child_process';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import net from 'node:net';

const root = resolve( import.meta.dirname, '..' );
const session = 'turgenev-smoke-' + process.pid;
const cli = resolve( root, 'node_modules/.bin/playwright-cli' );
const portProbe = net.createServer();
await new Promise( resolveReady => portProbe.listen( 0, '127.0.0.1', resolveReady ) );
const port = portProbe.address().port;
await new Promise( resolveClosed => portProbe.close( resolveClosed ) );
const base = 'http://127.0.0.1:' + port;
await mkdir( resolve( root, 'output/playwright' ), { recursive: true } );

function command( args ) {
	return new Promise( ( resolveDone, reject ) => {
		const child = spawn( cli, [ '--session', session, ...args ], { cwd: root, stdio: [ 'ignore', 'pipe', 'pipe' ] } );
		let output = '';
		child.stdout.on( 'data', data => { output += data; } );
		child.stderr.on( 'data', data => { output += data; } );
		child.on( 'error', reject );
		child.on( 'exit', code => {
			if ( code || /### Error/.test( output ) ) reject( new Error( output.slice( -3500 ) ) );
			else resolveDone( output );
		} );
	} );
}
const server = spawn( process.execPath, [ 'tests/browser/serve.mjs' ], { cwd: root, env: { ...process.env, TURGENEV_TEST_PORT: String( port ) }, stdio: [ 'ignore', 'pipe', 'pipe' ] } );
try {
	await new Promise( ( resolveReady, reject ) => {
		const timeout = setTimeout( () => reject( new Error( 'Harness startup timed out. Set WP_TEST_ROOT to a WordPress installation.' ) ), 10000 );
		server.once( 'error', reject );
		server.once( 'exit', () => { clearTimeout( timeout ); reject( new Error( 'Harness failed. Set WP_TEST_ROOT to a WordPress installation.' ) ); } );
		server.stdout.on( 'data', () => { clearTimeout( timeout ); resolveReady(); } );
		server.stderr.on( 'data', data => process.stderr.write( data ) );
	} );
	await command( [ 'open', base ] );
	for ( const [ file, results, expected ] of [ [ 'highlight-flow.js', 'smokeResults', 7 ], [ 'classic-flow.js', 'classicSmokeResults', 6 ], [ 'mapping-flow.js', 'mappingSmokeResults', 5 ], [ 'saved-post-flow.js', 'savedPostSmokeResults', 4 ] ] ) {
		const flow = ( await readFile( resolve( root, 'tests/browser', file ), 'utf8' ) ).replaceAll( 'http://127.0.0.1:8897', base );
		await command( [ 'run-code', flow ] );
		const summary = await command( [ 'eval', '() => window.' + results + '?.length' ] );
		if ( ! summary.includes( '### Result\n' + expected ) ) throw new Error( 'Browser assertions did not finish: ' + file );
		console.log( file + ': ' + expected + ' scenario groups passed.' );
	}
} finally {
	await command( [ 'close' ] ).catch( () => {} );
	server.kill();
}
