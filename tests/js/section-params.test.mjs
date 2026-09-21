import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const script = await readFile( new URL( '../../assets/build/client.js', import.meta.url ), 'utf8' );

function createElement( tagName ) {
	const el = {
		tagName,
		children: [],
		_classes: new Set(),
		hidden: false,
		textContent: '',
		style: {},
		listeners: {},
		get className() {
			return [ ...this._classes ].join( ' ' );
		},
		set className( value ) {
			this._classes = new Set( String( value ).split( /\s+/ ).filter( Boolean ) );
		},
		get classList() {
			return {
				add: ( ...names ) => names.forEach( ( n ) => el._classes.add( n ) ),
				remove: ( ...names ) => names.forEach( ( n ) => el._classes.delete( n ) ),
				contains: ( n ) => el._classes.has( n ),
			};
		},
		addEventListener( type, fn ) {
			( el.listeners[ type ] ||= [] ).push( fn );
		},
		_attrs: {},
		setAttribute( name, value ) {
			el._attrs[ name ] = String( value );
		},
		getAttribute( name ) {
			return name in el._attrs ? el._attrs[ name ] : null;
		},
		click() {
			( el.listeners.click || [] ).forEach( ( fn ) => fn() );
		},
		append( ...nodes ) {
			el.children.push( ...nodes );
		},
		appendChild( node ) {
			el.children.push( node );
			return node;
		},
		querySelectorAll( selector ) {
			const cls = selector.replace( /^\./, '' );
			const found = [];
			( function walk( node ) {
				node.children.forEach( ( child ) => {
					if ( child._classes && child._classes.has( cls ) ) found.push( child );
					walk( child );
				} );
			} )( el );
			return found;
		},
	};
	return el;
}

function fixture() {
	const window = {
		TurgenevConfig: { ajaxUrl: '/api', nonce: 'nonce', postId: 1, isConfigured: true, highlightsAvailable: true },
		wp: { i18n: { __: ( value ) => value } },
	};
	const document = { createElement };
	vm.runInNewContext( script, { window, document, fetch: () => Promise.reject( new Error( 'not used' ) ), URLSearchParams, AbortController } );
	return window.TurgenevUI.renderSectionParams;
}

function param( name, low = false ) {
	return { name, value: '1', score: '0', low };
}

test( 'six or fewer overall characteristics all show with no toggle', () => {
	const renderSectionParams = fixture();
	const wrap = renderSectionParams( 'overall', [ param( 'a' ), param( 'b' ), param( 'c' ), param( 'd' ), param( 'e' ), param( 'f' ) ] );
	assert.equal( wrap.children.filter( ( c ) => c.hidden ).length, 0 );
	assert.equal( wrap.children.some( ( c ) => c.tagName === 'button' ), false );
} );

test( 'overflow past the sixth non-low characteristic is hidden behind a toggle, even with no low-flagged rows', () => {
	const renderSectionParams = fixture();
	const params = [ 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h' ].map( ( n ) => param( n ) );
	const wrap = renderSectionParams( 'overall', params );
	const rows = wrap.children.filter( ( c ) => c.tagName === 'div' );
	assert.equal( rows.filter( ( c ) => ! c.hidden ).length, 6 );
	assert.equal( rows.filter( ( c ) => c.hidden ).length, 2 );
	const toggle = wrap.children.find( ( c ) => c.tagName === 'button' );
	assert.ok( toggle, 'toggle must appear once more than 6 characteristics exist' );
	assert.equal( toggle.textContent, 'Show all characteristics' );
} );

test( 'provider-flagged low characteristics stay hidden even when fewer than 6 non-low ones exist', () => {
	const renderSectionParams = fixture();
	const params = [ param( 'a' ), param( 'b' ), param( 'c' ), param( 'low1', true ), param( 'low2', true ) ];
	const wrap = renderSectionParams( 'overall', params );
	const rows = wrap.children.filter( ( c ) => c.tagName === 'div' );
	assert.equal( rows.filter( ( c ) => ! c.hidden ).length, 3 );
	assert.equal( rows.filter( ( c ) => c.hidden ).length, 2 );
} );

test( 'the toggle reveals every hidden row and its label flips both ways', () => {
	const renderSectionParams = fixture();
	const params = [ 'a', 'b', 'c', 'd', 'e', 'f', 'g' ].map( ( n, i ) => param( n, i === 6 ) ).concat( [ param( 'h' ), param( 'i' ) ] );
	const wrap = renderSectionParams( 'overall', params );
	const toggle = wrap.children.find( ( c ) => c.tagName === 'button' );
	const hiddenBefore = wrap.children.filter( ( c ) => c.tagName === 'div' && c.hidden ).length;
	assert.ok( hiddenBefore > 0 );
	toggle.click();
	assert.equal( toggle.textContent, 'Hide unimportant characteristics' );
	assert.equal( wrap.children.filter( ( c ) => c.tagName === 'div' && c.hidden ).length, 0 );
	toggle.click();
	assert.equal( toggle.textContent, 'Show all characteristics' );
	assert.equal( wrap.children.filter( ( c ) => c.tagName === 'div' && c.hidden ).length, hiddenBefore );
} );

test( 'non-overall sections never hide characteristics, regardless of count or the low flag', () => {
	const renderSectionParams = fixture();
	const params = [ 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h' ].map( ( n ) => param( n, true ) );
	const wrap = renderSectionParams( 'frequency', params );
	assert.equal( wrap.children.filter( ( c ) => c.hidden ).length, 0 );
	assert.equal( wrap.children.some( ( c ) => c.tagName === 'button' ), false );
} );

test( 'a recognized overall characteristic gets a hover/focus tooltip with the curated explainer and its "Подробнее" link', () => {
	const renderSectionParams = fixture();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ) ] );
	const name = wrap.children[ 0 ].children.find( ( c ) => c.className.includes( 'turgenev-section-param-name' ) );
	assert.ok( name.className.includes( 'has-tooltip' ), 'recognized characteristic must be marked as having a tooltip' );
	assert.equal( name.tabIndex, 0, 'must be reachable by keyboard, not mouse-only' );
	const tooltip = name.children.find( ( c ) => c.className === 'turgenev-param-tooltip' );
	assert.ok( tooltip, 'tooltip element missing' );
	assert.equal( tooltip.getAttribute( 'role' ), 'tooltip' );
	const [ description, link ] = tooltip.children;
	assert.match( description.textContent, /Доля стоп-слов/ );
	assert.equal( link.tagName, 'a' );
	assert.equal( link.href, 'https://turgenev.ashmanov.com/?h=vkladki#water' );
	assert.equal( link.target, '_blank' );
	assert.equal( link.rel, 'noopener noreferrer' );
	assert.equal( link.textContent, 'Подробнее' );
} );

