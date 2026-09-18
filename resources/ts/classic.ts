( function ( window: Window & typeof globalThis, document: Document ): void {
	'use strict';
	const client = window.TurgenevClient as TurgenevClientApi;
	function visualEditor(): TinyMCEEditor | null {
		const editor = window.tinymce?.get( 'content' );
		return editor && ! editor.isHidden() ? editor : null;
	}
	function getSource(): SourceSnapshot {
		const html =
			visualEditor()?.getContent() ??
			( document.getElementById( 'content' ) as HTMLTextAreaElement | null )
				?.value ??
			'';
		return { html, text: client.toPlainText( html ), key: html };
	}
	function targets( source: SourceSnapshot ): AnalysisTarget[] {
		const editor = visualEditor();
		if ( ! editor ) {
			const model = client.textareaTarget(
				document.getElementById( 'content' ) as HTMLTextAreaElement | null
			);
			return model?.text === source.text
				? [ { ...model, offset: 0 } ]
				: [];
		}
		const model = client.textModel( editor.getBody(), true );
		return model.text === source.text
			? [ { ...model, document: editor.getDoc(), offset: 0 } ]
			: [];
	}
	function start(): void {
		const panel = document.getElementById( 'turgenev-panel' );
		if ( ! panel ) {
			return;
		}
		const settings = panel.dataset.turgenevSettings === '1';
		const decorations = ( window.TurgenevHighlights as TurgenevHighlightsApi ).create(
			targets,
			() => {
				const doc = visualEditor()?.getDoc();
				return doc ? [ doc ] : [];
			}
		);
		const session = ( window.TurgenevAnalysis as TurgenevAnalysisApi ).create(
			getSource,
			decorations,
			( window.TurgenevContentReset as TurgenevContentResetApi ).create(
				() => [ { key: 'content', html: getSource().html } ],
				( [ { html } ] ) => {
					const editor = visualEditor();
					if ( editor ) {
						const bookmark = editor.selection.getBookmark(
							2,
							true
						);
						editor.undoManager.transact( () => {
							editor.setContent( html );
							editor.selection.moveToBookmark( bookmark );
						} );
						editor.save();
						editor.setDirty( true );
					} else {
						const textarea = document.getElementById(
							'content'
						) as HTMLTextAreaElement | null;
						if ( textarea ) {
							textarea.value = html;
							textarea.dispatchEvent(
								new window.Event( 'input', { bubbles: true } )
							);
							textarea.dispatchEvent(
								new window.Event( 'change', { bubbles: true } )
							);
						}
					}
				}
			)
		);
		( window.TurgenevAnalysis as TurgenevAnalysisApi ).mount( panel, session, {
			settings,
			highlights: client.highlightsAvailable,
		} );
		const textarea = document.getElementById( 'content' );
		textarea?.addEventListener( 'input', session.invalidate );
		textarea?.addEventListener( 'change', session.invalidate );
		const bound = new Set< TinyMCEEditor >();
		function bind( editor: TinyMCEEditor | null | undefined ): void {
			if ( ! editor || editor.id !== 'content' || bound.has( editor ) ) {
				return;
			}
			bound.add( editor );
			editor.on(
				'input change undo redo SetContent',
				session.invalidate
			);
		}
		bind( window.tinymce?.get( 'content' ) );
		window.tinymce?.on( 'AddEditor', ( event ) => bind( event.editor ) );
		// Includes mode switching and programmatic textarea updates without change events.
		const timer = window.setInterval( session.invalidate, 500 );
		window.addEventListener(
			'pagehide',
			() => {
				window.clearInterval( timer );
				session.dispose();
			},
			{ once: true }
		);
		session.balance();
		window.TGEV = Object.freeze( {
			checkBalance: session.balance,
			checkContent: session.analyze,
		} );
	}
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', start, { once: true } );
	} else {
		start();
	}
} )( window, document );
