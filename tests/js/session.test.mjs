import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const scripts = await Promise.all( [ 'client', 'analysis' ].map( name => readFile( new URL( '../../src/js/' + name + '.js', import.meta.url ), 'utf8' ) ) );
const result = { risk: '3', level: 'low', link: 'risk12345', details: [] };
function fixture( configured = true ) {
	const requests = [];
	let source = { text: 'Original text', html: '<p>Original text</p>', key: 'original' };
	let state, cleared = 0, applied = 0;
	const sandbox = { URLSearchParams, console, window: { AbortController, TurgenevConfig: { ajaxUrl: '/api', nonce: 'nonce', postId: 42, isConfigured: configured }, fetch: ( url, options ) => new Promise( resolve => requests.push( { body: new URLSearchParams( options.body ), options, resolve } ) ) }, document: {}, wp: { i18n: { __: value => value } } };
	sandbox.window.wp = sandbox.wp;
	vm.createContext( sandbox );
	scripts.forEach( script => vm.runInContext( script, sandbox ) );
	const session = sandbox.window.TurgenevAnalysis.create( () => source, { clear: () => cleared++, dispose() {}, apply: () => { applied++; return { visible: 1, total: 1 }; } } );
	session.subscribe( value => { state = value; } );
	function respond( index, data, ok = true ) { requests[ index ].resolve( { ok, json: async () => ( { success: ok, data } ) } ); }
	return { session, requests, respond, client: sandbox.window.TurgenevClient, setSource: value => { source = value; }, get state() { return state; }, get applied() { return applied; }, get cleared() { return cleared; } };
}

