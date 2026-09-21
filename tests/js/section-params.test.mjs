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
