interface DecorationSurface {
	doc: Document;
	observer: MutationObserver;
	names: Set< string >;
	layer: HTMLElement | null;
	style: HTMLStyleElement | null;
	textareas: Set< HTMLTextAreaElement >;
	resize: ResizeObserver | null;
	/**
	 * Hoverable-sentence hit boxes for the current paint, rebuilt on every repaint. Needed
	 * only for the CSS Custom Highlight API path (::highlight() pseudo-elements can't
	 * receive DOM events themselves, so entry/exit is detected with a hit test against these
	 * instead); the textarea and older-browser paths attach real hover listeners directly to
	 * their own real <span> elements instead. `range` is only used to paint the "currently
	 * hovered" highlight and is a snapshot from the same paint pass as `rects`.
	 */
	sentenceRects: {
		sentence: string;
		type: string;
		level: number;
		range: Range;
		rects: DOMRect[];
	}[];
	/** The active hit's identity (or null), so repeated mousemoves over the same sentence/mark are a no-op. */
	hoverKey: string | null;
	/** Bound references kept so clear() can remove exactly the listeners observe() added. */
	handleMove: ( event: MouseEvent ) => void;
	handleLeave: ( event: MouseEvent ) => void;
}

/** What the reader's cursor is currently over: the sentence, and the mark that painted it. */
type SentenceHover = { sentence: string; type: string; level: number };

