( function ( window, document, wp ) {
	'use strict';

	if ( ! window.TurgenevConfig || ! wp || ! wp.i18n ) {
		return;
	}

	const { __ } = wp.i18n;
	const config = window.TurgenevConfig;

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

	function appendReportLink( cell, token ) {
		if ( typeof token !== 'string' || ! token ) {
			return;
		}
		const link = document.createElement( 'a' );
		link.href = `${ config.reportBaseUrl }${ encodeURIComponent( token ) }`;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		link.textContent = __( 'Open report', 'turgenev' );
		cell.appendChild( link );
	}

	function renderResult( container, data ) {
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
		summaryRow.appendChild( summary );
		tbody.appendChild( summaryRow );

		if ( data.link ) {
			const reportRow = document.createElement( 'tr' );
			reportRow.appendChild(
				makeCell( 'th', __( 'Detailed report', 'turgenev' ) )
			);
			const reportCell = document.createElement( 'td' );
			appendReportLink( reportCell, data.link );
			reportRow.appendChild( reportCell );
			tbody.appendChild( reportRow );
		}

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
			appendReportLink( linkCell, detail.link );
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
