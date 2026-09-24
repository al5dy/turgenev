import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const scripts = await Promise.all( [ 'client', 'analysis' ].map( name => readFile( new URL( '../../assets/build/' + name + '.js', import.meta.url ), 'utf8' ) ) );
const result = { risk: '3', level: 'low', link: 'risk12345', details: [] };
function fixture( configured = true, highlightsAvailable = true ) {
	const requests = [];
	let source = { text: 'Original text', html: '<p>Original text</p>', key: 'original' };
	let state, cleared = 0, applied = 0, counts = { visible: 1, total: 1 }, onHover = null;
	const sandbox = { URLSearchParams, console, window: { AbortController, TurgenevConfig: { ajaxUrl: '/api', nonce: 'nonce', postId: 42, isConfigured: configured, highlightsAvailable }, fetch: ( url, options ) => new Promise( resolve => requests.push( { body: new URLSearchParams( options.body ), options, resolve } ) ) }, document: {}, wp: { i18n: { __: value => value } } };
	sandbox.window.wp = sandbox.wp;
	vm.createContext( sandbox );
	scripts.forEach( script => vm.runInContext( script, sandbox ) );
	const session = sandbox.window.TurgenevAnalysis.create( () => source, { clear: () => cleared++, dispose() {}, apply: ( _source, _data, hover ) => { applied++; onHover = hover ?? null; return counts; } } );
	session.subscribe( value => { state = value; } );
	function respond( index, data, ok = true ) { requests[ index ].resolve( { ok, json: async () => ( { success: ok, data } ) } ); }
	return { session, requests, respond, client: sandbox.window.TurgenevClient, setCounts: value => { counts = value; }, setSource: value => { source = value; }, get state() { return state; }, hover: value => onHover( value ), get applied() { return applied; }, get cleared() { return cleared; } };
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
test( 'a known-empty balance blocks analysis with a top-up message, without spending a paid request', async () => {
	const f = fixture();
	const balancePending = f.session.balance();
	f.respond( 0, { balance: '0' } );
	await balancePending;
	assert.equal( f.state.balance, '0' );

	await f.session.analyze();
	assert.equal( f.requests.length, 1, 'no risk request is issued once the balance is known to be empty' );
	assert.match( f.state.error, /balance is empty/i );

	// A balance that has not been fetched yet (still null) must never block analysis:
	// only a balance confirmed to be zero/negative does.
	const unknown = fixture();
	const pending = unknown.session.analyze();
	assert.equal( unknown.state.balance, null );
	unknown.respond( 0, { result } );
	await pending;
	assert.equal( unknown.state.result.level, 'low' );
} );
test( 'unresolved document dependencies prevent partial paid analysis', async () => {
	const f = fixture();
	f.setSource( { text: 'Only a partial body', html: '<p>Only a partial body</p>', key: 'incomplete', error: 'A synced pattern is unavailable.' } );
	await f.session.analyze();
	assert.equal( f.requests.length, 0 );
	assert.equal( f.state.error, 'A synced pattern is unavailable.' );
} );
test( 'analyzes unsaved text with nonce and post ID, rejects duplicate clicks', async () => {
	const f = fixture(); const pending = f.session.analyze();
	assert.equal( f.state.analyzing, true, 'the loader starts as soon as the click fires' );
	await f.session.analyze();
	assert.equal( f.requests.length, 1 ); assert.equal( f.requests[0].body.get( 'text' ), 'Original text' ); assert.equal( f.requests[0].body.get( 'post_id' ), '42' ); assert.equal( f.requests[0].body.get( 'nonce' ), 'nonce' );
	f.respond( 0, { result } ); await pending; assert.equal( f.state.result.level, 'low' ); assert.equal( f.state.busy, false );
} );
test( 'a successful analysis never auto-opens a section when highlighting is unavailable (no ext-dom)', async () => {
	const f = fixture( true, false );
	const pending = f.session.analyze();
	f.respond( 0, { result } );
	await pending;
	assert.equal( f.state.openSection, null );
	assert.equal( f.requests.length, 2, 'only risk and the auto balance refresh, no highlights/details fetch' );
	assert.equal( f.state.analyzing, false, 'nothing further will auto-load, so the loader must not stay up' );
} );
test( 'changing content cancels analysis and ignores a server that still replies', async () => {
	const f = fixture(); const pending = f.session.analyze();
	f.setSource( { text: 'Changed', html: '<p>Changed</p>', key: 'changed' } ); f.session.invalidate();
	assert.equal( f.requests[0].options.signal.aborted, true );
	f.respond( 0, { result } ); await pending; assert.equal( f.state.result, null ); assert.equal( f.state.busy, false );
} );
test( 'reset cancels highlights without discarding report; another highlight works', async () => {
	// analyze() now auto-opens "overall" (requests 1: balance, 2: its highlight, 3: its
	// details), so a test-driven highlight() lands at request 4, then 5.
	const f = fixture(); let pending = f.session.analyze(); f.respond( 0, { result } ); await pending;
	pending = f.session.highlight( 'style12345' ); f.session.reset();
	f.respond( 4, { highlights: {} } ); await pending; assert.equal( f.applied, 0 ); assert.ok( f.state.result );
	pending = f.session.highlight( 'style12345' ); f.respond( 5, { highlights: {} } ); await pending;
	assert.equal( f.applied, 1 ); f.session.reset(); assert.ok( f.state.result ); assert.equal( f.state.highlighted, false );
} );
test( 'switching category clears old decorations immediately and a failed response cannot retain them', async () => {
	const f = fixture(); let pending = f.session.analyze(); f.respond( 0, { result } ); await pending;
	pending = f.session.highlight( 'style12345' ); f.respond( 4, { highlights: {} } ); await pending;
	assert.equal( f.state.activeToken, 'style12345' );
	const cleared = f.cleared;
	pending = f.session.highlight( 'keywords12345' );
	assert.equal( f.cleared, cleared + 1 ); assert.equal( f.state.activeToken, null ); assert.equal( f.state.highlighted, false );
	f.respond( 5, { message: 'Provider unavailable' }, false ); await pending;
	assert.equal( f.state.highlighted, false ); assert.equal( f.state.activeToken, null ); assert.ok( f.state.result );
} );
test( 'unrendered fragments get a local fallback that resets and is replaced with the selected category', async () => {
	const f = fixture(); let pending = f.session.analyze(); f.respond( 0, { result } ); await pending;
	const highlights = { text: 'Original text', marks: [ { start: 0, end: 8, category: 'style', level: 2 } ] };
	f.setCounts( { visible: 0, total: 1 } );
	pending = f.session.highlight( 'style12345' ); f.respond( 4, { highlights } ); await pending;
	assert.equal( f.state.error, '' ); assert.equal( f.state.highlighted, true ); assert.equal( f.state.highlightFallback, highlights );
	f.session.reset(); assert.equal( f.state.highlightFallback, null );
	f.setCounts( { visible: 1, total: 1 } );
	pending = f.session.highlight( 'frequency12345' ); f.respond( 5, { highlights } ); await pending;
	assert.equal( f.state.highlightFallback, null ); assert.equal( f.state.activeToken, 'frequency12345' );
} );
test( 'highlight validation accepts dense reports and rejects malformed ranges and excessive payloads', () => {
	const { client } = fixture();
	const mark = { start: 0, end: 1, category: 'style', type: 'slop', level: 2, sentence: null };
	assert.equal( client.validHighlights( 'text', Array.from( { length: 700 }, () => ( { ...mark } ) ) ).length, 700 );
	// Only the "Overall risk" report's own marks ever carry a real sentence id.
	assert.equal( client.validHighlights( 'text', [ { ...mark, sentence: '107-33' } ] ).length, 1 );
	// Provider fragment ids tie one sentence's or phrase's per-word marks together.
	for ( const fragments of [ [], [ 'xhint-0-19' ], [ 'xhlln-24-6', 'xhlln-24-3' ], Array( 8 ).fill( 'xhint-1-1' ) ] ) {
		assert.equal( client.validHighlights( 'text', [ { ...mark, fragments } ] ).length, 1 );
	}
	for ( const invalid of [
		null,
		{},
		[ { ...mark, end: 5 } ],
		[ { ...mark, start: -1 } ],
		[ { ...mark, category: 'unknown' } ],
		[ { ...mark, type: 'unknown' } ], // not one of ReportHighlightParser::CATEGORIES' keys
		[ { ...mark, level: 0 } ],
		[ { ...mark, level: 10 } ],
		[ { ...mark, sentence: 'not-an-id' } ],
		[ { ...mark, sentence: 107 } ],
		[ { ...mark, fragments: 'xhint-0-19' } ],
		[ { ...mark, fragments: null } ],
		[ { ...mark, fragments: [ '0-19' ] } ], // the sentence id shape, not a provider class
		[ { ...mark, fragments: [ 'stm-6-190E7' ] } ],
		[ { ...mark, fragments: [ 'xhint-0-19 xhint-1-1' ] } ],
		[ { ...mark, fragments: [ 42 ] } ],
		[ { ...mark, fragments: Array( 9 ).fill( 'xhint-1-1' ) } ],
		Array( 20001 ).fill( mark ),
	] ) {
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
		assert.equal( f.state.analyzing, false, 'a malformed result never auto-loads a section, so the loader must not stay up' );
	}
	const f = fixture(); const pending = f.session.analyze(); f.respond( 0, { message: 'Insufficient balance' }, false ); await pending;
	assert.equal( f.state.error, 'Insufficient balance' ); assert.equal( f.state.busy, false );
	assert.equal( f.state.analyzing, false );
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
// deepStrictEqual also compares [[Prototype]], and values built by code running inside the
// vm sandbox belong to a different realm than plain literals in this test file, so a
// same-shape comparison across that boundary needs a structural check instead.
function assertSameShape( actual, expected, message ) {
	assert.equal( JSON.stringify( actual ), JSON.stringify( expected ), message );
}
test( 'section details validation accepts the full shape and rejects malformed payloads', () => {
	const { client } = fixture();
	const full = {
		params: [ { name: 'Metric', value: '0.42', score: '2', low: false, hint: 'What this measures.', hintUrl: 'https://turgenev.ashmanov.com/?h=vkladki#metric' } ],
		words: [ { text: 'and', count: 3, percent: '5.0%', stopword: true, type: 'doubles', level: 4 } ],
		phrases: [ { text: 'fast car', count: 2 } ],
		legend: [ { type: 'slop', level: 1, label: 'Potential issue.' } ],
		breakdown: [ { label: 'query coverage', value: '0.2' } ],
		sentenceProblems: { '107-33': [ { label: 'Стилистические ошибки', section: 'style' }, { label: 'Запросы', section: 'keywords' }, { label: 'Без раздела' } ] },
		wordCount: 51,
	};
	assertSameShape( client.validSectionDetails( full ), full );
	assertSameShape( client.validSectionDetails( { params: [] } ), { params: [] } );
	// A legend row with no recognized `xhl` class comes through as type: '', level: 0.
	assertSameShape(
		client.validSectionDetails( { params: [], legend: [ { type: '', level: 0, label: 'x' } ] } ),
		{ params: [], legend: [ { type: '', level: 0, label: 'x' } ] }
	);
	for ( const invalid of [
		null,
		{},
		{ params: 'nope' },
		{ params: [ { name: 'Metric', value: '0.42', score: '2' } ] }, // missing "low"
		{ params: [ { name: 'Metric', value: '0.42', score: '2', low: false, hint: 42 } ] }, // "hint" not a string
		{ params: [ { name: 'Metric', value: '0.42', score: '2', low: false, hintUrl: 42 } ] }, // "hintUrl" not a string
		{ params: [], words: [ { text: 'and' } ] }, // missing "count"
		{ params: [], words: [ { text: 'and', count: 1, type: 'unknown', level: 1 } ] }, // unrecognized "type"
		{ params: [], legend: [ { level: 1, label: 'x' } ] }, // missing "type"
		{ params: [], legend: [ { type: 'slop', level: 10, label: 'x' } ] }, // level out of range
		{ params: [], breakdown: [ { label: 'x' } ] }, // missing "value"
		{ params: [], sentenceProblems: { 'not-an-id': [ 'x' ] } },
		{ params: [], sentenceProblems: { '0-5': 'not-an-array' } },
		{ params: [], sentenceProblems: { '0-5': [ 'a bare string' ] } }, // pre-section shape
		{ params: [], sentenceProblems: { '0-5': [ { label: 'x', section: 'overall' } ] } }, // never a jump target
		{ params: [], sentenceProblems: { '0-5': [ { label: 'x', section: 'unknown' } ] } },
		{ params: [], sentenceProblems: { '0-5': [ { section: 'style' } ] } }, // missing "label"
		{ params: [], wordCount: 'not-a-number' },
		{ params: [], wordCount: -1 },
		{ params: [], wordCount: 1.5 },
		{ params: Array( 201 ).fill( { name: 'a', value: 'b', score: '0', low: false } ) },
	] ) {
		assert.throws( () => client.validSectionDetails( invalid ), /invalid section details/ );
	}
} );
test( 'analyzing a document auto-opens the overall section, running highlight and the details fetch together', async () => {
	const f = fixture();
	// analyze() now opens "overall" itself, mirroring a manual click on that accordion
	// button: 0: risk, 1: auto balance refresh, 2: its own highlight, 3: its own details.
	const pending = f.session.analyze();
	f.respond( 0, { result } );
	await pending;

	assert.equal( f.state.openSection, 'overall' );
	assert.equal( f.state.sectionLoading, true );
	assert.equal( f.state.busy, false, 'the initial request has settled, but the loader must not hand off yet' );
	assert.equal( f.state.analyzing, true, 'still loading: the auto-opened "overall" section has not settled' );
	assert.equal( f.requests[ 2 ].body.get( 'operation' ), 'highlights' );
	assert.equal( f.requests[ 3 ].body.get( 'operation' ), 'details' );
	assert.equal( f.requests[ 3 ].body.get( 'section' ), 'overall' );
	assert.equal( f.requests[ 3 ].body.get( 'report_token' ), 'risk12345' );

	const sectionResult = { params: [ { name: 'Metric', value: '0.42', score: '2', low: false } ] };
	f.respond( 2, { highlights: { text: 'Original text', marks: [] } } );
	f.respond( 3, { details: sectionResult } );
	// analyze()'s own promise does not await this auto-triggered toggle (a manual click
	// doesn't block the "Analyze document" button either), so flush the microtask queue
	// instead of awaiting a captured promise.
	await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
	assert.equal( f.state.sectionLoading, false );
	assertSameShape( f.state.sectionData, sectionResult );
	assert.equal( f.state.sectionError, '' );
	assert.equal( f.state.activeToken, 'risk12345' );
	assert.equal( f.state.analyzing, false, 'the loader hands off only once "overall" is fully open and populated' );

	// Re-clicking the already-open section collapses it without any new request.
	const closing = f.session.toggleSection( 'overall', 'risk12345' );
	assert.equal( f.requests.length, 4 );
	await closing;
	assert.equal( f.state.openSection, null );
} );
test( 'the loader hands off even when the auto-opened section\'s own details fetch fails', async () => {
	const f = fixture();
	const pending = f.session.analyze();
	f.respond( 0, { result } );
	await pending;
	assert.equal( f.state.analyzing, true );

	f.respond( 2, { highlights: { text: 'Original text', marks: [] } } );
	f.respond( 3, { message: 'Turgenev report did not contain section details.' }, false );
	await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
	assert.match( f.state.sectionError, /section details/ );
	assert.equal( f.state.analyzing, false, 'a failed auto-load must still release the loader, not leave it spinning' );
} );
test( 'switching accordion sections aborts the previous details request and supersedes it', async () => {
	const f = fixture();
	// analyze() auto-opens "overall" first; switching to "style" here still exercises the
	// same superseding-request behavior as switching between any two sections.
	let pending = f.session.analyze(); f.respond( 0, { result } ); await pending;

	const first = f.session.toggleSection( 'style', 'style12345' );
	const firstDetailsRequest = f.requests[ 5 ];
	f.respond( 4, { highlights: { text: 'Original text', marks: [] } } );

	const second = f.session.toggleSection( 'keywords', 'keywords12345' );
	assert.equal( firstDetailsRequest.options.signal.aborted, true, 'the superseded section\'s details fetch is aborted' );
	assert.equal( f.state.openSection, 'keywords' );

	f.respond( 5, { details: { params: [] } } ); // stale response for the abandoned "style" details fetch.
	await first;
	assert.equal( f.state.openSection, 'keywords', 'a stale response for a superseded section never overwrites the newer one' );

	f.respond( 6, { highlights: { text: 'Original text', marks: [] } } );
	f.respond( 7, { details: { params: [] } } );
	await second;
	assert.equal( f.state.openSection, 'keywords' );
	assert.equal( f.state.sectionLoading, false );
	assertSameShape( f.state.sectionData, { params: [] } );
} );
test( 'a failed details fetch surfaces sectionError without discarding a successful highlight', async () => {
	const f = fixture();
	let pending = f.session.analyze(); f.respond( 0, { result } ); await pending;

	pending = f.session.toggleSection( 'formality', 'formality12345' );
	f.respond( 4, { highlights: { text: 'Original text', marks: [] } } );
	f.respond( 5, { message: 'Turgenev report did not contain section details.' }, false );
	await pending;
	assert.equal( f.state.sectionLoading, false );
	assert.equal( f.state.sectionData, null );
	assert.match( f.state.sectionError, /section details/ );
	assert.equal( f.state.activeToken, 'formality12345', 'the highlight itself still succeeded independently of the details fetch' );
} );
test( 'reset clears accordion section state, and dispose stops any further section updates', async () => {
	const f = fixture();
	let pending = f.session.analyze(); f.respond( 0, { result } ); await pending;
	// analyze() already auto-opened "overall"; just settle its in-flight fetches.
	f.respond( 2, { highlights: { text: 'Original text', marks: [] } } );
	f.respond( 3, { details: { params: [] } } );
	await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
	assert.equal( f.state.openSection, 'overall' );

	f.session.reset();
	assert.equal( f.state.openSection, null );
	assert.equal( f.state.sectionData, null );
	assert.equal( f.state.sectionLoading, false );

	pending = f.session.toggleSection( 'overall', 'risk12345' );
	const detailsRequest = f.requests.at( -1 );
	const highlightsRequest = f.requests.at( -2 );
	f.session.dispose();
	assert.equal( detailsRequest.options.signal.aborted, true );
	assert.equal( highlightsRequest.options.signal.aborted, true );
	// abort() only sets the signal's flag in this mock (it does not itself settle the fetch
	// promise, matching how the browser's own AbortController is treated elsewhere in this
	// suite), so both requests still need a response before the outer promise can resolve.
	f.respond( f.requests.indexOf( highlightsRequest ), { highlights: { text: 'Original text', marks: [] } } );
	f.respond( f.requests.indexOf( detailsRequest ), { details: { params: [] } } );
	await pending; // Resolves, but a disposed session's own `disposed` guard suppresses the update.

	// toggleSection is a no-op once disposed, proving the session is fully torn down.
	const requestsBefore = f.requests.length;
	await f.session.toggleSection( 'style', 'style12345' );
	assert.equal( f.requests.length, requestsBefore );
} );
test( 'a hovered sentence\'s problems outlive the hover so their section links stay reachable, while the legend highlight follows the cursor', async () => {
	const f = fixture();
	const pending = f.session.analyze();
	f.respond( 0, { result } );
	await pending;
	const problems = { '0-2': [ { label: 'Word repetition', section: 'frequency' } ], '2-1': [ { label: 'Style errors', section: 'style' } ] };
	f.respond( 2, { highlights: { text: 'Original text', marks: [] } } );
	f.respond( 3, { details: { params: [], sentenceProblems: problems } } );
	await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );

	f.hover( { sentence: '0-2', type: 'doubles', level: 3 } );
	assertSameShape( f.state.sentenceProblem, problems[ '0-2' ] );
	assert.equal( f.state.hoveredLegendKey, 'doubles3' );

	f.hover( null );
	assertSameShape( f.state.sentenceProblem, problems[ '0-2' ], 'leaving the sentence keeps its problem list' );
	assert.equal( f.state.hoveredLegendKey, null, 'the legend highlight still follows the cursor' );

	f.hover( { sentence: '2-1', type: 'slop', level: 1 } );
	assertSameShape( f.state.sentenceProblem, problems[ '2-1' ], 'only hovering another sentence replaces it' );
} );
