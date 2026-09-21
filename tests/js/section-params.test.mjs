import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const script = await readFile( new URL( '../../assets/build/client.js', import.meta.url ), 'utf8' );

// Every element gets a distinct, deterministic rect so the "strictly to the
// left" positioning math is actually exercised rather than trivially 0×0:
// each successive element is placed further right, matching the order things
// tend to get created in a render pass (trigger, then eventually the
// tooltip singleton).
let nextRectLeft = 300;
function createElement( tagName ) {
	const rect = { left: nextRectLeft, top: 100, width: 60, height: 20 };
	nextRectLeft += 10;
	rect.right = rect.left + rect.width;
	rect.bottom = rect.top + rect.height;
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
			el.fire( 'click' );
		},
		focus() {},
		// Simulates dispatching a real event: every listener registered for
		// `type` runs with a plain object standing in for the Event/FocusEvent/
		// KeyboardEvent client.ts actually reads (relatedTarget, key).
		fire( type, eventInit = {} ) {
			( el.listeners[ type ] || [] ).forEach( ( fn ) =>
				fn( { type, target: el, currentTarget: el, relatedTarget: null, ...eventInit } )
			);
		},
		append( ...nodes ) {
			el.children.push( ...nodes );
		},
		appendChild( node ) {
			el.children.push( node );
			return node;
		},
		contains( node ) {
			if ( node === el ) return true;
			return el.children.some( ( child ) => child === node || ( child.contains && child.contains( node ) ) );
		},
		replaceChildren( ...nodes ) {
			el.children = nodes;
		},
		getBoundingClientRect() {
			return rect;
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

function ui() {
	nextRectLeft = 300;
	const idRegistry = new Map();
	function trackedCreateElement( tagName ) {
		const el = createElement( tagName );
		let idValue = '';
		Object.defineProperty( el, 'id', {
			get: () => idValue,
			set: ( value ) => {
				if ( idValue ) idRegistry.delete( idValue );
				idValue = value;
				if ( value ) idRegistry.set( value, el );
			},
		} );
		return el;
	}
	const window = {
		TurgenevConfig: { ajaxUrl: '/api', nonce: 'nonce', postId: 1, isConfigured: true, highlightsAvailable: true },
		wp: { i18n: { __: ( value ) => value } },
		setTimeout,
		clearTimeout,
		requestAnimationFrame: () => 0,
		addEventListener: () => {},
		innerHeight: 800,
	};
	const document = {
		createElement: trackedCreateElement,
		createTextNode: ( text ) => ( { nodeType: 3, textContent: String( text ), children: [] } ),
		body: trackedCreateElement( 'body' ),
		getElementById: ( id ) => idRegistry.get( id ) ?? null,
	};
	vm.runInNewContext( script, { window, document, fetch: () => Promise.reject( new Error( 'not used' ) ), URLSearchParams, AbortController } );
	return { ...window.TurgenevUI, document };
}

function fixture() {
	return ui().renderSectionParams;
}

function param( name, low = false ) {
	return { name, value: '1', score: '0', low };
}

test( 'the value cell shows the plain score in its own badge before the value text, no parentheses', () => {
	const renderSectionParams = fixture();
	const wrap = renderSectionParams( 'overall', [ { name: 'a', value: '27.27', score: '5', low: false } ] );
	const row = wrap.children[ 0 ];
	const value = row.children[ 1 ];
	assert.equal( value.className, 'turgenev-section-param-value' );
	const [ scoreBadge, valueText ] = value.children;
	assert.equal( scoreBadge.className, 'turgenev-section-param-score' );
	assert.equal( scoreBadge.textContent, '5' );
	assert.equal( valueText.className, 'turgenev-section-param-value-text' );
	assert.equal( valueText.textContent, '27.27' );
} );

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

function paramNameEl( wrap, rowIndex = 0 ) {
	return wrap.children[ rowIndex ].children.find( ( c ) => c.className.includes( 'turgenev-section-param-name' ) );
}

test( 'a recognized overall characteristic is marked hoverable/focusable but carries no nested tooltip markup', () => {
	const { renderSectionParams } = ui();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ) ] );
	const name = paramNameEl( wrap );
	assert.ok( name.className.includes( 'has-tooltip' ), 'recognized characteristic must be marked as having a tooltip' );
	assert.equal( name.tabIndex, 0, 'must be reachable by keyboard, not mouse-only' );
	assert.equal( name.getAttribute( 'aria-describedby' ), 'turgenev-param-tooltip' );
	// The tooltip is a single shared element portaled onto <body> (see below),
	// never a child of its trigger: nesting it here is what let the accordion's
	// own scroll container (`.turgenev-sidebar__body { overflow-y: auto }`)
	// clip it whenever it needed to render outside the row's own bounds.
	assert.equal( name.children.length, 0 );
} );

