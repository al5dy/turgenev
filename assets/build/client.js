( function ( window, document, wp ) {
	'use strict';

	if ( ! window.TurgenevConfig || ! wp || ! wp.i18n ) {
		return;
	}

	const { __ } = wp.i18n;
	const config = window.TurgenevConfig;
	const textareaModels = new WeakMap();
	const blockBoundary =
		/^(ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGCAPTION|FIGURE|H[1-6]|HR|LI|MAIN|OL|P|PRE|SECTION|TABLE|TD|TH|TR|UL)$/;

	function apiErrorMessage( payload, fallback ) {
		if (
			payload &&
			payload.data &&
			typeof payload.data.message === 'string' &&
			payload.data.message.trim()
		) {
			return payload.data.message;
		}
		return fallback;
	}

	async function request( operation, parameters = {}, signal ) {
		const body = new URLSearchParams( {
			action: 'turgenev_api',
			...parameters,
			nonce: config.nonce,
			operation,
			post_id: String( parameters.post_id ?? config.postId ?? 0 ),
		} );

		let response;
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

		let payload;
		try {
			payload = await response.json();
		} catch {
			throw new Error(
				__( 'WordPress returned an invalid response.', 'turgenev' )
			);
		}

		if ( ! response.ok || ! payload || payload.success !== true ) {
			throw new Error(
				apiErrorMessage(
					payload,
					__( 'Turgenev request failed.', 'turgenev' )
				)
			);
		}

		if (
			! payload.data ||
			typeof payload.data !== 'object' ||
			Array.isArray( payload.data )
		) {
			throw new Error(
				__( 'WordPress returned an invalid response.', 'turgenev' )
			);
		}
		return payload.data;
	}

	function blockLabel( key ) {
		const labels = {
			frequency: __( 'Frequency', 'turgenev' ),
			style: __( 'Style', 'turgenev' ),
			keywords: __( 'Keywords', 'turgenev' ),
			formality: __( 'Formality', 'turgenev' ),
			readability: __( 'Readability', 'turgenev' ),
		};
		return labels[ key ] || String( key || '' );
	}

	function makeCell( tag, text, className = '' ) {
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

	function appendReportActions( cell, token, onHighlight, activeToken ) {
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

	function renderResult( container, data, options = {} ) {
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

	function validHighlights( text, marks ) {
		const allowedCategories = new Set( [
			'frequency',
			'formality',
			'keywords',
			'readability',
			'style',
		] );
		if (
			! Array.isArray( marks ) ||
			marks.length > 20000 ||
			marks.some(
				( mark ) =>
					! (
						mark &&
						typeof mark === 'object' &&
						Number.isInteger( mark.start ) &&
						Number.isInteger( mark.end ) &&
						mark.start >= 0 &&
						mark.end > mark.start &&
						mark.end <= text.length &&
						allowedCategories.has( mark.category ) &&
						Number.isInteger( mark.level ) &&
						mark.level >= 1 &&
						mark.level <= 3
					)
			)
		) {
			throw new Error(
				__( 'Turgenev returned invalid highlight data.', 'turgenev' )
			);
		}
		return [ ...marks ].sort( ( left, right ) => left.start - right.start );
	}

	function normalizedTextOffsets( text ) {
		let normalized = '';
		let sourceOffset = 0;
		let whitespaceStart = null;
		let whitespaceEnd = null;
		const offsets = [];

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
				offsets[ normalized.length ] = whitespaceEnd;
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

	function renderMessage( container, message, type = 'error' ) {
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

	function renderBalance( container, balance ) {
		if ( ! container ) {
			return;
		}
		const empty = isEmptyBalance( balance );
		container.textContent = `${ String( balance ) } ₽`;
		container.classList.toggle( 'is-low', empty );
	}

	function setBusy( panel, busy ) {
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
	function textModel( root, editor = false ) {
		let raw = '';
		const points = [];
		function walk( node ) {
			if ( node.nodeType === 3 ) {
				for ( let i = 0; i < node.data.length; i++ ) {
					points[ raw.length ] = { node, offset: i };
					raw += node.data[ i ];
				}
				return;
			}
			if ( node.nodeType !== 1 ) {
				return;
			}
			if (
				/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|SVG|CANVAS|IFRAME)$/.test(
					node.tagName
				) ||
				node.hidden ||
				node.getAttribute( 'aria-hidden' ) === 'true' ||
				( editor &&
					node.matches(
						'button, input, select, textarea, [data-mce-bogus="all"], .block-editor-block-toolbar, .block-editor-block-list__insertion-point'
					) )
			) {
				return;
			}
			const separated = blockBoundary.test( node.tagName );
			if ( separated ) {
				raw += ' ';
			}
			node.childNodes.forEach( walk );
			if ( separated ) {
				raw += ' ';
			}
		}
		walk( root );
		const model = normalizedTextOffsets( raw );
		function range( start, end ) {
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
		return { text: model.text, range };
	}

	function toPlainText( html ) {
		const parsed = new window.DOMParser().parseFromString(
			String( html || '' ),
			'text/html'
		);
		return textModel( parsed.body ).text;
	}

	// Map decoded text back to literal HTML offsets, including entities and split inline tags.
	// The native parser remains the authority: never apply a guessed source mapping.
	function sourceModel( html ) {
		const parser = new window.DOMParser();
		const tokens =
			/<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?[a-zA-Z][\w:-]*(?:[^>"']|"[^"]*"|'[^']*')*>|&(?:#[xX][\da-fA-F]+;?|#\d+;?|[a-zA-Z][a-zA-Z\d]+;?)/g;
		const points = [];
		let raw = '',
			cursor = 0;
		function append( value, start, end = null ) {
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
						.textContent,
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
			ranges( start, end ) {
				const ranges = [];
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

	function textareaTarget( textarea ) {
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

	function alignTargets( text, models, offset = 0 ) {
		const targets = [];
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
		const unambiguous = [];
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

	function isEmptyBalance( balance ) {
		return (
			typeof balance === 'string' &&
			/^(?:-\d+(?:\.\d+)?|0+(?:\.0+)?)$/.test( balance )
		);
	}

	window.TurgenevClient = Object.freeze( {
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
	} );
	window.TurgenevUI = Object.freeze( {
		renderBalance,
		renderMessage,
		renderResult,
		setBusy,
	} );
} )( window, document, window.wp );
