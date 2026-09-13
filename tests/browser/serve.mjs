// Local smoke harness: actual WordPress packages, no database, login or paid requests.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
const wordpress = resolve( process.env.WP_TEST_ROOT || resolve( root, '../../..' ) );
const packages = JSON.parse( execFileSync( 'php', [ '-r', 'echo json_encode(require $argv[1]);', `${ wordpress }/wp-includes/assets/script-loader-packages.php` ], { encoding: 'utf8' } ) );
const vendors = { react: 'vendor/react.min.js', 'react-dom': 'vendor/react-dom.min.js', 'react-jsx-runtime': 'vendor/react-jsx-runtime.min.js', moment: 'vendor/moment.min.js', lodash: 'vendor/lodash.min.js', 'wp-polyfill': 'vendor/wp-polyfill.min.js' };
const files = [];
const visited = new Set();
function include( handle ) {
	if ( visited.has( handle ) ) return;
	visited.add( handle );
	if ( vendors[ handle ] ) { files.push( vendors[ handle ] ); return; }
	const name = handle.replace( /^wp-/, '' );
	const entry = packages[ `${ name }.js` ];
	if ( ! entry ) throw new Error( `Unresolved WordPress script: ${ handle }` );
	entry.dependencies.forEach( include );
	files.push( `${ name }.min.js` );
}
[ 'wp-block-library', 'wp-format-library' ].forEach( include );
const routes = new Map( files.map( ( file, index ) => [ `/core/${ index }.js`, `${ wordpress }/wp-includes/js/dist/${ file }` ] ) );
for ( const file of [ 'client.js', 'editor-content.js', 'editor.js', 'admin.css' ] ) routes.set( `/plugin/${ file }`, `${ root }/assets/build/${ file }` );
for ( const file of [ 'components', 'block-editor', 'block-library' ] ) routes.set( `/core/${ file }.css`, `${ wordpress }/wp-includes/css/dist/${ file }/style.css` );
routes.set( '/harness.js', `${ root }/tests/browser/editor-harness.js` );
routes.set( '/latex.js', `${ wordpress }/wp-includes/js/dist/script-modules/latex-to-mathml/index.min.js` );
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Turgenev Gutenberg smoke</title>
<script type="importmap">{"imports":{"@wordpress/latex-to-mathml":"/latex.js"}}</script>
${ [ 'components', 'block-editor', 'block-library' ].map( ( name ) => `<link rel="stylesheet" href="/core/${ name }.css">` ).join( '' ) }
<link rel="stylesheet" href="/plugin/admin.css"><body><div id="editor"></div>
${ files.map( ( _, index ) => `<script src="/core/${ index }.js"></script>` ).join( '' ) }
<script>window.TurgenevConfig={ajaxUrl:'/analysis',nonce:'smoke-nonce',reportBaseUrl:'https://turgenev.ashmanov.com/?t=',isConfigured:true,maxTextLength:20000};</script>
<script src="/plugin/client.js"></script><script src="/plugin/editor-content.js"></script><script src="/plugin/editor.js"></script><script src="/harness.js"></script></body></html>`;
http.createServer( async ( request, response ) => {
	if ( request.url.startsWith( '/wp/v2/types' ) ) { response.setHeader( 'Content-Type', 'application/json' ); response.end( '{}' ); return; }
	if ( request.url === '/favicon.ico' ) { response.writeHead( 204 ); response.end(); return; }
	if ( request.url === '/' ) { response.setHeader( 'Content-Type', 'text/html; charset=utf-8' ); response.end( html ); return; }
	const path = routes.get( request.url );
	if ( ! path ) { response.writeHead( 404 ); response.end(); return; }
	try {
		response.setHeader( 'Content-Type', path.endsWith( '.css' ) ? 'text/css' : 'text/javascript' );
		response.end( await readFile( path ) );
	} catch { response.writeHead( 404 ); response.end(); }
} ).listen( 8897, '127.0.0.1', () => console.log( 'Gutenberg harness: http://127.0.0.1:8897' ) );