test( 'hovering a recognized characteristic shows the shared tooltip, portaled to <body>, with its explainer and "Подробнее" link', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ) ] );
	const name = paramNameEl( wrap );

	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	assert.ok( tooltip, 'tooltip element missing' );
	assert.ok( document.body.contains( tooltip ), 'must live under <body>, not under the trigger' );
	assert.equal( tooltip.hidden, false );
	assert.equal( tooltip.getAttribute( 'role' ), 'tooltip' );
	const [ description, linkWrap ] = tooltip.children;
	assert.match( description.textContent, /Доля стоп-слов/ );
	assert.equal( linkWrap.className, 'turgenev-param-tooltip-link' );
	const link = linkWrap.children[ 0 ];
	assert.equal( link.tagName, 'a' );
	assert.equal( link.href, 'https://turgenev.ashmanov.com/?h=vkladki#water' );
	assert.equal( link.target, '_blank' );
	assert.equal( link.rel, 'noopener noreferrer' );
	assert.equal( link.textContent, 'Подробнее' );
} );

test( 'the tooltip is positioned strictly to the left of its trigger (never right/above/below), vertically centered', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ) ] );
	const name = paramNameEl( wrap );
	const triggerRect = name.getBoundingClientRect();

	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	const tipRect = tooltip.getBoundingClientRect();
	const expectedLeft = Math.max( 4, triggerRect.left - tipRect.width - 8 );
	const expectedTop = Math.max(
		4,
		Math.min( triggerRect.top + triggerRect.height / 2 - tipRect.height / 2, 800 - tipRect.height - 4 )
	);
	assert.equal( tooltip.style.left, `${ expectedLeft }px` );
	assert.equal( tooltip.style.top, `${ expectedTop }px` );
	// Its right edge must sit at or before the trigger's left edge - genuinely
	// to the left, not overlapping or wrapping to another side.
	assert.ok( expectedLeft + tipRect.width <= triggerRect.left );
} );

test( 'the tooltip stays open while the pointer travels from the trigger onto the tooltip itself, e.g. to reach the link', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ) ] );
	const name = paramNameEl( wrap );
	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );

	name.fire( 'mouseleave' );
	tooltip.fire( 'mouseenter' ); // the pointer lands on the tooltip before the close timer elapses
	assert.equal( tooltip.hidden, false, 'must not close while the pointer is travelling onto the tooltip' );
} );

test( 'the tooltip closes, after a short grace period, once the pointer leaves both the trigger and the tooltip', async () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ) ] );
	const name = paramNameEl( wrap );
	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );

	name.fire( 'mouseleave' );
	assert.equal( tooltip.hidden, false, 'closing is debounced, not instant' );
	await new Promise( ( resolve ) => setTimeout( resolve, 250 ) );
	assert.equal( tooltip.hidden, true, 'closes once the grace period elapses with no re-entry' );
} );

