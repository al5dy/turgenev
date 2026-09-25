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
		wp: { i18n: { __: ( value ) => value, sprintf: ( format, ...args ) => format.replace( /%(\d)\$s/g, ( _, n ) => String( args[ n - 1 ] ) ) } },
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

// The explainer and help link the server attaches to a characteristic: parsed from the
// report, or its own fallback for a row that arrives without one.
const HINTS = {
	Водность: { hint: 'Доля стоп-слов в тексте. Для определения риска не используется.', hintUrl: 'https://turgenev.ashmanov.com/?h=vkladki#water' },
	'Покрытие ключевыми словами': { hint: 'Доля текста, которую занимают запросы (с учетом «штрафов» за запросы в точной форме и длинные запросы).', hintUrl: 'https://turgenev.ashmanov.com/?h=vkladki#queries' },
};
function hinted( name ) {
	return { ...param( name ), ...HINTS[ name ] };
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

test( 'like the provider, overall folds only its low characteristics, never a scored one past some count', () => {
	const renderSectionParams = fixture();
	const params = [ 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h' ].map( ( n ) => param( n ) );
	const wrap = renderSectionParams( 'overall', params );
	const rows = wrap.children.filter( ( c ) => c.tagName === 'div' );
	assert.equal( rows.filter( ( c ) => ! c.hidden ).length, 8 );
	assert.equal( wrap.children.some( ( c ) => c.tagName === 'button' ), false, 'nothing to show, so no toggle' );
} );

test( 'low characteristics are greyed in every section, and a row the provider scores nothing shows no badge', () => {
	const renderSectionParams = fixture();
	const wrap = renderSectionParams( 'frequency', [ { name: 'a', value: '2.24', score: '', low: true }, { name: 'b', value: '13.18', score: '2', low: false } ] );
	const [ low, scored ] = wrap.children;
	assert.equal( low.hidden, false );
	assert.equal( low.classList.contains( 'is-low' ), true );
	assert.equal( low.children[ 1 ].children.map( ( c ) => c.className ).join(), 'turgenev-section-param-value-text', 'no score badge without a score' );
	assert.equal( scored.classList.contains( 'is-low' ), false );
	assert.equal( scored.children[ 1 ].children[ 0 ].textContent, '2' );
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
	const wrap = renderSectionParams( 'overall', [ hinted( 'Водность' ) ] );
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

test( 'hovering a characteristic shows the shared tooltip, portaled to <body>, with its explainer and "More information" link', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ hinted( 'Водность' ) ] );
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
	assert.equal( link.textContent, 'More information' );
} );

test( 'the tooltip is positioned strictly to the left of its trigger (never right/above/below), vertically centered', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ hinted( 'Водность' ) ] );
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
	const wrap = renderSectionParams( 'overall', [ hinted( 'Водность' ) ] );
	const name = paramNameEl( wrap );
	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );

	name.fire( 'mouseleave' );
	tooltip.fire( 'mouseenter' ); // the pointer lands on the tooltip before the close timer elapses
	assert.equal( tooltip.hidden, false, 'must not close while the pointer is travelling onto the tooltip' );
} );

test( 'the tooltip closes, after a short grace period, once the pointer leaves both the trigger and the tooltip', async () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ hinted( 'Водность' ) ] );
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
	const wrap = renderSectionParams( 'overall', [ hinted( 'Водность' ) ] );
	const name = paramNameEl( wrap );

	name.fire( 'focus' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	assert.equal( tooltip.hidden, false );

	// Tab from the trigger into the tooltip's own "More information" link.
	name.fire( 'blur', { relatedTarget: tooltip } );
	assert.equal( tooltip.hidden, false, 'must not close when focus moves into the tooltip itself' );

	name.fire( 'keydown', { key: 'Escape' } );
	assert.equal( tooltip.hidden, true, 'Escape closes it immediately, no grace period' );
} );

