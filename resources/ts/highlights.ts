interface DecorationSurface {
	doc: Document;
	observer: MutationObserver;
	names: Set< string >;
	layer: HTMLElement | null;
	style: HTMLStyleElement | null;
	textareas: Set< HTMLTextAreaElement >;
	resize: ResizeObserver | null;
}

( function ( window: Window & typeof globalThis ): void {
	'use strict';
	const client = window.TurgenevClient as TurgenevClientApi;
	const colors = [ '#b5ead7', '#ffe299', '#f5a9b8' ];
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
					span.style.color = 'transparent';
					span.style.backgroundColor = colors[ severity( mark ) - 1 ];
					span.textContent = text;
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
		let frame = 0;
		const surfaces = new Map< Document, DecorationSurface >();
		function clearSurface( surface: DecorationSurface ): void {
			const win = surface.doc.defaultView as
				| ( Window & {
						CSS?: { highlights?: Map< string, unknown > };
				  } )
				| null;
			for ( const name of surface.names ) {
				win?.CSS?.highlights?.delete( name );
			}
			surface.names.clear();
			surface.layer?.replaceChildren();
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
			};
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
					const level = severity( mark );
					const name = 'turgenev-' + mark.category + '-' + level;
					if ( win?.CSS?.highlights && win.Highlight ) {
						if ( ! surface.style ) {
							surface.style =
								target.document.createElement( 'style' );
							surface.style.textContent = [
								'style',
								'frequency',
								'keywords',
								'formality',
								'readability',
							]
								.flatMap( ( category ) =>
									colors.map(
										( color, index ) =>
											'::highlight(turgenev-' +
											category +
											'-' +
											( index + 1 ) +
											'){background-color:' +
											color +
											';color:#1e1e1e;}'
									)
								)
								.join( '\n' );
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
						for ( const rect of range.getClientRects() ) {
							const box = target.document.createElement( 'span' );
							box.style.cssText =
								'position:absolute;pointer-events:none;opacity:.45;';
							Object.assign( box.style, {
								left: rect.left + 'px',
								top: rect.top + 'px',
								width: rect.width + 'px',
								height: rect.height + 'px',
								backgroundColor: colors[ level - 1 ],
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
				surface.layer?.remove();
				surface.style?.remove();
			}
			surfaces.clear();
		}
		window.document.addEventListener( 'load', schedule, true );
		return {
			apply( source: SourceSnapshot, data: HighlightsResponseData ) {
				if ( data?.text !== source.text ) {
					throw new Error(
						'Turgenev report text does not match the document.'
					);
				}
				active = {
					source,
					marks: client.validHighlights( data.text, data.marks ),
				};
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
