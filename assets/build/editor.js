( function ( window, wp ) {
	'use strict';

	if ( ! window.TurgenevClient || ! window.TurgenevUI || ! wp ) {
		return;
	}

	const editor = wp.editor || wp.editPost;
	if ( ! editor || ! wp.plugins || ! wp.element || ! wp.components || ! wp.data || ! wp.i18n ) {
		return;
	}

	const { __ } = wp.i18n;
	const { registerPlugin } = wp.plugins;
	const { PluginDocumentSettingPanel, PluginSidebar, PluginSidebarMoreMenuItem } = editor;
	const { Button, PanelBody, ToggleControl, Notice, Spinner } = wp.components;
	const { createElement: el, Fragment, useEffect, useRef, useState } = wp.element;
	const client = window.TurgenevClient;
	const ui = window.TurgenevUI;
	const pluginTitle = __( 'Turgenev', 'turgenev' );

	function PluginIcon() {
		return el(
			'svg',
			{ viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': 'true' },
			el( 'path', { d: 'M5 4v3h5.5v12h3V7H19V4z' } )
		);
	}

	function SetupNotice() {
		if ( client.isConfigured ) {
			return null;
		}

		return el(
			Notice,
			{ status: 'warning', isDismissible: false },
			el( 'p', null, __( 'Turgenev is ready, but an API key has not been configured yet.', 'turgenev' ) ),
			el(
				'a',
				{ href: client.settingsUrl, className: 'components-button is-primary' },
				__( 'Configure API key', 'turgenev' )
			)
		);
	}

	function AnalysisPanel( { withPanelBody = false } = {} ) {
		const [ plainText, setPlainText ] = useState( true );
		const [ busy, setBusy ] = useState( false );
		const [ balance, setBalance ] = useState( null );
		const [ error, setError ] = useState( '' );
		const resultRef = useRef( null );

		async function refreshBalance() {
			if ( ! client.isConfigured ) {
				setBalance( null );
				return;
			}

			try {
				const data = await client.request( 'balance' );
				setBalance( data.balance ?? '—' );
			} catch ( exception ) {
				setError( exception.message || __( 'Could not load balance.', 'turgenev' ) );
			}
		}

		useEffect( () => {
			refreshBalance();
		}, [] );

		async function analyze() {
			if ( ! client.isConfigured ) {
				setError( __( 'Configure a Turgenev API key before running an analysis.', 'turgenev' ) );
				return;
			}

			const editorStore = wp.data.select( 'core/editor' );
			let content = editorStore ? editorStore.getEditedPostAttribute( 'content' ) : '';
			content = String( content || '' );
			if ( plainText ) {
				content = client.toPlainText( content );
			}
			content = content.trim();

			if ( ! content ) {
				setError( __( 'Add content to the editor before running Turgenev.', 'turgenev' ) );
				return;
			}
			if ( content.length > client.maxTextLength ) {
				setError( __( 'The content is longer than the maximum size accepted by Turgenev.', 'turgenev' ) );
				return;
			}

			setBusy( true );
			setError( '' );
			if ( resultRef.current ) {
				resultRef.current.replaceChildren();
			}

			try {
				const data = await client.request( 'risk', { text: content } );
				ui.renderResult( resultRef.current, data.result || {} );
				await refreshBalance();
			} catch ( exception ) {
				setError( exception.message || __( 'Content analysis failed.', 'turgenev' ) );
			} finally {
				setBusy( false );
			}
		}

		const body = el(
			'div',
			{ className: `turgenev-panel${ busy ? ' is-busy' : '' }`, 'aria-busy': busy ? 'true' : 'false' },
			el( SetupNotice ),
			el(
				'p',
				null,
				__( 'Current balance:', 'turgenev' ),
				' ',
				el(
					'strong',
					{ className: Number.parseFloat( String( balance ) ) < 1 ? 'is-low' : '' },
					client.isConfigured ? ( balance === null ? '…' : `${ balance } ₽` ) : '—'
				)
			),
			error ? el( Notice, { status: 'error', isDismissible: true, onRemove: () => setError( '' ) }, error ) : null,
			el( ToggleControl, {
				label: __( 'Analyze plain text only', 'turgenev' ),
				help: __( 'Remove HTML markup before sending the text to Turgenev.', 'turgenev' ),
				checked: plainText,
				onChange: setPlainText,
			} ),
			el( Button, { variant: 'primary', onClick: analyze, disabled: busy || ! client.isConfigured }, busy ? el( Spinner ) : __( 'Analyze content', 'turgenev' ) ),
			el( 'div', { ref: resultRef, className: 'turgenev-result-host' } ),
			el(
				'a',
				{
					href: 'https://turgenev.ashmanov.com/?a=pay',
					target: '_blank',
					rel: 'noopener noreferrer',
					className: 'components-button is-secondary turgenev-top-up',
				},
				__( 'Top up balance', 'turgenev' )
			)
		);

		return withPanelBody
			? el( PanelBody, { title: __( 'Content analysis', 'turgenev' ), initialOpen: true }, body )
			: body;
	}

	function TurgenevIntegration() {
		// Preferred integration: visible directly in the standard post Settings sidebar.
		if ( PluginDocumentSettingPanel ) {
			return el(
				PluginDocumentSettingPanel,
				{
					name: 'turgenev-analysis',
					title: pluginTitle,
					className: 'turgenev-document-panel',
				},
				el( AnalysisPanel )
			);
		}

		// Compatibility fallback for editor implementations without PluginDocumentSettingPanel.
		if ( ! PluginSidebar ) {
			return null;
		}

		const items = [];
		if ( PluginSidebarMoreMenuItem ) {
			items.push(
				el( PluginSidebarMoreMenuItem, { key: 'menu', target: 'turgenev-sidebar', icon: el( PluginIcon ) }, pluginTitle )
			);
		}
		items.push(
			el( PluginSidebar, { key: 'sidebar', name: 'turgenev-sidebar', title: pluginTitle, icon: el( PluginIcon ) }, el( AnalysisPanel, { withPanelBody: true } ) )
		);
		return el( Fragment, null, ...items );
	}

	registerPlugin( 'turgenev', {
		render: TurgenevIntegration,
		icon: el( PluginIcon ),
	} );
} )( window, window.wp );
