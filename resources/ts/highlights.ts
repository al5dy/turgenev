/**
 * One mark occurrence the reader can hover, with everything needed to paint its hover
 * background on whichever of the three paint paths drew it (see paint()). A mark that
 * maps to several ranges or overlay pieces in the same document is still one target, so
 * the whole mark lights up together.
 */
interface HoverTarget {
	/** Stable across repaints of the same report: the mark's index in the active marks. */
	key: number;
	hover: MarkHover;
	/** HighlightMark.fragments: hovering this mark lights up every target sharing one. */
	fragments: string[];
	/**
	 * Viewport rectangles (already clipped to what is actually visible) that count as
	 * "over this mark", each with the element the pointer must be over for it to count.
	 */
	rects: {
		left: number;
		top: number;
		right: number;
		bottom: number;
		anchor: Element;
	}[];
	/** Highlight API path: the ranges the shared hover highlight is painted onto. */
	ranges: Range[];
	/** Overlay paths: real elements whose resting background is swapped while hovered. */
	overlays: { element: HTMLElement; rest: string; opacity: number }[];
}

interface DecorationSurface {
	doc: Document;
	observer: MutationObserver;
	names: Set< string >;
	layer: HTMLElement | null;
	style: HTMLStyleElement | null;
	textareas: Set< HTMLTextAreaElement >;
	resize: ResizeObserver | null;
	/**
	 * Every hoverable mark of the current paint, rebuilt on every repaint. Hover is
	 * detected by hit-testing the pointer against these from one document-level
	 * listener, never by listeners on the decorations themselves: ::highlight()
	 * pseudo-elements can't receive events, and the overlay paths must stay
	 * `pointer-events:none` so they never swallow clicks meant for the editor.
	 */
	targets: Map< number, HoverTarget >;
	/** `targets` by each provider fragment id they belong to, rebuilt with them. */
	fragments: Map< string, HoverTarget[] >;
	/** The target under the pointer. */
	hovered: HoverTarget | null;
	/** What is painted as hovered: `hovered` plus every target sharing a fragment with it. */
	lit: Set< HoverTarget >;
	/**
	 * Identity (see hoverIdentity()) last reported through the hover callback. Survives
	 * repaints (unlike `hovered`), so re-hovering the same mark after one is not reported
	 * twice.
	 */
	hoverKey: string | null;
	/** Last pointer position in this document's viewport, or null once it left it. */
	pointer: { x: number; y: number } | null;
	/** Bound references kept so clear() can remove exactly the listeners observe() added. */
	handleMove: ( event: MouseEvent ) => void;
	handleLeave: ( event: MouseEvent ) => void;
}