test( 'decimal balances use exact string checks, never float thresholds', () => {
	const { client } = fixture();
	for ( const value of [ '0', '0.00', '-0.1', '-20' ] ) assert.equal( client.isEmptyBalance( value ), true, value );
	for ( const value of [ null, undefined, '', '0.0001', '100', '1e2', 'NaN' ] ) assert.equal( client.isEmptyBalance( value ), false, String( value ) );
} );
test( 'missing key and empty/oversize text never issue a paid request', async () => {
	const missing = fixture( false ); await missing.session.analyze(); assert.equal( missing.requests.length, 0 ); assert.match( missing.state.error, /Configure/ );
	const empty = fixture(); empty.setSource( { text: '', html: '', key: '' } ); await empty.session.analyze(); assert.equal( empty.requests.length, 0 );
	empty.setSource( { text: 'a'.repeat( 20001 ), html: '', key: 'large' } ); await empty.session.analyze(); assert.equal( empty.requests.length, 0 ); assert.match( empty.state.error, /longer/ );
} );
test( 'analyzes unsaved text with nonce and post ID, rejects duplicate clicks', async () => {
	const f = fixture(); const pending = f.session.analyze(); await f.session.analyze();
	assert.equal( f.requests.length, 1 ); assert.equal( f.requests[0].body.get( 'text' ), 'Original text' ); assert.equal( f.requests[0].body.get( 'post_id' ), '42' ); assert.equal( f.requests[0].body.get( 'nonce' ), 'nonce' );
	f.respond( 0, { result } ); await pending; assert.equal( f.state.result.level, 'low' ); assert.equal( f.state.busy, false );
} );
test( 'changing content cancels analysis and ignores a server that still replies', async () => {
	const f = fixture(); const pending = f.session.analyze();
	f.setSource( { text: 'Changed', html: '<p>Changed</p>', key: 'changed' } ); f.session.invalidate();
	assert.equal( f.requests[0].options.signal.aborted, true );
	f.respond( 0, { result } ); await pending; assert.equal( f.state.result, null ); assert.equal( f.state.busy, false );
} );
test( 'reset cancels highlights without discarding report; another highlight works', async () => {
	const f = fixture(); let pending = f.session.analyze(); f.respond( 0, { result } ); await pending;
	pending = f.session.highlight( 'style12345' ); f.session.reset();
	f.respond( 2, { highlights: {} } ); await pending; assert.equal( f.applied, 0 ); assert.ok( f.state.result );
	pending = f.session.highlight( 'style12345' ); f.respond( 3, { highlights: {} } ); await pending;
	assert.equal( f.applied, 1 ); f.session.reset(); assert.ok( f.state.result ); assert.equal( f.state.highlighted, false );
} );
test( 'switching category clears old decorations immediately and a failed response cannot retain them', async () => {
	const f = fixture(); let pending = f.session.analyze(); f.respond( 0, { result } ); await pending;
	pending = f.session.highlight( 'style12345' ); f.respond( 2, { highlights: {} } ); await pending;
	assert.equal( f.state.activeToken, 'style12345' );
	const cleared = f.cleared;
	pending = f.session.highlight( 'keywords12345' );
	assert.equal( f.cleared, cleared + 1 ); assert.equal( f.state.activeToken, null ); assert.equal( f.state.highlighted, false );
	f.respond( 3, { message: 'Provider unavailable' }, false ); await pending;
	assert.equal( f.state.highlighted, false ); assert.equal( f.state.activeToken, null ); assert.ok( f.state.result );
} );
test( 'highlight validation accepts dense reports and rejects malformed ranges and excessive payloads', () => {
	const { client } = fixture();
	const mark = { start: 0, end: 1, category: 'style', level: 2 };
	assert.equal( client.validHighlights( 'text', Array.from( { length: 700 }, () => ( { ...mark } ) ) ).length, 700 );
	for ( const invalid of [ null, {}, [ { ...mark, end: 5 } ], [ { ...mark, start: -1 } ], [ { ...mark, category: 'unknown' } ], [ { ...mark, level: 4 } ], Array( 20001 ).fill( mark ) ] ) {
		assert.throws( () => client.validHighlights( 'text', invalid ), /invalid highlight/ );
	}
} );
test( 'repeated editor fields keep their occurrence and ambiguous missing fields are not guessed', () => {
	const { client } = fixture();
	const aligned = client.alignTargets( 'word word', [ { text: 'word' }, { text: 'word' } ], 20 );
	assert.equal( JSON.stringify( aligned.map( target => target.offset ) ), '[20,25]' );
	assert.equal( client.alignTargets( 'word word', [ { text: 'word' } ] ).length, 0 );
	assert.equal( client.alignTargets( 'first missing last', [ { text: 'first' }, { text: 'editor control' }, { text: 'last' } ] )[ 1 ].offset, 14 );
} );
test( 'failure and malformed success restore buttons and never report success', async () => {
	for ( const data of [ {}, { result: {} }, { result: { ...result, risk: 'broken' } } ] ) {
		const f = fixture(); const pending = f.session.analyze(); f.respond( 0, data ); await pending;
		assert.equal( f.state.result, null ); assert.equal( f.state.busy, false ); assert.match( f.state.error, /incomplete/ );
	}
	const f = fixture(); const pending = f.session.analyze(); f.respond( 0, { message: 'Insufficient balance' }, false ); await pending;
	assert.equal( f.state.error, 'Insufficient balance' ); assert.equal( f.state.busy, false );
} );
test( 'document identity, not selection, controls invalidation', async () => {
	const f = fixture(); const pending = f.session.analyze(); f.respond( 0, { result } ); await pending;
	f.session.invalidate(); assert.ok( f.state.result );
	f.setSource( { text: 'Original text', html: '<strong>Original text</strong>', key: 'formatting changed' } ); f.session.invalidate();
	assert.equal( f.state.result, null ); assert.match( f.state.notice, /Content changed/ );
} );
test( 'explicit HTML mode removes Gutenberg comments without mutating source', async () => {
	const f = fixture(); f.setSource( { text: 'Text', html: '<!-- wp:paragraph --><p>Text</p><!-- /wp:paragraph -->', key: 'html' } ); f.session.setHtmlMode( true );
	const pending = f.session.analyze(); assert.equal( f.requests[0].body.get( 'text' ), '<p>Text</p>' ); f.respond( 0, { result } ); await pending;
} );
test( 'disposing a session aborts pending work and drops late responses', async () => {
	const f = fixture(); const pending = f.session.analyze(); f.session.dispose(); assert.equal( f.requests[0].options.signal.aborted, true );
	f.respond( 0, { result } ); await pending; assert.equal( f.state.result, null ); assert.equal( f.requests.length, 1 );
} );
