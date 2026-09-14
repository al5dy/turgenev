( function ( window, wp ) {
	'use strict';
	if (
		! wp?.editor?.PluginDocumentSettingPanel ||
		! wp.plugins ||
		! window.TurgenevAnalysis
	) {
		return;
	}
	const { createElement: el, useEffect, useMemo, useRef } = wp.element;
	const { __ } = wp.i18n;
	const content = window.TurgenevEditorContent;

	function PanelContent( { session } ) {
		const host = useRef( null );
		useEffect(
			() => window.TurgenevAnalysis.mount( host.current, session ),
			[ session ]
		);
		return el( 'div', { ref: host } );
	}

	function DocumentPanel() {
		const registry = wp.data.useRegistry();
		const session = useMemo(
			() =>
				window.TurgenevAnalysis.create(
					() => content.snapshot( registry ),
					window.TurgenevHighlights.create(
						( source ) => content.targets( source, registry ),
						content.documents
					)
				),
			[ registry ]
		);
		useEffect( () => {
			const panelName = 'turgenev/document';
			const store = registry.select( 'core/editor' );
			const actions = registry.dispatch( 'core/editor' );
			if ( ! store.isEditorPanelOpened( panelName ) ) {
				actions.toggleEditorPanelOpened( panelName );
			}
			session.balance();
			const unsubscribe = registry.subscribe( session.invalidate );
			return () => {
				unsubscribe();
				session.dispose();
			};
		}, [ registry, session ] );
		return el(
			wp.editor.PluginDocumentSettingPanel,
			{
				name: 'document',
				title: __( 'Turgenev', 'turgenev' ),
				className: 'turgenev-document-panel',
			},
			el( PanelContent, { session } )
		);
	}
	wp.plugins.registerPlugin( 'turgenev', {
		render: DocumentPanel,
		icon: 'editor-spellcheck',
	} );
} )( window, window.wp );