test( 'focusing the trigger shows the tooltip; moving focus onto its own link keeps it open, Escape closes it immediately', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ) ] );
	const name = paramNameEl( wrap );

	name.fire( 'focus' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	assert.equal( tooltip.hidden, false );

	// Tab from the trigger into the tooltip's own "Подробнее" link.
	name.fire( 'blur', { relatedTarget: tooltip } );
	assert.equal( tooltip.hidden, false, 'must not close when focus moves into the tooltip itself' );

	name.fire( 'keydown', { key: 'Escape' } );
	assert.equal( tooltip.hidden, true, 'Escape closes it immediately, no grace period' );
} );

test( 'a live provider-supplied hint always wins over the curated fallback text, even for a recognized name', () => {
	const { renderSectionParams, document } = ui();
	const live = { ...param( 'Водность' ), hint: 'Live text from the provider report itself.', hintUrl: 'https://turgenev.ashmanov.com/?h=vkladki#water-live' };
	const wrap = renderSectionParams( 'overall', [ live ] );
	const name = paramNameEl( wrap );
	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	const [ description, linkWrap ] = tooltip.children;
	assert.equal( description.textContent, 'Live text from the provider report itself.' );
	assert.equal( linkWrap.children[ 0 ].href, 'https://turgenev.ashmanov.com/?h=vkladki#water-live' );
} );

test( 'a live hint with no accompanying link URL falls back to the curated link for a recognized name, or shows text only for an unrecognized one', () => {
	const { renderSectionParams, document } = ui();
	const recognized = { ...param( 'Водность' ), hint: 'Live text, no URL from the provider this time.' };
	const unrecognized = { ...param( 'Some future characteristic' ), hint: 'Live text for a characteristic we have no curated fallback for.' };
	const wrap = renderSectionParams( 'overall', [ recognized, unrecognized ] );
	const [ recognizedName, unrecognizedName ] = [ paramNameEl( wrap, 0 ), paramNameEl( wrap, 1 ) ];

	recognizedName.fire( 'mouseenter' );
	let tooltip = document.getElementById( 'turgenev-param-tooltip' );
	assert.equal( tooltip.children[ 1 ].children[ 0 ].href, 'https://turgenev.ashmanov.com/?h=vkladki#water', 'no live URL: falls back to the curated link for a name we recognize' );

	unrecognizedName.fire( 'mouseenter' );
	tooltip = document.getElementById( 'turgenev-param-tooltip' );
	assert.equal( tooltip.children.length, 1, 'no live URL and no curated fallback: text only, no link' );
} );

test( 'showing a new row\'s tooltip replaces the previous one\'s content in the single shared element', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ), { ...param( 'Покрытие ключевыми словами' ) } ] );
	const [ first, second ] = [ paramNameEl( wrap, 0 ), paramNameEl( wrap, 1 ) ];

	first.fire( 'mouseenter' );
	const tooltipA = document.getElementById( 'turgenev-param-tooltip' );
	second.fire( 'mouseenter' );
	const tooltipB = document.getElementById( 'turgenev-param-tooltip' );
	assert.equal( tooltipA, tooltipB, 'only ever one tooltip element on the page' );
	assert.match( tooltipB.children[ 0 ].textContent, /запросы/ );
} );

test( 're-rendering the panel (e.g. a background state change) hides a currently open tooltip instead of leaving it stranded', () => {
	const { renderResult, renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ param( 'Водность' ) ] );
	const name = paramNameEl( wrap );
	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	assert.equal( tooltip.hidden, false );

	renderResult( document.createElement( 'div' ), { level: 'low', risk: '1', link: 'x', details: [] } );
	assert.equal( tooltip.hidden, true, 'a full re-render must dismiss any open tooltip, not risk it outliving its trigger' );
} );

