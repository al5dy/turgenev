( function ( window, document, wp ) {
	'use strict';

	if ( ! window.TurgenevConfig || ! wp || ! wp.i18n ) {
		return;
	}

	const { __ } = wp.i18n;
	const config = window.TurgenevConfig;
	const HIGHLIGHT_FORMAT = 'turgenev/highlight';

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

	async function request( operation, parameters = {} ) {
		const body = new URLSearchParams( {
			action: 'turgenev_api',
			nonce: config.nonce,
			operation,
			...parameters,
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
			} );
		} catch {
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

		return payload.data || {};
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
		cell.textContent = String( text ?? '' );
		if ( className ) {
			cell.className = className;
		}
		return cell;
	}

	function appendReportActions( cell, token, onHighlight ) {
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
		appendReportActions( summary, data.link, options.onHighlight );
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
			appendReportActions( linkCell, detail.link, options.onHighlight );
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

	function ensureHighlightFormat() {
		if ( ! wp.richText ) {
			throw new Error(
				__( 'Gutenberg rich text is unavailable.', 'turgenev' )
			);
		}

		const richTextStore =
			wp.data && typeof wp.data.select === 'function'
				? wp.data.select( 'core/rich-text' )
				: null;
		if (
			richTextStore &&
			typeof richTextStore.getFormatType === 'function' &&
			richTextStore.getFormatType( HIGHLIGHT_FORMAT )
		) {
			return;
		}

		wp.richText.registerFormatType( HIGHLIGHT_FORMAT, {
			title: __( 'Turgenev highlight', 'turgenev' ),
			tagName: 'span',
			className: 'turgenev-highlight',
			attributes: {
				'data-turgenev-category': 'data-turgenev-category',
				'data-turgenev-level': 'data-turgenev-level',
			},
			edit: () => null,
		} );
	}

	function clearHighlights( html ) {
		ensureHighlightFormat();
		const value = wp.richText.create( { html: String( html || '' ) } );
		if (
			! value.formats.some( ( formats ) =>
				formats?.some( ( format ) => format.type === HIGHLIGHT_FORMAT )
			)
		) {
			return { html: String( html || '' ), text: value.text };
		}
		const cleared = wp.richText.removeFormat(
			value,
			HIGHLIGHT_FORMAT,
			0,
			value.text.length
		);

		return {
			html: wp.richText.toHTMLString( {
				value: cleared,
				preserveWhiteSpace: true,
			} ),
			text: cleared.text,
		};
	}

	function applyHighlights( html, data ) {
		if ( ! data || typeof data.text !== 'string' ) {
			throw new Error(
				__( 'Turgenev returned invalid highlight data.', 'turgenev' )
			);
		}

		const cleared = clearHighlights( html );
		const source = normalizedTextOffsets( cleared.text );
		if ( source.text !== data.text ) {
			throw new Error(
				__(
					'The selected block changed since this report was created.',
					'turgenev'
				)
			);
		}

		const marks = validHighlights( data.text, data.marks );

		let value = wp.richText.create( { html: cleared.html } );
		marks.forEach( ( mark ) => {
			const start = source.offsets[ mark.start ];
			const end = source.offsets[ mark.end ];
			if ( ! Number.isInteger( start ) || ! Number.isInteger( end ) ) {
				throw new Error(
					__(
						'Turgenev returned invalid highlight data.',
						'turgenev'
					)
				);
			}

			value = wp.richText.applyFormat(
				value,
				{
					type: HIGHLIGHT_FORMAT,
					attributes: {
						'data-turgenev-category': mark.category,
						'data-turgenev-level': String( mark.level ),
					},
				},
				start,
				end
			);
		} );

		return wp.richText.toHTMLString( { value, preserveWhiteSpace: true } );
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
		const numeric = Number.parseFloat( String( balance ) );
		container.textContent = `${ String( balance ) } ₽`;
		container.classList.toggle(
			'is-low',
			Number.isFinite( numeric ) && numeric < 1
		);
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

	function toPlainText( html ) {
		const parser = new window.DOMParser();
		const parsed = parser.parseFromString(
			String( html || '' ),
			'text/html'
		);
		return parsed.body ? parsed.body.textContent || '' : '';
	}

	window.TurgenevClient = Object.freeze( {
		normalizedTextOffsets,
		validHighlights,
		ensureHighlightFormat,
		applyHighlights,
		clearHighlights,
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