test( 'the tooltip shows exactly the explainer and link the server sent, in whatever language it sent them', () => {
	const { renderSectionParams, document } = ui();
	const english = { ...param( 'Water content' ), hint: 'The share of stop words in the text. Not used to determine the risk.', hintUrl: 'https://turgenev.ashmanov.com/?h=vkladki#water' };
	const wrap = renderSectionParams( 'overall', [ english ] );
	const name = paramNameEl( wrap );
	assert.equal( name.textContent, 'Water content' );
	name.fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	const [ description, linkWrap ] = tooltip.children;
	assert.equal( description.textContent, english.hint );
	assert.equal( linkWrap.children[ 0 ].href, english.hintUrl );
} );

test( 'a hint without a link URL shows its text only, and the browser never supplies an explainer of its own', () => {
	const { renderSectionParams, document } = ui();
	const unlinked = { ...param( 'Водность' ), hint: 'Live text, no URL from the provider this time.' };
	const wrap = renderSectionParams( 'overall', [ unlinked, param( 'Водность' ) ] );
	paramNameEl( wrap, 0 ).fire( 'mouseenter' );
	const tooltip = document.getElementById( 'turgenev-param-tooltip' );
	assert.equal( tooltip.children.length, 1, 'no URL: text only, no link' );
	assert.equal( paramNameEl( wrap, 1 ).className.includes( 'has-tooltip' ), false, 'a known provider name without a hint gets none: the server owns every fallback, in the reader\'s language' );
} );