test( 'an unrecognized characteristic name gets no tooltip, degrading gracefully rather than guessing', () => {
	const renderSectionParams = fixture();
	const wrap = renderSectionParams( 'overall', [ param( 'Some future characteristic' ) ] );
	const name = paramNameEl( wrap );
	assert.equal( name.className.includes( 'has-tooltip' ), false );
	assert.equal( name.children.length, 0 );
	assert.equal( name.textContent, 'Some future characteristic' );
} );

test( 'tooltips also appear outside the overall section: the provider embeds the same hint in every section\'s report', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'frequency', [ param( 'Водность' ) ] );
	const name = paramNameEl( wrap );
	assert.ok( name.className.includes( 'has-tooltip' ) );
	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	assert.ok( tooltip && ! tooltip.hidden, 'tooltip missing outside the overall section' );
} );

test( 'a non-overall section still shows nothing for an unrecognized characteristic with no live hint', () => {
	const renderSectionParams = fixture();
	const wrap = renderSectionParams( 'frequency', [ param( 'Some future characteristic' ) ] );
	const name = paramNameEl( wrap );
	assert.equal( name.className.includes( 'has-tooltip' ), false );
	assert.equal( name.children.length, 0 );
} );

test( 'a stop-word row gets a native "Stop word" tooltip, mirroring the provider\'s own title attribute', () => {
	const { renderWordStats } = ui();
	const table = renderWordStats( [ { text: 'и', count: 3, percent: '11.1%', stopword: true }, { text: 'заказ', count: 6, percent: '22.2%', stopword: false } ], true );
	const [ stopRow, ordinaryRow ] = table.children[ 0 ].children;
	assert.equal( stopRow.children[ 0 ].title, 'Stop word' );
	assert.equal( ordinaryRow.children[ 0 ].title, undefined, 'a non-stop-word row must not get the tooltip' );
} );

const riskResult = { level: 'low', risk: '3', link: 'risk12345', details: [] };

test( 'the overall section shows the analyzed word count next to the verdict, when the provider supplies it', () => {
	const { renderSectionContent } = ui();
	const wrap = renderSectionContent( 'overall', { params: [], wordCount: 51 }, riskResult );
	const count = wrap.children.find( ( c ) => c.className === 'turgenev-section-word-count' );
	assert.ok( count, 'word count element missing' );
	assert.match( count.textContent, /51/ );
} );

test( 'no word count element appears when the provider did not supply one', () => {
	const { renderSectionContent } = ui();
	const wrap = renderSectionContent( 'overall', { params: [] }, riskResult );
	assert.equal( wrap.children.some( ( c ) => c.className === 'turgenev-section-word-count' ), false );
} );

test( 'the word count never appears outside the overall section', () => {
	const { renderSectionContent } = ui();
	const wrap = renderSectionContent( 'frequency', { params: [], wordCount: 51 }, riskResult );
	assert.equal( wrap.children.some( ( c ) => c.className === 'turgenev-section-word-count' ), false );
} );

test( 'the "Open report" link only appears once the clicked panel\'s own content has finished loading', () => {
	const { renderResult } = ui();
	const container = createElement( 'div' );
	const panelOf = () => container.children[ 0 ].children[ 0 ].children[ 1 ];

	renderResult( container, riskResult, { onToggleSection: () => {}, openSection: 'overall', sectionLoading: true } );
	assert.equal( panelOf().querySelectorAll( '.turgenev-report-actions' ).length, 0, 'no report link while the panel is still loading' );

	renderResult( container, riskResult, { onToggleSection: () => {}, openSection: 'overall', sectionError: 'Something went wrong.' } );
	assert.equal( panelOf().querySelectorAll( '.turgenev-report-actions' ).length, 0, 'no report link when the panel failed to load' );

	renderResult( container, riskResult, { onToggleSection: () => {}, openSection: 'overall', sectionData: { params: [] } } );
	assert.equal( panelOf().querySelectorAll( '.turgenev-report-actions' ).length, 1, 'report link appears once the panel\'s own content has loaded' );
} );
