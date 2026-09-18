( function ( window: Window & typeof globalThis, wp: WPGlobal | undefined ): void {
	'use strict';
	if (
		! wp?.editor?.PluginDocumentSettingPanel ||
		! wp.plugins ||
		! window.TurgenevAnalysis
	) {
		return;
	}
	const editorModule: WPEditorModule = wp.editor;
	const pluginsModule: WPPluginsModule = wp.plugins;
	const analysisApi: TurgenevAnalysisApi = window.TurgenevAnalysis;
	const { createElement: el, useEffect, useMemo, useRef } =
		wp.element as WPElementModule;
	const { __ } = wp.i18n as WPI18nModule;
	const contentApi = window.TurgenevEditorContent as TurgenevEditorContentApi;
	const clientApi = window.TurgenevClient as TurgenevClientApi;
	const dataModule = wp.data as WPDataRegistry;

	function PanelContent( { session }: { session: AnalysisSession } ): unknown {
		const host = useRef< HTMLElement >( null );
		useEffect(
			() =>
				analysisApi.mount( host.current as HTMLElement, session, {
					highlights: clientApi.highlightsAvailable,
				} ),
			[ session ]
		);
		return el( 'div', { ref: host } );
	}

	function DocumentPanel(): unknown {
		const registry = dataModule.useRegistry();
		const session = useMemo(
			() =>
				analysisApi.create(
					() => contentApi.snapshot( registry ),
					( window.TurgenevHighlights as TurgenevHighlightsApi ).create(
						( source ) => contentApi.targets( source, registry ),
						contentApi.documents
					),
					contentApi.createReset( registry )
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
			editorModule.PluginDocumentSettingPanel,
			{
				name: 'document',
				title: __( 'Turgenev', 'turgenev' ),
				className: 'turgenev-document-panel',
			},
			el( PanelContent, { session } )
		);
	}
	pluginsModule.registerPlugin( 'turgenev', {
		render: DocumentPanel,
		icon: 'editor-spellcheck',
	} );
} )( window, window.wp );