test( 'an unrecognized characteristic name gets no tooltip, degrading gracefully rather than guessing', () => {
	const renderSectionParams = fixture();
	const wrap = renderSectionParams( 'overall', [ param( 'Some future characteristic' ) ] );
	const name = wrap.children[ 0 ].children.find( ( c ) => c.className.includes( 'turgenev-section-param-name' ) );
	assert.equal( name.className.includes( 'has-tooltip' ), false );
	assert.equal( name.children.length, 0 );
	assert.equal( name.textContent, 'Some future characteristic' );
} );

test( 'a live provider-supplied hint always wins over the curated fallback text, even for a recognized name', () => {
	const renderSectionParams = fixture();
	const live = { ...param( 'Водность' ), hint: 'Live text from the provider report itself.', hintUrl: 'https://turgenev.ashmanov.com/?h=vkladki#water-live' };
	const wrap = renderSectionParams( 'overall', [ live ] );
	const name = wrap.children[ 0 ].children.find( ( c ) => c.className.includes( 'turgenev-section-param-name' ) );
	const tooltip = name.children.find( ( c ) => c.className === 'turgenev-param-tooltip' );
	const [ description, link ] = tooltip.children;
	assert.equal( description.textContent, 'Live text from the provider report itself.' );
	assert.equal( link.href, 'https://turgenev.ashmanov.com/?h=vkladki#water-live' );
} );

test( 'a live hint with no accompanying link URL falls back to the curated link for a recognized name, or shows text only for an unrecognized one', () => {
	const renderSectionParams = fixture();
	const recognized = { ...param( 'Водность' ), hint: 'Live text, no URL from the provider this time.' };
	const unrecognized = { ...param( 'Some future characteristic' ), hint: 'Live text for a characteristic we have no curated fallback for.' };
	const wrap = renderSectionParams( 'overall', [ recognized, unrecognized ] );
	const [ recognizedName, unrecognizedName ] = wrap.children.map( ( row ) => row.children.find( ( c ) => c.className.includes( 'turgenev-section-param-name' ) ) );

	const recognizedTooltip = recognizedName.children.find( ( c ) => c.className === 'turgenev-param-tooltip' );
	const [ , recognizedLink ] = recognizedTooltip.children;
	assert.equal( recognizedLink.href, 'https://turgenev.ashmanov.com/?h=vkladki#water', 'no live URL: falls back to the curated link for a name we recognize' );

	const unrecognizedTooltip = unrecognizedName.children.find( ( c ) => c.className === 'turgenev-param-tooltip' );
	assert.equal( unrecognizedTooltip.children.length, 1, 'no live URL and no curated fallback: text only, no link' );
} );

test( 'tooltips never appear outside the overall section, even for a recognized name', () => {
	const renderSectionParams = fixture();
	const wrap = renderSectionParams( 'frequency', [ param( 'Водность' ) ] );
	const name = wrap.children[ 0 ].children.find( ( c ) => c.className.includes( 'turgenev-section-param-name' ) );
	assert.equal( name.className.includes( 'has-tooltip' ), false );
	assert.equal( name.children.length, 0 );
} );
