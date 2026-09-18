( function ( window: Window & typeof globalThis, document: Document, wp: WPGlobal | undefined ): void {
	'use strict';

	const maybeConfig = window.TurgenevConfig;
	const i18n = wp?.i18n;
	if ( ! maybeConfig || ! wp || ! i18n ) {
		return;
	}
	// Rebind with a definite type: nested function declarations below don't
	// retain the narrowing from the guard above.
	const config: TurgenevConfigShape = maybeConfig;

	const { __ } = i18n;
	const textareaModels = new WeakMap<
		HTMLTextAreaElement,
		{ html: string; model: SourceModel | null }
	>();
	const blockBoundary =
		/^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|H[1-6]|HR|LI|MAIN|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;

	function apiErrorMessage( payload: unknown, fallback: string ): string {
		if ( payload && typeof payload === 'object' ) {
			const data = ( payload as { data?: unknown } ).data;
			if (
				data &&
				typeof data === 'object' &&
				typeof ( data as { message?: unknown } ).message === 'string' &&
				( data as { message: string } ).message.trim()
			) {
				return ( data as { message: string } ).message;
			}
		}
		return fallback;
	}

	async function request< T >(
		operation: string,
		parameters: Record< string, unknown > = {},
		signal?: AbortSignal
	): Promise< T > {
		const params: Record< string, string > = { action: 'turgenev_api' };
		for ( const [ key, value ] of Object.entries( parameters ) ) {
			params[ key ] = String( value );
		}
		params.nonce = config.nonce;
		params.operation = operation;
		params.post_id = String( parameters.post_id ?? config.postId ?? 0 );
		const body = new URLSearchParams( params );

		let response: Response;
		try {
			response = await window.fetch( config.ajaxUrl, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type':
						'application/x-www-form-urlencoded; charset=UTF-8',
				},
				body: body.toString(),
				signal,
			} );
		} catch ( error ) {
			if ( signal?.aborted ) {
				throw error;
			}
			throw new Error(
				__(
					'Could not connect to WordPress. Check your network connection and try again.',
					'turgenev'
				)
			);
		}

		let payload: unknown;
		try {
			payload = await response.json();
		} catch {
			throw new Error(
				__( 'WordPress returned an invalid response.', 'turgenev' )
			);
		}

		if (
			! response.ok ||
			! payload ||
			typeof payload !== 'object' ||
			( payload as { success?: unknown } ).success !== true
		) {
			throw new Error(
				apiErrorMessage(
					payload,
					__( 'Turgenev request failed.', 'turgenev' )
				)
			);
		}

		const data = ( payload as { data?: unknown } ).data;
		if ( ! data || typeof data !== 'object' || Array.isArray( data ) ) {
			throw new Error(
				__( 'WordPress returned an invalid response.', 'turgenev' )
			);
		}
		return data as T;
	}

	function blockLabel( key: unknown ): string {
		const labels: Record< string, string > = {
			frequency: __( 'Frequency', 'turgenev' ),
			style: __( 'Style', 'turgenev' ),
			keywords: __( 'Keywords', 'turgenev' ),
			formality: __( 'Formality', 'turgenev' ),
			readability: __( 'Readability', 'turgenev' ),
		};
		return ( typeof key === 'string' && labels[ key ] ) || String( key || '' );
	}

	function makeCell(
		tag: 'th' | 'td',
		text: unknown,
		className = ''
	): HTMLTableCellElement {
		const cell = document.createElement( tag );
		if ( tag === 'th' ) {
			cell.scope = 'row';
		}
		cell.textContent = String( text ?? '' );
		if ( className ) {
			cell.className = className;
		}
		return cell;
	}

	function appendReportActions(
		cell: HTMLElement,
		token: unknown,
		onHighlight: ( ( token: string ) => unknown ) | undefined,
		activeToken: string | null | undefined
	): void {
		if ( typeof token !== 'string' || ! token ) {
			return;
		}

		const actions = document.createElement( 'span' );
		actions.className = 'turgenev-report-actions';
		const link = document.createElement( 'a' );
		link.href = `${ config.reportBaseUrl }${ encodeURIComponent( token ) }`;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.textContent = __( 'Open report', 'turgenev' );
		actions.appendChild( link );

		if ( typeof onHighlight === 'function' ) {
			const button = document.createElement( 'button' );
			button.type = 'button';
			button.className =
				'button button-secondary turgenev-highlight-action';
			button.textContent = __( 'Highlight', 'turgenev' );
			button.setAttribute(
				'aria-pressed',
				String( token === activeToken )
			);
			button.addEventListener( 'click', async () => {
				button.disabled = true;
				try {
					await onHighlight( token );
				} finally {
					button.disabled = false;
				}
			} );
			actions.appendChild( button );
		}

		cell.appendChild( actions );
	}

	function renderResult(
		container: HTMLElement | null,
		data: RiskResult,
		options: {
			onHighlight?: ( token: string ) => unknown;
			activeToken?: string | null;
		} = {}
	): void {
		if ( ! container ) {
			return;
		}

		container.replaceChildren();
		const wrapper = document.createElement( 'div' );
		wrapper.className = 'turgenev-table-wrap';
		const table = document.createElement( 'table' );
		table.className = 'widefat striped turgenev-results';
		const tbody = document.createElement( 'tbody' );

		const summaryRow = document.createElement( 'tr' );
		summaryRow.appendChild(
			makeCell( 'th', __( 'Overall risk', 'turgenev' ) )
		);
		const summary = makeCell(
			'td',
			`${ String( data.level || '—' ) } (${ String( data.risk ?? '—' ) })`
		);
		appendReportActions(
			summary,
			data.link,
			options.onHighlight,
			options.activeToken
		);
		summaryRow.appendChild( summary );
		tbody.appendChild( summaryRow );

		const details = Array.isArray( data.details ) ? data.details : [];
		details.forEach( ( detail ) => {
			if ( ! detail || typeof detail !== 'object' ) {
				return;
			}

			const heading = document.createElement( 'tr' );
			heading.className = 'turgenev-result-section';
			heading.appendChild(
				makeCell(
					'th',
					`${ blockLabel( detail.block ) } (${ String(
						detail.sum ?? '—'
					) })`
				)
			);
			const linkCell = document.createElement( 'td' );
			appendReportActions(
				linkCell,
				detail.link,
				options.onHighlight,
				options.activeToken
			);
			heading.appendChild( linkCell );
			tbody.appendChild( heading );

			const params = Array.isArray( detail.params ) ? detail.params : [];
			params.forEach( ( parameter ) => {
				if ( ! parameter || typeof parameter !== 'object' ) {
					return;
				}
				const row = document.createElement( 'tr' );
				row.appendChild( makeCell( 'th', parameter.name || '—' ) );
				row.appendChild(
					makeCell(
						'td',
						`${ String( parameter.value ?? '—' ) } (${ String(
							parameter.score ?? '0'
						) })`
					)
				);
				tbody.appendChild( row );
			} );
		} );

		table.appendChild( tbody );
		wrapper.appendChild( table );
		container.appendChild( wrapper );
	}

	function validHighlights( text: string, marks: unknown ): HighlightMark[] {
		const allowedCategories = new Set< string >( [
			'frequency',
			'formality',
			'keywords',
			'readability',
			'style',
		] );
		if (
			! Array.isArray( marks ) ||
			marks.length > 20000 ||
			marks.some( ( mark: unknown ) => {
				if ( ! mark || typeof mark !== 'object' ) {
					return true;
				}
				const candidate = mark as {
					start?: unknown;
					end?: unknown;
					category?: unknown;
					level?: unknown;
				};
				return ! (
					Number.isInteger( candidate.start ) &&
					Number.isInteger( candidate.end ) &&
					( candidate.start as number ) >= 0 &&
					( candidate.end as number ) > ( candidate.start as number ) &&
					( candidate.end as number ) <= text.length &&
					allowedCategories.has( candidate.category as string ) &&
					Number.isInteger( candidate.level ) &&
					( candidate.level as number ) >= 1 &&
					( candidate.level as number ) <= 3
				);
			} )
		) {
			throw new Error(
				__( 'Turgenev returned invalid highlight data.', 'turgenev' )
			);
		}
		return [ ...( marks as HighlightMark[] ) ].sort(
			( left, right ) => left.start - right.start
		);
	}

	function normalizedTextOffsets( text: string ): {
		text: string;
		offsets: number[];
	} {
		let normalized = '';
		let sourceOffset = 0;
		let whitespaceStart: number | null = null;
		let whitespaceEnd: number | null = null;
		const offsets: number[] = [];

		for ( const character of text ) {
			const nextOffset = sourceOffset + character.length;
			if ( /[\s\u00a0]/u.test( character ) ) {
				if ( normalized ) {
					whitespaceStart ??= sourceOffset;
					whitespaceEnd = nextOffset;
				}
				sourceOffset = nextOffset;
				continue;
			}

			if ( null !== whitespaceStart ) {
				offsets[ normalized.length ] = whitespaceStart;
				normalized += ' ';
				offsets[ normalized.length ] = whitespaceEnd as number;
				whitespaceStart = null;
				whitespaceEnd = null;
			}

			offsets[ normalized.length ] = sourceOffset;
			normalized += character;
			offsets[ normalized.length ] = nextOffset;
			sourceOffset = nextOffset;
		}

		return { text: normalized, offsets };
	}

	function renderMessage(
		container: HTMLElement | null,
		message: unknown,
		type = 'error'
	): void {
		if ( ! container ) {
			return;
		}
		container.replaceChildren();
		if ( ! message ) {
			return;
		}
		const notice = document.createElement( 'p' );
		notice.className = `turgenev-notice is-${ type }`;
		notice.textContent = String( message );
		container.appendChild( notice );
	}

	function renderBalance( container: HTMLElement | null, balance: unknown ): void {
		if ( ! container ) {
			return;
		}
		const empty = isEmptyBalance( balance );
		container.textContent = `${ String( balance ) } ₽`;
		container.classList.toggle( 'is-low', empty );
	}

	function setBusy( panel: HTMLElement | null, busy: unknown ): void {
		if ( ! panel ) {
			return;
		}
		panel.classList.toggle( 'is-busy', Boolean( busy ) );
		panel.setAttribute( 'aria-busy', busy ? 'true' : 'false' );
		panel.querySelectorAll( 'button' ).forEach( ( button ) => {
			button.disabled = Boolean( busy );
		} );
	}

	// One whitespace model for requests and read-only DOM highlight ranges.
	function textModel( root: Element, editor = false ): TextModel {
		let raw = '';
		const points: { node: Text; offset: number }[] = [];
		function walk( node: Node ): void {
			// nodeType, not `instanceof Text`/`instanceof Element`: this often walks
			// nodes owned by another window (the block editor's iframe), and instanceof
			// checks against this window's constructors silently fail across realms.
			if ( node.nodeType === 3 ) {
				const text = node as Text;
				for ( let i = 0; i < text.data.length; i++ ) {
					points[ raw.length ] = { node: text, offset: i };
					raw += text.data[ i ];
				}
				return;
			}
			if ( node.nodeType !== 1 ) {
				return;
			}
			const element = node as Element;
			if (
				/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|SVG|CANVAS|IFRAME)$/.test(
					element.tagName
				) ||
				( element as HTMLElement ).hidden ||
				element.getAttribute( 'aria-hidden' ) === 'true' ||
				( editor &&
					element.matches(
						'button, input, select, textarea, [data-mce-bogus="all"], .block-editor-block-toolbar, .block-editor-block-list__insertion-point'
					) )
			) {
				return;
			}
			const separated = blockBoundary.test( element.tagName );
			if ( separated ) {
				raw += ' ';
			}
			element.childNodes.forEach( walk );
			if ( separated ) {
				raw += ' ';
			}
		}
		walk( root );
		const model = normalizedTextOffsets( raw );
		let hiddenOffsets: Uint32Array | null = null;
		function isVisible( start: number, end: number ): boolean {
			if ( ! hiddenOffsets ) {
				const visibleNodes = new WeakMap< Text, boolean >();
				const offsets = new Uint32Array( raw.length + 1 );
				for ( let i = 0; i < raw.length; i++ ) {
					offsets[ i + 1 ] = offsets[ i ];
					const point = points[ i ];
					if ( ! point || /\s/u.test( raw[ i ] ) ) {
						continue;
					}
					if ( ! visibleNodes.has( point.node ) ) {
						const probe = root.ownerDocument.createRange();
						probe.selectNodeContents( point.node );
						visibleNodes.set(
							point.node,
							probe.getClientRects().length > 0
						);
					}
					if ( ! visibleNodes.get( point.node ) ) {
						offsets[ i + 1 ]++;
					}
				}
				hiddenOffsets = offsets;
			}
			return (
				hiddenOffsets[ model.offsets[ start ] ] ===
				hiddenOffsets[ model.offsets[ end ] ]
			);
		}
		function range( start: number, end: number ): Range | null {
			let first = model.offsets[ start ];
			let last = model.offsets[ end ] - 1;
			if ( ! Number.isInteger( first ) || ! Number.isInteger( last ) ) {
				return null;
			}
			while ( first <= last && ! points[ first ] ) {
				first++;
			}
			while ( last >= first && ! points[ last ] ) {
				last--;
			}
			if ( ! points[ first ] || ! points[ last ] ) {
				return null;
			}
			const result = root.ownerDocument.createRange();
			result.setStart( points[ first ].node, points[ first ].offset );
			result.setEnd( points[ last ].node, points[ last ].offset + 1 );
			return result;
		}
		return { text: model.text, range, isVisible };
	}

	function toPlainText( html: unknown ): string {
		const parsed = new window.DOMParser().parseFromString(
			String( html || '' ),
			'text/html'
		);
		return textModel( parsed.body, false ).text;
	}

	// Map decoded text back to literal HTML offsets, including entities and split inline tags.
	// The native parser remains the authority: never apply a guessed source mapping.
	function sourceModel( html: string ): SourceModel | null {
		const parser = new window.DOMParser();
		const tokens =
			/<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?[a-zA-Z][\w:-]*(?:[^>"']|"[^"]*"|'[^']*')*>|&(?:#[xX][\da-fA-F]+;?|#\d+;?|[a-zA-Z][a-zA-Z\d]+;?)/g;
		const points: ( { start: number; end: number } | undefined )[] = [];
		let raw = '',
			cursor = 0;
		function append(
			value: string,
			start: number,
			end: number | null = null
		): void {
			for ( let i = 0; i < value.length; i++ ) {
				points[ raw.length ] = {
					start: end === null ? start + i : start,
					end: end === null ? start + i + 1 : end,
				};
				raw += value[ i ];
			}
		}
		for (
			let token = tokens.exec( html );
			token;
			token = tokens.exec( html )
		) {
			append( html.slice( cursor, token.index ), cursor );
			cursor = tokens.lastIndex;
			if ( token[ 0 ][ 0 ] === '&' ) {
				append(
					parser.parseFromString( token[ 0 ], 'text/html' ).body
						.textContent ?? '',
					token.index,
					cursor
				);
				continue;
			}
			const tag = /^<(\/?)([\w:-]+)/.exec( token[ 0 ] );
			if ( ! tag ) {
				continue;
			}
			const name = tag[ 2 ].toUpperCase();
			if (
				! tag[ 1 ] &&
				/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|SVG|CANVAS|IFRAME)$/.test(
					name
				)
			) {
				const close = new RegExp( '</' + name + '\\s*>', 'ig' );
				close.lastIndex = cursor;
				cursor = close.exec( html ) ? close.lastIndex : html.length;
				tokens.lastIndex = cursor;
			} else if ( blockBoundary.test( name ) ) {
				raw += ' ';
			}
		}
		append( html.slice( cursor ), cursor );
		const model = normalizedTextOffsets( raw );
		if ( model.text !== toPlainText( html ) ) {
			return null;
		}
		return {
			text: model.text,
			ranges( start: number, end: number ) {
				const ranges: { start: number; end: number }[] = [];
				for (
					let i = model.offsets[ start ];
					i < model.offsets[ end ];
					i++
				) {
					const point = points[ i ];
					if ( ! point ) {
						continue;
					}
					const previous = ranges.at( -1 );
					if ( previous && point.start <= previous.end ) {
						previous.end = Math.max( previous.end, point.end );
					} else {
						ranges.push( { ...point } );
					}
				}
				return ranges;
			},
		};
	}

	function textareaTarget(
		textarea: HTMLTextAreaElement | null | undefined
	): TextareaTarget | null {
		if ( ! textarea?.getClientRects().length ) {
			return null;
		}
		let cached = textareaModels.get( textarea );
		if ( cached?.html !== textarea.value ) {
			cached = {
				html: textarea.value,
				model: sourceModel( textarea.value ),
			};
			textareaModels.set( textarea, cached );
		}
		const model = cached.model;
		return model
			? { ...model, textarea, document: textarea.ownerDocument }
			: null;
	}

	function alignTargets< T extends { text: string } >(
		text: string,
		models: ( T | null | undefined )[],
		offset = 0
	): ( T & { offset: number } )[] {
		const targets: ( T & { offset: number } )[] = [];
		let cursor = 0;
		for ( const model of models ) {
			if ( ! model?.text ) {
				continue;
			}
			const start = text.indexOf( model.text, cursor );
			if ( start < 0 ) {
				continue;
			}
			targets.push( { ...model, offset: offset + start } );
			cursor = start + model.text.length;
		}
		// Repeated text must have the same placement from both ends. Otherwise a
		// missing editor field could shift a later occurrence onto an earlier one.
		cursor = text.length;
		const unambiguous: ( T & { offset: number } )[] = [];
		for ( const target of targets.reverse() ) {
			const start = text.lastIndexOf(
				target.text,
				cursor - target.text.length
			);
			if ( start === target.offset - offset ) {
				unambiguous.push( target );
			}
			cursor = start;
		}
		return unambiguous.reverse();
	}

	function isEmptyBalance( balance: unknown ): boolean {
		return (
			typeof balance === 'string' &&
			/^(?:-\d+(?:\.\d+)?|0+(?:\.0+)?)$/.test( balance )
		);
	}

	function highlightLevel( mark: HighlightMark ): number {
		if ( [ 'keywords', 'readability' ].includes( mark.category ) ) {
			return 3;
		}
		return mark.category === 'formality' ? 2 : mark.level;
	}

	function renderHighlightText(
		container: HTMLElement,
		data: { text: string; marks: unknown }
	): void {
		const marks = validHighlights( data.text, data.marks );
		const events = new Map< number, { level: number; delta: number }[] >();
		for ( const mark of marks ) {
			const level = highlightLevel( mark );
			for ( const [ position, delta ] of [
				[ mark.start, 1 ],
				[ mark.end, -1 ],
			] ) {
				let list = events.get( position );
				if ( ! list ) {
					list = [];
					events.set( position, list );
				}
				list.push( { level, delta } );
			}
		}
		const counts = [ 0, 0, 0, 0 ];
		const colors = [ '', '#b5ead7', '#ffe299', '#f5a9b8' ];
		let cursor = 0;
		container.replaceChildren();
		for ( const position of [ ...events.keys(), data.text.length ].sort(
			( a, b ) => a - b
		) ) {
			if ( position > cursor ) {
				const value = data.text.slice( cursor, position );
				const level =
					[ 3, 2, 1 ].find(
						( candidate ) => counts[ candidate ] > 0
					) || 0;
				if ( level ) {
					const mark =
						container.ownerDocument.createElement( 'mark' );
					mark.style.backgroundColor = colors[ level ];
					mark.textContent = value;
					container.appendChild( mark );
				} else {
					container.appendChild(
						container.ownerDocument.createTextNode( value )
					);
				}
			}
			for ( const { level, delta } of events.get( position ) || [] ) {
				counts[ level ] += delta;
			}
			cursor = position;
		}
	}

	window.TurgenevClient = Object.freeze( {
		highlightLevel,
		normalizedTextOffsets,
		textModel,
		sourceModel,
		textareaTarget,
		alignTargets,
		isEmptyBalance,
		validHighlights,
		request,
		toPlainText,
		maxTextLength: Number( config.maxTextLength ) || 20000,
		isConfigured: Boolean( config.isConfigured ),
		settingsUrl:
			typeof config.settingsUrl === 'string' ? config.settingsUrl : '',
		topUpUrl: typeof config.topUpUrl === 'string' ? config.topUpUrl : '',
		highlightsAvailable: Boolean( config.highlightsAvailable ),
	} );
	window.TurgenevUI = Object.freeze( {
		renderHighlightText,
		renderBalance,
		renderMessage,
		renderResult,
		setBusy,
	} );
} )( window, document, window.wp );