test( 'showing a new row\'s tooltip replaces the previous one\'s content in the single shared element', () => {
	const { renderSectionParams, document } = ui();
	const wrap = renderSectionParams( 'overall', [ hinted( 'Водность' ), hinted( 'Покрытие ключевыми словами' ) ] );
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
	const wrap = renderSectionParams( 'overall', [ hinted( 'Водность' ) ] );
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
	const wrap = renderSectionParams( 'frequency', [ hinted( 'Водность' ) ] );
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

test( 'the word table mirrors the provider: score badges, colors from the painting class, grey only for plain stop words', () => {
	const { renderWordStats } = ui();
	const table = renderWordStats( [
		{ text: 'ремонт', count: 13, percent: '12.9%', stopword: false, score: '2', type: 'top_notstop', level: 2, stems: [ 'stm-6-1088D' ] },
		{ text: 'и', count: 10, percent: '9.9%', stopword: true, score: '1', type: 'top_and', level: 1, stems: [ 'stm-6-22906' ] },
		{ text: 'мы', count: 3, percent: '3.0%', stopword: true },
	], true );
	const [ word, highlightedStop, plainStop ] = table.children[ 0 ].children;
	assert.equal( word.children[ 0 ].style.color, '#ff0000' );
	assert.equal( word.children[ 1 ].children[ 0 ].textContent, '2', 'score badge in its own column' );
	assert.equal( word.children[ 2 ].textContent, '13' );
	assert.equal( highlightedStop.classList.contains( 'turgenev-section-word-stop' ), false, 'a highlighted stop word keeps its color' );
	assert.equal( highlightedStop.children[ 0 ].title, 'Stop word' );
	assert.equal( plainStop.classList.contains( 'turgenev-section-word-stop' ), true );
	assert.equal( plainStop.children[ 1 ].children.length, 0, 'no badge without a score' );
} );

test( 'a word row with stems is pickable by click or keyboard and shows which one is picked', () => {
	const { renderWordStats } = ui();
	const picked = [];
	const words = [ { text: 'дом', count: 4, stems: [ 'stm-6-1A612' ] }, { text: 'брус', count: 3 } ];
	const table = renderWordStats( words, true, 0, ( index ) => picked.push( index ) );
	const [ pickable, plain ] = table.children[ 0 ].children;
	assert.equal( pickable.classList.contains( 'is-pickable' ), true );
	assert.equal( pickable.classList.contains( 'is-active' ), true );
	assert.equal( pickable.getAttribute( 'aria-pressed' ), 'true' );
	pickable.click();
	let prevented = false;
	pickable.fire( 'keydown', { key: 'Enter', preventDefault: () => { prevented = true; } } );
	assert.deepEqual( picked, [ 0, 0 ] );
	assert.equal( prevented, true );
	assert.equal( plain.classList.contains( 'is-pickable' ), false, 'a row the provider does not link to the text is not pickable' );
	plain.click();
	assert.deepEqual( picked, [ 0, 0 ] );
} );

test( 'the legend is plain until a mark is hovered, then dims every row but the one it belongs to', () => {
	const { renderSectionContent } = ui();
	const legend = [ { type: 'fog', level: 1, label: 'Общие слова' }, { type: 'stop', level: 1, label: 'Стоп-слова' } ];
	const legendOf = ( key ) => renderSectionContent( 'formality', { params: [], legend }, riskResult, null, key ).children.find( ( c ) => c.className.includes( 'turgenev-section-legend' ) );
	assert.equal( legendOf( null ).classList.contains( 'has-active' ), false );
	const none = legendOf( '' );
	assert.equal( none.classList.contains( 'has-active' ), true );
	assert.equal( none.children.some( ( row ) => row.classList.contains( 'is-active' ) ), false );
	const stop = legendOf( 'stop1' );
	assert.deepEqual( stop.children.map( ( row ) => row.classList.contains( 'is-active' ) ), [ false, true ] );
} );

test( 'the style hints box shows one explainer at a time with its pager, links and italics, as plain text only', () => {
	const { renderSectionContent } = ui();
	const hints = [
		{ title: 'в процессе… осуществления', text: [ { text: 'Слово «процесс» замедляет ' }, { text: 'процесс', italic: true }, { text: ' <img src=x onerror=alert(1)>.' } ], more: 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#heavy' },
		{ title: '', text: [ { text: 'Второе.' } ], seeAlso: [ { label: 'Канцелярит', url: 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#kants' }, { label: 'Утяжеление', url: 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#heavy' } ] },
	];
	const pages = [];
	const box = ( index ) => renderSectionContent( 'style', { params: [] }, riskResult, null, null, undefined, { hints, hintIndex: index, onHintPage: ( i ) => pages.push( i ) } ).children.find( ( c ) => c.className === 'turgenev-section-hints' );
	assert.equal( renderSectionContent( 'style', { params: [] }, riskResult ).children.some( ( c ) => c.className === 'turgenev-section-hints' ), false, 'absent until a fragment is hovered' );
	const first = box( 0 );
	const [ header, body ] = first.children;
	const [ heading, pager ] = header.children;
	assert.equal( heading.textContent, 'Hints' );
	const [ previous, info, next ] = pager.children;
	assert.equal( info.textContent, '1/2' );
	assert.equal( previous.disabled, true );
	next.click();
	assert.deepEqual( pages, [ 1 ] );
	const [ title, text, more ] = body.children;
	assert.equal( title.textContent, 'в процессе… осуществления' );
	assert.equal( text.children[ 1 ].tagName, 'i' );
	assert.equal( text.children[ 2 ].nodeType, 3, 'provider text never becomes markup' );
	assert.equal( more.href, hints[ 0 ].more );
	assert.equal( more.rel, 'noopener noreferrer' );
	const second = box( 1 ).children[ 1 ];
	assert.equal( second.children[ 0 ].className, 'turgenev-section-hint-text', 'no title element without a title' );
	const seeAlso = second.children[ 1 ];
	assert.equal( seeAlso.children[ 0 ].textContent, 'See also:' );
	assert.deepEqual( seeAlso.children.filter( ( c ) => c.tagName === 'a' ).map( ( a ) => a.textContent ), [ 'Канцелярит', 'Утяжеление' ] );
	const empty = renderSectionContent( 'style', { params: [] }, riskResult, null, null, undefined, { hints: [] } ).children.find( ( c ) => c.className === 'turgenev-section-hints' );
	assert.equal( empty.children.length, 1, 'a hovered fragment without explainers keeps the box, empty' );
	assert.equal( first.children[ 1 ].children.some( ( c ) => c.className === 'turgenev-section-hint-category' ), false, 'a translated (or verbatim) explainer carries no category line' );
} );

test( 'an explainer left in the provider\'s words shows its English category on its own line, between title and text', () => {
	const { renderSectionContent } = ui();
	const hints = [ { title: 'данный', category: 'Bureaucratese', text: [ { text: 'Новое пояснение, которого нет в словаре.' } ], more: 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#kants' } ];
	const box = renderSectionContent( 'style', { params: [] }, riskResult, null, null, undefined, { hints } ).children.find( ( c ) => c.className === 'turgenev-section-hints' );
	const [ title, category, text ] = box.children[ 1 ].children;
	assert.equal( title.textContent, 'данный', 'the flagged words come from the document and are never translated' );
	assert.equal( category.className, 'turgenev-section-hint-category' );
	assert.equal( category.textContent, 'Bureaucratese' );
	assert.equal( text.className, 'turgenev-section-hint-text' );
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
	assert.equal( count.textContent, 'Words: 51', 'labelled like the provider\'s own counter' );
} );

test( 'the verdict reads the server\'s levelLabel (the reader\'s language), falling back to the provider\'s own word', () => {
	const { renderSectionContent } = ui();
	const verdict = ( result ) => renderSectionContent( 'overall', { params: [] }, result ).children.find( ( c ) => c.className === 'turgenev-section-verdict' ).textContent;
	assert.equal( verdict( { ...riskResult, level: 'высокий', levelLabel: 'high', risk: '9' } ), 'Risk: high (9)' );
	assert.equal( verdict( { ...riskResult, level: 'высокий', levelLabel: 'высокий', risk: '9' } ), 'Risk: высокий (9)', 'a Russian locale gets the provider\'s word untouched' );
	assert.equal( verdict( { ...riskResult, level: 'высокий', risk: '9' } ), 'Risk: высокий (9)', 'no label (an older response): the provider\'s own word' );
	assert.equal( verdict( { ...riskResult, level: 'высокий', levelLabel: 42, risk: '9' } ), 'Risk: высокий (9)', 'a malformed label never replaces the verdict' );
} );

test( 'a text too short to assess shows the provider\'s own message instead of a verdict', () => {
	const { renderSectionContent } = ui();
	const short = renderSectionContent( 'overall', { params: [], tooShort: true }, { ...riskResult, level: 'минимальный', risk: '0' } );
	assert.equal( short.children.find( ( c ) => c.className === 'turgenev-section-verdict' ).textContent, 'The text is too short. Risk is not assessed.' );
	const assessed = renderSectionContent( 'overall', { params: [], tooShort: false }, { ...riskResult, level: 'минимальный', risk: '0' } );
	assert.equal( assessed.children.find( ( c ) => c.className === 'turgenev-section-verdict' ).textContent, 'Risk: минимальный (0)' );
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

test( 'a sentence problem with a known section opens that section through the accordion toggle; others stay plain text', () => {
	const { renderResult } = ui();
	const container = createElement( 'div' );
	const withSections = {
		...riskResult,
		details: [
			{ block: 'frequency', sum: '2', link: 'freq12345' },
			{ block: 'style', sum: '1', link: 'style1234' },
		],
	};
	const toggled = [];
	const render = ( openSection ) =>
		renderResult( container, withSections, {
			onToggleSection: ( section, token ) => toggled.push( [ section, token ] ),
			openSection,
			sectionData: { params: [] },
			sentenceProblem: [
				{ label: 'Word repetition', section: 'frequency' },
				{ label: 'Keywords', section: 'keywords' }, // no such accordion entry in this result
				{ label: 'Unlinked' },
			],
		} );
	render( 'overall' );

	const links = container.querySelectorAll( '.turgenev-section-problem-link' );
	assert.equal( links.length, 2, 'the problem with no section never becomes a link' );
	assert.equal( links[ 0 ].tagName, 'button' );
	assert.equal( links[ 0 ].type, 'button' );
	assert.equal( links[ 0 ].textContent, 'Word repetition' );
	const rows = container.querySelectorAll( '.turgenev-section-breakdown-item' );
	assert.equal( rows[ 2 ].textContent, '• Unlinked' );

	links[ 0 ].click();
	assert.deepEqual( toggled, [ [ 'frequency', 'freq12345' ] ], 'opens the target section with that section\'s own report token' );
	links[ 1 ].click();
	assert.deepEqual( toggled.length, 1, 'a section missing from the result has no token to open it with' );

	// Rendered without a toggle callback (e.g. highlights unavailable) nothing is clickable.
	renderResult( container, withSections, { openSection: 'overall', sectionData: { params: [] }, sentenceProblem: [ { label: 'Word repetition', section: 'frequency' } ] } );
	assert.equal( container.querySelectorAll( '.turgenev-section-problem-link' ).length, 0 );
} );