( function ( window: Window & typeof globalThis ): void {
	'use strict';
	const client = window.TurgenevClient as TurgenevClientApi;
	// A single shared highlight name for "whichever exact mark occurrence is under the
	// cursor right now" — registered fresh on every hover change, painted with only a
	// background (see the stylesheet below), layered on top of the mark's own
	// color-only `turgenev-<type><level>` highlight for the same range.
	const HOVER_HIGHLIGHT_NAME = 'turgenev-hover';
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
	function paintTextarea(
		target: TextareaAnalysisTarget,
		marks: HighlightMark[],
		surface: DecorationSurface,
		onSentenceHover: ( ( hover: SentenceHover | null ) => void ) | null
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
			'position:absolute;overflow:hidden;pointer-events:none;opacity:.5;';
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
		const active = new Map< number, HighlightMark >();
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
					const restColor = client.highlightColor( mark );
					span.style.backgroundColor = restColor;
					span.textContent = text;
					// A real <textarea> can't recolor individual characters (the real text
					// underneath stays its normal color; this overlay span only ever supplies
					// a background), so hovering swaps this whole span's background between
					// its resting severity color and #eee rather than layering a second color.
					if ( onSentenceHover && mark.sentence ) {
						const hover: SentenceHover = {
							sentence: mark.sentence,
							type: mark.type,
							level: mark.level,
						};
						span.style.pointerEvents = 'auto';
						span.style.cursor = 'pointer';
						span.addEventListener( 'mouseenter', () => {
							span.style.backgroundColor = '#eee';
							onSentenceHover( hover );
						} );
						span.addEventListener( 'mouseleave', () => {
							span.style.backgroundColor = restColor;
							onSentenceHover( null );
						} );
					}
					mirror.appendChild( span );
				} else {
					mirror.appendChild( doc.createTextNode( text ) );
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
		let hoverCallback: ( ( hover: SentenceHover | null ) => void ) | null =
			null;
		let frame = 0;
		const surfaces = new Map< Document, DecorationSurface >();
		function surfaceWindow( surface: DecorationSurface ): ( Window & {
			CSS?: {
				highlights?: {
					delete: ( name: string ) => void;
					set: ( name: string, value: unknown ) => void;
				};
			};
			Highlight?: new ( range: Range ) => unknown;
		} ) | null {
			return surface.doc.defaultView as ReturnType< typeof surfaceWindow >;
		}
		/**
		 * Applies (or clears) the hover state for one surface: repaints the shared
		 * "currently hovered" CSS Highlight so it lands only on that exact mark occurrence,
		 * and reports the change up so the sidebar can show its sentence problems and light
		 * up the matching legend entry. A no-op when the hit hasn't actually changed, so a
		 * mousemove within the same mark doesn't re-fire either.
		 */
		function setHover(
			surface: DecorationSurface,
			hit: DecorationSurface[ 'sentenceRects' ][ number ] | null
		): void {
			const key = hit
				? hit.sentence + '\u0000' + hit.type + hit.level
				: null;
			if ( key === surface.hoverKey ) {
				return;
			}
			surface.hoverKey = key;
			const win = surfaceWindow( surface );
			win?.CSS?.highlights?.delete( HOVER_HIGHLIGHT_NAME );
			if ( hit && win?.CSS?.highlights && win.Highlight ) {
				win.CSS.highlights.set(
					HOVER_HIGHLIGHT_NAME,
					new win.Highlight( hit.range )
				);
			}
			hoverCallback?.(
				hit
					? { sentence: hit.sentence, type: hit.type, level: hit.level }
					: null
			);
		}
		function findHit(
			surface: DecorationSurface,
			x: number,
			y: number
		): DecorationSurface[ 'sentenceRects' ][ number ] | null {
			return (
				surface.sentenceRects.find( ( entry ) =>
					entry.rects.some(
						( rect ) =>
							x >= rect.left &&
							x <= rect.right &&
							y >= rect.top &&
							y <= rect.bottom
					)
				) ?? null
			);
		}
		function handleSurfaceMove(
			surface: DecorationSurface,
			event: MouseEvent
		): void {
			setHover( surface, findHit( surface, event.clientX, event.clientY ) );
		}
		function clearSurface( surface: DecorationSurface ): void {
			const win = surfaceWindow( surface );
			for ( const name of surface.names ) {
				win?.CSS?.highlights?.delete( name );
			}
			win?.CSS?.highlights?.delete( HOVER_HIGHLIGHT_NAME );
			surface.hoverKey = null;
			surface.names.clear();
			surface.layer?.replaceChildren();
			surface.sentenceRects = [];
		}
		function observe( doc: Document ): DecorationSurface {
			const existing = surfaces.get( doc );
			if ( existing ) {
				return existing;
			}
			const observer = new window.MutationObserver( schedule );
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
				sentenceRects: [],
				hoverKey: null,
				handleMove: ( event ) => handleSurfaceMove( surface, event ),
				// `mouseleave` doesn't bubble and Document isn't itself a valid target for
				// it in every engine, so leaving the whole document is instead detected via
				// `mouseout` with no `relatedTarget` (the pointer left to outside the
				// viewport) — the ordinary "moved onto some other element" case is already
				// covered by handleMove's own hit test coming back empty.
				handleLeave: ( event ) => {
					if ( ! ( event as MouseEvent ).relatedTarget ) {
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
				const sourceMarks: HighlightMark[] = [];
				for ( const mark of active.marks ) {
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
										( { ...mark, ...range } as HighlightMark )
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
					if ( mark.sentence ) {
						surface.sentenceRects.push( {
							sentence: mark.sentence,
							type: mark.type,
							level: mark.level,
							range,
							rects: [ ...range.getClientRects() ],
						} );
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
								'\n::highlight(' +
								HOVER_HIGHLIGHT_NAME +
								'){background-color:#eee;}';
							target.document.head.appendChild( surface.style );
						}
						if ( ! surface.names.has( name ) ) {
							win.CSS.highlights.set( name, new win.Highlight() );
							surface.names.add( name );
						}
						( win.CSS.highlights.get( name ) as {
							add: ( range: Range ) => void;
						} ).add( range );
					} else {
						// Older browsers: viewport rectangles outside body, hence outside TinyMCE too.
						const layer = layerFor( surface );
						const restColor = client.highlightColor( mark );
						for ( const rect of range.getClientRects() ) {
							const box = target.document.createElement( 'span' );
							box.style.cssText =
								'position:absolute;pointer-events:none;opacity:.45;';
							Object.assign( box.style, {
								left: rect.left + 'px',
								top: rect.top + 'px',
								width: rect.width + 'px',
								height: rect.height + 'px',
								backgroundColor: restColor,
							} );
							// No rich text to layer a separate hover background onto here
							// (unlike the Highlight API path above), so hovering swaps this
							// box's own background between its resting severity color and #eee.
							if ( hoverCallback && mark.sentence ) {
								const hover: SentenceHover = {
									sentence: mark.sentence,
									type: mark.type,
									level: mark.level,
								};
								box.style.pointerEvents = 'auto';
								box.style.cursor = 'pointer';
								box.addEventListener( 'mouseenter', () => {
									box.style.backgroundColor = '#eee';
									hoverCallback?.( hover );
								} );
								box.addEventListener( 'mouseleave', () => {
									box.style.backgroundColor = restColor;
									hoverCallback?.( null );
								} );
							}
							layer.appendChild( box );
						}
					}
				}
				if ( sourceMarks.length ) {
					// Only populated on the textarea branch above; the cast reflects that invariant.
					paintTextarea(
						target as TextareaAnalysisTarget,
						sourceMarks,
						surface,
						hoverCallback
					);
				}
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
				onSentenceHover?: ( hover: SentenceHover | null ) => void
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
				hoverCallback = onSentenceHover ?? null;
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