( function ( window: Window & typeof globalThis ): void {
	'use strict';
	const client = window.TurgenevClient as TurgenevClientApi;
	// Shared highlight names for "whichever mark is under the cursor right now", one per
	// backdrop brightness — registered fresh on every hover change, painted with only a
	// background (see the stylesheet below), layered on top of the mark's own
	// color-only `turgenev-<type><level>` highlight for the same range.
	const HOVER_ON_LIGHT = 'turgenev-hover-on-light';
	const HOVER_ON_DARK = 'turgenev-hover-on-dark';
	// The hover background is the text's own backdrop moved this far toward black (on a
	// light backdrop) or white (on a dark one): exactly #ccc on white, #333 on black, and
	// always a visible, same-strength step on any color in between.
	const HOVER_TINT = 0.2;
	const TEXTAREA_OVERLAY_OPACITY = 0.5;
	const FALLBACK_OVERLAY_OPACITY = 0.45;
	function hoverTint( dark: boolean, opacity = 1 ): string {
		// An overlay drawn at reduced opacity needs a proportionally stronger tint to land
		// on the same visible color as the Highlight API path.
		const alpha = Math.min( 1, HOVER_TINT / opacity );
		return dark
			? `rgba(255, 255, 255, ${ alpha })`
			: `rgba(0, 0, 0, ${ alpha })`;
	}
	const colorCache = new Map< string, number[] | null >();
	let colorProbe: CanvasRenderingContext2D | null | undefined;
	/**
	 * Any CSS color a computed style can report (rgb(), color(srgb …), oklch(), …) as
	 * straight sRGB [r, g, b, alpha 0–1], by letting the browser paint it into one pixel.
	 */
	function parseColor( value: string ): number[] | null {
		if ( colorCache.has( value ) ) {
			return colorCache.get( value ) ?? null;
		}
		if ( colorProbe === undefined ) {
			const canvas = window.document.createElement( 'canvas' );
			canvas.width = canvas.height = 1;
			colorProbe = canvas.getContext( '2d', { willReadFrequently: true } );
		}
		let color: number[] | null = null;
		if ( colorProbe ) {
			colorProbe.clearRect( 0, 0, 1, 1 );
			colorProbe.fillStyle = 'rgba(0, 0, 0, 0)';
			colorProbe.fillStyle = value;
			colorProbe.fillRect( 0, 0, 1, 1 );
			const [ r, g, b, a ] = colorProbe.getImageData( 0, 0, 1, 1 ).data;
			// Painted over transparent, so un-premultiply to recover the color itself.
			color = a ? [ r * 255 / a, g * 255 / a, b * 255 / a, a / 255 ] : [ 0, 0, 0, 0 ];
		}
		colorCache.set( value, color );
		return color;
	}
	function frameElementOf( doc: Document ): Element | null {
		try {
			return doc.defaultView?.frameElement ?? null;
		} catch {
			return null;
		}
	}
	/**
	 * Whether the background actually showing behind `element` is dark: composites every
	 * (semi-)transparent background up the tree — crossing out of an editor iframe into
	 * the page that hosts it — until an opaque one, over the browser's white canvas.
	 */
	function isDarkBackdrop( element: Element ): boolean {
		const layers: number[][] = [];
		let node: Element | null = element;
		while ( node ) {
			const view = node.ownerDocument.defaultView;
			const color = view
				? parseColor( view.getComputedStyle( node ).backgroundColor )
				: null;
			if ( color && color[ 3 ] > 0 ) {
				layers.push( color );
				if ( color[ 3 ] >= 1 ) {
					break;
				}
			}
			node = node.parentElement ?? frameElementOf( node.ownerDocument );
		}
		let rgb = [ 255, 255, 255 ];
		for ( let i = layers.length - 1; i >= 0; i-- ) {
			const alpha = layers[ i ][ 3 ];
			rgb = rgb.map(
				( channel, index ) =>
					layers[ i ][ index ] * alpha + channel * ( 1 - alpha )
			);
		}
		const [ r, g, b ] = rgb.map( ( channel ) => {
			const value = channel / 255;
			return value <= 0.04045
				? value / 12.92
				: ( ( value + 0.055 ) / 1.055 ) ** 2.4;
		} );
		// WCAG relative luminance; below ~0.179 white contrasts more than black does.
		return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.179;
	}
	// Used only to pick a winner when highlight ranges overlap; the actual paint color
	// always comes from client.highlightColor(), never from this number.
	function severity( mark: HighlightMark ): number {
		return client.highlightLevel( mark );
	}
	function layerFor( surface: DecorationSurface ): HTMLElement {
		if ( ! surface.layer ) {
			surface.layer = surface.doc.createElement( 'div' );
			surface.layer.className = 'turgenev-decoration-layer';
			surface.layer.setAttribute( 'aria-hidden', 'true' );
			surface.layer.style.cssText =
				'position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden;';
			surface.doc.documentElement.appendChild( surface.layer );
		}
		return surface.layer;
	}
	function hoverTargetFor(
		surface: DecorationSurface,
		key: number,
		mark: HighlightMark
	): HoverTarget {
		let target = surface.targets.get( key );
		if ( ! target ) {
			target = {
				key,
				hover: {
					sentence: mark.sentence ?? null,
					type: mark.type,
					level: mark.level,
				},
				fragments: mark.fragments ?? [],
				rects: [],
				ranges: [],
				overlays: [],
			};
			surface.targets.set( key, target );
			for ( const id of target.fragments ) {
				const members = surface.fragments.get( id );
				if ( members ) {
					members.push( target );
				} else {
					surface.fragments.set( id, [ target ] );
				}
			}
		}
		return target;
	}
	/**
	 * Everything that lights up while `target` is hovered: the mark itself plus every mark
	 * sharing one of its provider fragments, i.e. the whole flagged sentence or phrase
	 * rather than the one word under the cursor — exactly what the provider's own report
	 * highlights for the same span.
	 */
	function unitOf(
		surface: DecorationSurface,
		target: HoverTarget
	): Set< HoverTarget > {
		const unit = new Set< HoverTarget >( [ target ] );
		for ( const id of target.fragments ) {
			for ( const member of surface.fragments.get( id ) ?? [] ) {
				unit.add( member );
			}
		}
		return unit;
	}
	function sameUnit( a: Set< HoverTarget >, b: Set< HoverTarget > ): boolean {
		return a.size === b.size && [ ...a ].every( ( target ) => b.has( target ) );
	}
	/** Everything the sidebar reacts to (see MarkHover), so only a change of it is reported. */
	function hoverIdentity( hover: MarkHover ): string {
		return JSON.stringify( [ hover.sentence, hover.type, hover.level ] );
	}
	function addRects(
		target: HoverTarget,
		rects: DOMRectList | DOMRect[],
		anchor: Element,
		clip: { left: number; top: number; right: number; bottom: number } | null
	): void {
		for ( const rect of Array.from( rects ) ) {
			const box = {
				left: Math.max( rect.left, clip ? clip.left : -Infinity ),
				top: Math.max( rect.top, clip ? clip.top : -Infinity ),
				right: Math.min( rect.right, clip ? clip.right : Infinity ),
				bottom: Math.min( rect.bottom, clip ? clip.bottom : Infinity ),
				anchor,
			};
			if ( box.right > box.left && box.bottom > box.top ) {
				target.rects.push( box );
			}
		}
	}
	function paintTextarea(
		target: TextareaAnalysisTarget,
		// Source-offset pieces of each mark, with `key` naming the mark they came from.
		marks: ( HighlightMark & { key: number } )[],
		surface: DecorationSurface
	): void {
		const { textarea, document: doc } = target;
		const win = doc.defaultView as Window;
		const style = win.getComputedStyle( textarea );
		const rect = textarea.getBoundingClientRect();
		const left = rect.left + textarea.clientLeft,
			top = rect.top + textarea.clientTop;
		let clipLeft = left,
			clipTop = top;
		let clipRight = left + textarea.clientWidth,
			clipBottom = top + textarea.clientHeight;
		for (
			let parent = textarea.parentElement;
			parent;
			parent = parent.parentElement
		) {
			const parentStyle = win.getComputedStyle( parent );
			const bounds = parent.getBoundingClientRect();
			if ( /auto|scroll|hidden|clip/.test( parentStyle.overflowX ) ) {
				clipLeft = Math.max(
					clipLeft,
					bounds.left + parent.clientLeft
				);
				clipRight = Math.min(
					clipRight,
					bounds.left + parent.clientLeft + parent.clientWidth
				);
			}
			if ( /auto|scroll|hidden|clip/.test( parentStyle.overflowY ) ) {
				clipTop = Math.max( clipTop, bounds.top + parent.clientTop );
				clipBottom = Math.min(
					clipBottom,
					bounds.top + parent.clientTop + parent.clientHeight
				);
			}
		}
		const clip = doc.createElement( 'div' );
		clip.className = 'turgenev-source-decoration';
		clip.style.cssText =
			'position:absolute;overflow:hidden;pointer-events:none;';
		clip.style.opacity = String( TEXTAREA_OVERLAY_OPACITY );
		Object.assign( clip.style, {
			left: clipLeft + 'px',
			top: clipTop + 'px',
			width: Math.max( 0, clipRight - clipLeft ) + 'px',
			height: Math.max( 0, clipBottom - clipTop ) + 'px',
		} );
		const mirror = doc.createElement( 'div' );
		mirror.style.cssText =
			'position:absolute;box-sizing:border-box;margin:0;border:0;color:transparent;pointer-events:none;';
		for ( const property of [
			'fontFamily',
			'fontSize',
			'fontWeight',
			'fontStyle',
			'fontVariant',
			'fontStretch',
			'lineHeight',
			'letterSpacing',
			'wordSpacing',
			'textAlign',
			'textIndent',
			'textTransform',
			'direction',
			'tabSize',
			'paddingTop',
			'paddingRight',
			'paddingBottom',
			'paddingLeft',
			'wordBreak',
			'overflowWrap',
		] as const ) {
			mirror.style[ property ] = style[ property ];
		}
		Object.assign( mirror.style, {
			left: left - clipLeft - textarea.scrollLeft + 'px',
			top: top - clipTop - textarea.scrollTop + 'px',
			width: textarea.clientWidth + 'px',
			whiteSpace: textarea.wrap === 'off' ? 'pre' : 'pre-wrap',
			overflowWrap: textarea.wrap === 'off' ? 'normal' : 'break-word',
		} );
		const events = new Map< number, { index: number; adding: boolean }[] >();
		marks.forEach( ( mark, index ) => {
			for ( const [ position, adding ] of [
				[ mark.start, true ],
				[ mark.end, false ],
			] as const ) {
				let list = events.get( position );
				if ( ! list ) {
					list = [];
					events.set( position, list );
				}
				list.push( { index, adding } );
			}
		} );
		const active = new Map< number, HighlightMark & { key: number } >();
		// Every text node of the mirror with its textarea offset, to measure mark pieces.
		const nodes: { node: Text; start: number; span: HTMLElement | null }[] = [];
		let cursor = 0;
		for ( const position of [
			...events.keys(),
			textarea.value.length,
		].sort( ( a, b ) => a - b ) ) {
			if ( position > cursor ) {
				const text = textarea.value.slice( cursor, position );
				if ( active.size ) {
					const mark = [ ...active.values() ].sort(
						( a, b ) => severity( b ) - severity( a )
					)[ 0 ];
					const span = doc.createElement( 'span' );
					span.className = 'turgenev-source-mark';
					span.dataset.category = mark.category;
					span.dataset.type = mark.type;
					span.style.color = 'transparent';
					span.style.backgroundColor = client.highlightColor( mark );
					const node = doc.createTextNode( text );
					span.appendChild( node );
					nodes.push( { node, start: cursor, span } );
					mirror.appendChild( span );
				} else {
					const node = doc.createTextNode( text );
					nodes.push( { node, start: cursor, span: null } );
					mirror.appendChild( node );
				}
			}
			for ( const event of events.get( position ) || [] ) {
				if ( event.adding ) {
					active.set( event.index, marks[ event.index ] );
				} else {
					active.delete( event.index );
				}
			}
			cursor = position;
		}
		mirror.appendChild( doc.createTextNode( '\u200b' ) );
		clip.appendChild( mirror );
		layerFor( surface ).appendChild( clip );
		// A real <textarea> can't recolor individual characters, so hovering a mark swaps
		// the background of the overlay spans covering it (each span covers exactly one
		// piece boundary to the next, so a span is either wholly inside a piece or not).
		// Measured now that the mirror is laid out, clipped to the textarea's visible area.
		for ( const mark of marks ) {
			const hoverTarget = hoverTargetFor( surface, mark.key, mark );
			const range = doc.createRange();
			const first = nodes.find(
				( entry ) =>
					mark.start < entry.start + entry.node.length &&
					mark.start >= entry.start
			);
			const last = nodes.find(
				( entry ) =>
					mark.end <= entry.start + entry.node.length &&
					mark.end > entry.start
			);
			if ( ! first || ! last ) {
				continue;
			}
			range.setStart( first.node, mark.start - first.start );
			range.setEnd( last.node, mark.end - last.start );
			addRects( hoverTarget, range.getClientRects(), textarea, {
				left: clipLeft,
				top: clipTop,
				right: clipRight,
				bottom: clipBottom,
			} );
			for ( const entry of nodes ) {
				if (
					entry.span &&
					entry.start >= mark.start &&
					entry.start < mark.end
				) {
					hoverTarget.overlays.push( {
						element: entry.span,
						rest: entry.span.style.backgroundColor,
						opacity: TEXTAREA_OVERLAY_OPACITY,
					} );
				}
			}
		}
		if ( ! surface.textareas.has( textarea ) ) {
			surface.textareas.add( textarea );
			surface.resize?.observe( textarea );
		}
	}

	// Decorations never touch a block, RichText value, undo history or editable DOM.
	function create(
		getTargets: ( source: SourceSnapshot ) => AnalysisTarget[],
		getDocuments: () => Document[]
	): Decorations {
		let active: { source: SourceSnapshot; marks: HighlightMark[] } | null =
			null;
		let hoverCallback: ( ( hover: MarkHover | null ) => void ) | null = null;
		let frame = 0;
		const surfaces = new Map< Document, DecorationSurface >();
		function surfaceWindow( surface: DecorationSurface ): ( Window & {
			CSS?: {
				highlights?: {
					delete: ( name: string ) => void;
					set: ( name: string, value: unknown ) => void;
				};
			};
			Highlight?: new ( ...ranges: Range[] ) => unknown;
		} ) | null {
			return surface.doc.defaultView as ReturnType< typeof surfaceWindow >;
		}
		function showHover(
			surface: DecorationSurface,
			unit: Set< HoverTarget >,
			hovered: HoverTarget
		): void {
			const light: Range[] = [];
			const dark: Range[] = [];
			const backdrops = new Map< Element, boolean >();
			for ( const target of unit ) {
				// A fragment member scrolled out of a textarea's view has no rectangle of its
				// own; it still sits on the same backdrop as the rest of its fragment.
				const anchor = ( target.rects[ 0 ] ?? hovered.rects[ 0 ] ).anchor;
				let onDark = backdrops.get( anchor );
				if ( onDark === undefined ) {
					onDark = isDarkBackdrop( anchor );
					backdrops.set( anchor, onDark );
				}
				( onDark ? dark : light ).push( ...target.ranges );
				for ( const overlay of target.overlays ) {
					overlay.element.style.backgroundColor = hoverTint(
						onDark,
						overlay.opacity
					);
				}
			}
			const win = surfaceWindow( surface );
			if ( win?.CSS?.highlights && win.Highlight ) {
				if ( light.length ) {
					win.CSS.highlights.set(
						HOVER_ON_LIGHT,
						new win.Highlight( ...light )
					);
				}
				if ( dark.length ) {
					win.CSS.highlights.set(
						HOVER_ON_DARK,
						new win.Highlight( ...dark )
					);
				}
			}
		}
		function hideHover(
			surface: DecorationSurface,
			unit: Set< HoverTarget >
		): void {
			const win = surfaceWindow( surface );
			win?.CSS?.highlights?.delete( HOVER_ON_LIGHT );
			win?.CSS?.highlights?.delete( HOVER_ON_DARK );
			for ( const target of unit ) {
				for ( const overlay of target.overlays ) {
					overlay.element.style.backgroundColor = overlay.rest;
				}
			}
		}
		/**
		 * Paints (or clears) the hover background for one surface and, only when the hovered
		 * mark's identity actually changed, reports it up so the sidebar can show its sentence
		 * problems and light up the matching legend entry. Moving between the words of one
		 * fragment keeps the same background, and a mousemove within one mark is a no-op.
		 */
		function setHover(
			surface: DecorationSurface,
			hit: HoverTarget | null
		): void {
			if ( hit === surface.hovered ) {
				return;
			}
			surface.hovered = hit;
			const unit = hit ? unitOf( surface, hit ) : new Set< HoverTarget >();
			if ( ! sameUnit( unit, surface.lit ) ) {
				hideHover( surface, surface.lit );
				surface.lit = unit;
				if ( hit ) {
					showHover( surface, unit, hit );
				}
			}
			const key = hit ? hoverIdentity( hit.hover ) : null;
			if ( key !== surface.hoverKey ) {
				surface.hoverKey = key;
				hoverCallback?.( hit ? hit.hover : null );
			}
		}
		/**
		 * The innermost mark under the point (a word wins over a sentence containing it),
		 * counting a rectangle only while the pointer is really over that text — not over a
		 * toolbar, popover or other UI that happens to float above it.
		 */
		function findHit(
			surface: DecorationSurface,
			x: number,
			y: number,
			over: Element | null
		): HoverTarget | null {
			if ( ! over ) {
				return null;
			}
			let best: HoverTarget | null = null;
			let bestArea = Infinity;
			for ( const target of surface.targets.values() ) {
				const inside = target.rects.some(
					( rect ) =>
						x >= rect.left &&
						x <= rect.right &&
						y >= rect.top &&
						y <= rect.bottom &&
						( rect.anchor.contains( over ) || over.contains( rect.anchor ) )
				);
				if ( ! inside ) {
					continue;
				}
				const area = target.rects.reduce(
					( sum, rect ) =>
						sum + ( rect.right - rect.left ) * ( rect.bottom - rect.top ),
					0
				);
				if ( area < bestArea ) {
					best = target;
					bestArea = area;
				}
			}
			return best;
		}
		function handleSurfaceMove(
			surface: DecorationSurface,
			event: MouseEvent
		): void {
			surface.pointer = { x: event.clientX, y: event.clientY };
			setHover(
				surface,
				findHit(
					surface,
					event.clientX,
					event.clientY,
					( event.target as Node | null )?.nodeType === 1
						? ( event.target as Element )
						: null
				)
			);
		}
		/**
		 * A repaint (scroll, resize, editor re-render) rebuilds every target, and the text
		 * may have moved under a pointer that didn't: re-evaluate the last pointer position
		 * so the hover background stays exactly where the cursor is, without a mousemove.
		 */
		function restoreHover( surface: DecorationSurface ): void {
			const pointer = surface.pointer;
			setHover(
				surface,
				pointer
					? findHit(
							surface,
							pointer.x,
							pointer.y,
							surface.doc.elementFromPoint( pointer.x, pointer.y )
					  )
					: null
			);
		}
		function clearSurface( surface: DecorationSurface ): void {
			const win = surfaceWindow( surface );
			for ( const name of surface.names ) {
				win?.CSS?.highlights?.delete( name );
			}
			// Visual only: `hoverKey` is kept so restoreHover() can tell a repaint of the
			// same hovered mark from a real change.
			hideHover( surface, surface.lit );
			surface.hovered = null;
			surface.lit = new Set();
			surface.names.clear();
			surface.layer?.replaceChildren();
			surface.targets = new Map();
			surface.fragments = new Map();
		}
		/** The plugin's own panel re-renders on every hover; that is never a reason to repaint. */
		function isOwnUi( node: Node ): boolean {
			const element =
				node.nodeType === 1
					? ( node as Element )
					: ( node.parentElement as Element | null );
			return !! element?.closest( '.turgenev-panel' );
		}
		function observe( doc: Document ): DecorationSurface {
			const existing = surfaces.get( doc );
			if ( existing ) {
				return existing;
			}
			const observer = new window.MutationObserver( ( records ) => {
				if ( records.some( ( record ) => ! isOwnUi( record.target ) ) ) {
					schedule();
				}
			} );
			observer.observe( doc.body, {
				childList: true,
				subtree: true,
				characterData: true,
				attributes: true,
				attributeFilter: [
					'class',
					'style',
					'hidden',
					'open',
					'contenteditable',
				],
			} );
			doc.addEventListener( 'scroll', schedule, true );
			doc.defaultView?.addEventListener( 'resize', schedule );
			const surface: DecorationSurface = {
				doc,
				observer,
				names: new Set(),
				layer: null,
				style: null,
				textareas: new Set(),
				resize: doc.defaultView?.ResizeObserver
					? new doc.defaultView.ResizeObserver( schedule )
					: null,
				targets: new Map(),
				fragments: new Map(),
				hovered: null,
				lit: new Set(),
				hoverKey: null,
				pointer: null,
				handleMove: ( event ) => handleSurfaceMove( surface, event ),
				// `mouseleave` doesn't bubble and Document isn't itself a valid target for
				// it in every engine, so leaving the whole document is instead detected via
				// `mouseout` with no `relatedTarget` (the pointer left to outside the
				// viewport) — the ordinary "moved onto some other element" case is already
				// covered by handleMove's own hit test coming back empty.
				handleLeave: ( event ) => {
					if ( ! ( event as MouseEvent ).relatedTarget ) {
						surface.pointer = null;
						setHover( surface, null );
					}
				},
			};
			doc.addEventListener( 'mousemove', surface.handleMove );
			doc.addEventListener( 'mouseout', surface.handleLeave );
			surfaces.set( doc, surface );
			return surface;
		}
		function paint(): number {
			frame = 0;
			for ( const surface of surfaces.values() ) {
				clearSurface( surface );
			}
			if ( ! active ) {
				return 0;
			}
			getDocuments().forEach( observe );
			const coverage = new Uint8Array( active.source.text.length );
			for ( const target of getTargets( active.source ) ) {
				const surface = observe( target.document );
				const win = target.document.defaultView as
					| ( Window & {
							CSS?: {
								highlights?: {
									has: ( name: string ) => boolean;
									set: ( name: string, value: unknown ) => void;
									get: ( name: string ) => { add: ( range: Range ) => void } | undefined;
								};
							};
							Highlight?: new () => unknown;
					  } )
					| null;
				const sourceMarks: ( HighlightMark & { key: number } )[] = [];
				for ( const [ index, mark ] of active.marks.entries() ) {
					const start = Math.max( 0, mark.start - target.offset );
					const end = Math.min(
						target.text.length,
						mark.end - target.offset
					);
					if ( end <= start ) {
						continue;
					}
					if ( target.textarea ) {
						const ranges = target.ranges( start, end );
						if ( ranges.length ) {
							coverage.fill(
								1,
								target.offset + start,
								target.offset + end
							);
							sourceMarks.push(
								...ranges.map(
									( range ) =>
										( { ...mark, ...range, key: index } )
								)
							);
						}
						continue;
					}
					const range = target.range( start, end );
					if ( ! range ) {
						continue;
					}
					if ( target.isVisible( start, end ) ) {
						coverage.fill(
							1,
							target.offset + start,
							target.offset + end
						);
					}
					const hoverTarget = hoverTargetFor( surface, index, mark );
					const anchor =
						range.commonAncestorContainer.nodeType === 1
							? ( range.commonAncestorContainer as Element )
							: range.commonAncestorContainer.parentElement;
					if ( anchor ) {
						addRects( hoverTarget, range.getClientRects(), anchor, null );
					}
					const name = 'turgenev-' + mark.type + mark.level;
					if ( win?.CSS?.highlights && win.Highlight ) {
						if ( ! surface.style ) {
							surface.style =
								target.document.createElement( 'style' );
							// `::highlight()` paints straight onto the live text via the
							// browser's own text layout, so severity can be shown as the
							// text's own color rather than a background wash behind it —
							// unlike the two paths below (a native <textarea> can't style
							// individual characters at all, and the pre-Highlight-API
							// fallback draws a separate overlay box that never touches the
							// real text), both of which stay background-based out of
							// necessity, not choice.
							surface.style.textContent =
								Object.entries( client.highlightColorTable )
									.map(
										( [ key, color ] ) =>
											'::highlight(turgenev-' +
											key +
											'){color:' +
											color +
											';}'
									)
									.join( '\n' ) +
								// Layered on top of a mark's own color-only rule above (never
								// registered together on overlapping text otherwise), so
								// hovering shows severity color and a background at once.
								`\n::highlight(${ HOVER_ON_LIGHT }){background-color:${ hoverTint( false ) };}` +
								`\n::highlight(${ HOVER_ON_DARK }){background-color:${ hoverTint( true ) };}`;
							target.document.head.appendChild( surface.style );
						}
						if ( ! surface.names.has( name ) ) {
							win.CSS.highlights.set( name, new win.Highlight() );
							surface.names.add( name );
						}
						( win.CSS.highlights.get( name ) as {
							add: ( range: Range ) => void;
						} ).add( range );
						hoverTarget.ranges.push( range );
					} else {
						// Older browsers: viewport rectangles outside body, hence outside TinyMCE too.
						const layer = layerFor( surface );
						const restColor = client.highlightColor( mark );
						for ( const rect of range.getClientRects() ) {
							const box = target.document.createElement( 'span' );
							box.style.cssText =
								'position:absolute;pointer-events:none;';
							box.style.opacity = String( FALLBACK_OVERLAY_OPACITY );
							Object.assign( box.style, {
								left: rect.left + 'px',
								top: rect.top + 'px',
								width: rect.width + 'px',
								height: rect.height + 'px',
								backgroundColor: restColor,
							} );
							// No rich text to layer a separate hover background onto here
							// (unlike the Highlight API path above), so hovering swaps this
							// box's own background from its resting severity color.
							hoverTarget.overlays.push( {
								element: box,
								rest: restColor,
								opacity: FALLBACK_OVERLAY_OPACITY,
							} );
							layer.appendChild( box );
						}
					}
				}
				if ( sourceMarks.length ) {
					// Only populated on the textarea branch above; the cast reflects that invariant.
					paintTextarea(
						target as TextareaAnalysisTarget,
						sourceMarks,
						surface
					);
				}
			}
			for ( const surface of surfaces.values() ) {
				restoreHover( surface );
			}
			const missing = new Uint32Array( coverage.length + 1 );
			for ( let i = 0; i < coverage.length; i++ ) {
				missing[ i + 1 ] =
					missing[ i ] +
					Number(
						! coverage[ i ] &&
							! /\s/u.test( active.source.text[ i ] )
					);
			}
			return active.marks.filter(
				( mark ) => missing[ mark.end ] === missing[ mark.start ]
			).length;
		}
		function schedule(): void {
			if ( active && ! frame ) {
				frame = window.requestAnimationFrame( paint );
			}
		}
		function clear(): void {
			active = null;
			hoverCallback = null;
			window.cancelAnimationFrame( frame );
			frame = 0;
			for ( const surface of surfaces.values() ) {
				clearSurface( surface );
				surface.observer.disconnect();
				surface.resize?.disconnect();
				surface.doc.removeEventListener( 'scroll', schedule, true );
				surface.doc.defaultView?.removeEventListener(
					'resize',
					schedule
				);
				surface.doc.removeEventListener( 'mousemove', surface.handleMove );
				surface.doc.removeEventListener( 'mouseout', surface.handleLeave );
				surface.layer?.remove();
				surface.style?.remove();
			}
			surfaces.clear();
		}
		window.document.addEventListener( 'load', schedule, true );
		return {
			apply(
				source: SourceSnapshot,
				data: HighlightsResponseData,
				onHover?: ( hover: MarkHover | null ) => void
			) {
				if ( data?.text !== source.text ) {
					throw new Error(
						'Turgenev report text does not match the document.'
					);
				}
				active = {
					source,
					marks: client.validHighlights( data.text, data.marks ),
				};
				hoverCallback = onHover ?? null;
				const visible = paint();
				// Non-rendered third-party fields use the session's read-only text view.
				// Keep every valid in-place decoration; malformed provider data still fails above.
				return { visible, total: active.marks.length };
			},
			clear,
			dispose() {
				clear();
				window.document.removeEventListener( 'load', schedule, true );
			},
		};
	}
	window.TurgenevHighlights = Object.freeze( { create } );
} )( window );
