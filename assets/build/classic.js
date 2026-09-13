( function ( window, document, wp ) {
	'use strict';

	if ( ! window.TurgenevClient || ! window.TurgenevUI || ! wp || ! wp.i18n ) {
		return;
	}

	const { __ } = wp.i18n;
	const client = window.TurgenevClient;
	const ui = window.TurgenevUI;

	function getEditorContent() {
		if ( window.tinymce && typeof window.tinymce.get === 'function' ) {
			const editor = window.tinymce.get( 'content' );
			if ( editor && typeof editor.getContent === 'function' ) {
				return editor.getContent();
			}
		}

		const textarea = document.getElementById( 'content' );
		return textarea && typeof textarea.value === 'string'
			? textarea.value
			: '';
	}

	async function refreshBalance( panel ) {
		const balance = document.getElementById( 'turgenev-balance' );
		if ( ! balance ) {
			return;
		}
		if ( ! client.isConfigured ) {
			balance.textContent = '—';
			return;
		}

		const message = document.getElementById( 'turgenev-message' );
		ui.setBusy( panel, true );
		ui.renderMessage( message, '' );
		try {
			const data = await client.request( 'balance' );
			ui.renderBalance( balance, data.balance );
		} catch ( error ) {
			balance.textContent = '—';
			ui.renderMessage(
				message,
				error.message || __( 'Could not load balance.', 'turgenev' )
			);
		} finally {
			ui.setBusy( panel, false );
		}
	}

	async function analyzeContent( panel ) {
		if ( ! client.isConfigured ) {
			const message = document.getElementById( 'turgenev-message' );
			ui.renderMessage(
				message,
				__(
					'Configure a Turgenev API key before running an analysis.',
					'turgenev'
				)
			);
			return;
		}

		const rawToggle = document.getElementById( 'turgenev-raw' );
		let content = getEditorContent();

		if ( rawToggle && rawToggle.checked ) {
			content = client.toPlainText( content );
		}
		content = String( content || '' ).trim();
		const message = document.getElementById( 'turgenev-message' );

		if ( ! content ) {
			ui.renderMessage(
				message,
				__(
					'Add content to the editor before running Turgenev.',
					'turgenev'
				)
			);
			return;
		}

		if ( content.length > client.maxTextLength ) {
			ui.renderMessage(
				message,
				__(
					'The content is longer than the maximum size accepted by Turgenev.',
					'turgenev'
				)
			);
			return;
		}

		const table = document.getElementById( 'turgenev-table' );
		ui.setBusy( panel, true );
		ui.renderMessage( message, '' );
		if ( table ) {
			table.replaceChildren();
		}

		try {
			const data = await client.request( 'risk', { text: content } );
			ui.renderResult( table, data.result || {} );
			await refreshBalance( panel );
		} catch ( error ) {
			ui.renderMessage(
				message,
				error.message || __( 'Content analysis failed.', 'turgenev' )
			);
		} finally {
			ui.setBusy( panel, false );
		}
	}

	document.addEventListener( 'DOMContentLoaded', () => {
		const panel = document.getElementById( 'turgenev-panel' );
		if ( ! panel ) {
			return;
		}

		const balanceButton = panel.querySelector( '[data-turgenev-balance]' );
		if ( balanceButton ) {
			balanceButton.addEventListener( 'click', () =>
				refreshBalance( panel )
			);
		}

		const checkButton = panel.querySelector( '[data-turgenev-check]' );
		if ( checkButton ) {
			checkButton.addEventListener( 'click', () =>
				analyzeContent( panel )
			);
		}

		if ( client.isConfigured ) {
			refreshBalance( panel );
		}

		// Backward-compatible facade for integrations that called the old global object.
		window.TGEV = Object.freeze( {
			checkBalance: () => refreshBalance( panel ),
			checkContent: () => analyzeContent( panel ),
		} );
	} );
} )( window, document, window.wp );
