( function ( window: Window & typeof globalThis, document: Document ): void {
	'use strict';
	const client = window.TurgenevClient as TurgenevClientApi;
	function visualEditor(): TinyMCEEditor | null {
		const editor = window.tinymce?.get( 'content' );
		return editor && ! editor.isHidden() ? editor : null;
	}
	function editorHTML(): string {
		return (
			visualEditor()?.getContent() ??
			( document.getElementById( 'content' ) as HTMLTextAreaElement | null )
				?.value ??
			''
		);
	}
	function getSource(): SourceSnapshot {
		const raw = editorHTML();
		// The Text tab holds paragraphs as blank lines; WordPress only turns them into <p>
		// on output (wpautop). Restore them, as the Visual tab already has them, so each
		// paragraph ends its sentences for the provider exactly as the published one does.
		const autop = window.wp?.editor?.autop;
		const html = visualEditor() || ! autop ? raw : autop( raw );
		return { html, text: client.toPlainText( html ), key: raw };
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
				// The editor's own markup, never the autop'd analysis copy of it.
				() => [ { key: 'content', html: editorHTML() } ],
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
		// The block editor shows the provider's risk warning in its notices area; here it is
		// the same message as a standard admin notice under the screen title, with the same
		// lifetime: up while "Overall risk" is open and loaded, replaced when the verdict
		// changes, and a dismissed one stays away until then.
		let riskNotice: HTMLElement | null = null;
		let shownWarning: string | null = null;
		session.subscribe( ( state ) => {
			const warning = client.sessionRiskWarning( state );
			const message = warning?.message ?? null;
			if ( message === shownWarning ) {
				return;
			}
			shownWarning = message;
			riskNotice?.remove();
			riskNotice = null;
			if ( ! warning ) {
				return;
			}
			const notice = ( window.TurgenevUI as TurgenevUIApi ).renderRiskNotice(
				warning,
				() => {
					riskNotice = null;
				}
			);
			const headerEnd = document.querySelector( '.wp-header-end' );
			if ( headerEnd ) {
				headerEnd.after( notice );
			} else {
				panel.before( notice );
			}
			riskNotice = notice;
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
