import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const script = await readFile( new URL( '../../assets/build/editor-content.js', import.meta.url ), 'utf8' );
function fixture( initialHTML, records = new Map() ) {
	let html = initialHTML;
	const reads = [], queries = [];
	const store = { getBlocksByName: () => [], getBlockParents: () => [], getBlockName: () => null, getBlocks: () => [] };
	const editor = { getEditedPostContent: () => html, getCurrentPostId: () => 77 };
	const core = { getEntityRecord: ( kind, type, id ) => { reads.push( id ); return records.get( id ); }, getEditedEntityRecord: ( kind, type, id ) => records.get( id ) };
	const wp = { data: { select: name => ( { 'core/editor': editor, 'core/block-editor': store, core } )[ name ] }, blocks: { serialize: blocks => Array.isArray( blocks ) ? blocks.map( block => block.html ).join( '' ) : blocks.html }, i18n: { __: value => value } };
	const window = { wp, CSS: { escape: value => value }, document: { querySelector: () => null, querySelectorAll: selector => { if ( selector.startsWith( '[data-block=' ) ) queries.push( selector ); return []; } }, TurgenevClient: { maxTextLength: 20000, textareaTarget: () => null, toPlainText: value => value.replace( /<!--[\s\S]*?-->|<[^>]*>/g, ' ' ).replace( /\s+/g, ' ' ).trim() } };
	vm.runInNewContext( script, { window } );
	return { content: window.TurgenevEditorContent, store, records, reads, queries, setHTML: value => { html = value; } };
}

test( 'source expands owned synced patterns including nested and repeated references without changing saved HTML', () => {
	const original = '<p>Before</p><!-- wp:block {"ref":1} /--><!-- wp:block {"ref":1} /--><p>After</p>';
	const f = fixture( original, new Map( [ [ 1, { content: '<p>Pattern</p><!-- wp:block {"ref":2} /-->' } ], [ 2, { content: { raw: '<p>Nested</p>' } } ] ] ) );
	const source = f.content.snapshot();
	assert.equal( source.text, 'Before Pattern Nested Pattern Nested After' );
	assert.equal( source.error, '' );
	assert.equal( JSON.parse( source.key )[ 1 ], original );
	assert.equal( source.postId, 77 );
	f.records.set( 2, { blocks: [ { html: '<p>Unsaved edit</p>' } ] } );
	assert.notEqual( f.content.snapshot().key, source.key, 'An edit to a referenced pattern must invalidate stale reports.' );
	assert.match( f.content.snapshot().text, /Unsaved edit/ );
} );

test( 'unavailable, malformed, circular and excessive pattern data block paid analysis, never silently truncate it', () => {
	const unavailable = fixture( '<p>Keep</p><!-- wp:block {"ref":4} /-->' );
	assert.match( unavailable.content.snapshot().error, /not loaded|unavailable/ );
	const malformed = fixture( '<!-- wp:block {"ref":"4"} /-->' );
	assert.match( malformed.content.snapshot().error, /invalid/ );
	assert.equal( malformed.reads.length, 0 );
	const circular = fixture( '<!-- wp:block {"ref":1} /-->', new Map( [ [ 1, { content: '<!-- wp:block {"ref":1} /-->' } ] ] ) );
	assert.match( circular.content.snapshot().error, /circular/ );
	const excessive = fixture( '<!-- wp:block {"ref":1} /-->', new Map( [ [ 1, { content: 'x'.repeat( 2000001 ) } ] ] ) );
	assert.match( excessive.content.snapshot().error, /exceed/ );
} );

test( 'content-root mapping selects controlled post blocks, not matching template or query text', () => {
	const f = fixture( '<p>Body</p>' );
	f.store.getBlocksByName = () => [ 'query-content', 'post-content' ];
	f.store.getBlockParents = id => id === 'query-content' ? [ 'query' ] : [ 'main', 'group' ];
	f.store.getBlockName = id => id === 'query' ? 'core/query' : 'core/group';
	f.store.getBlocks = id => [ { clientId: id === 'post-content' ? 'body-block' : 'unrelated-block', html: '<p>Body</p>' } ];
	f.content.targets( f.content.snapshot() );
	assert.deepEqual( f.queries, [ '[data-block="body-block"]' ] );
} );

test( 'unmatched template chrome cannot be mistaken for a partial body match', () => {
	const f = fixture( '<p>First Second</p>' );
	f.store.getBlocks = () => [ { clientId: 'footer', html: '<p>Second</p>' } ];
	f.content.targets( f.content.snapshot() );
	assert.deepEqual( f.queries, [] );
} );

test( 'mapping reads current live IDs on every paint, independently of the source snapshot', () => {
	const f = fixture( '<p>Body</p>' );
	f.store.getBlocks = () => [ { clientId: 'before', html: '<p>Body</p>' } ];
	const source = f.content.snapshot();
	f.content.targets( source );
	f.store.getBlocks = () => [ { clientId: 'after', html: '<p>Body</p>' } ];
	f.content.targets( source );
	assert.deepEqual( f.queries, [ '[data-block="before"]', '[data-block="after"]' ] );
} );
