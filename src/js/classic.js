( function ( window, document ) {
	'use strict';
	const client = window.TurgenevClient;
	function visualEditor() {
		const editor = window.tinymce?.get( 'content' );
		return editor && ! editor.isHidden() ? editor : null;
	}
	function getSource() {
		const html =
			visualEditor()?.getContent() ??
			document.getElementById( 'content' )?.value ??
			'';
		return { html, text: client.toPlainText( html ), key: html };
	}
	function targets( source ) {
		const editor = visualEditor();
		if ( ! editor ) {
			const model = client.textareaTarget(
				document.getElementById( 'content' )
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
	function start() {
		const panel = document.getElementById( 'turgenev-panel' );
		if ( ! panel ) {
			return;
		}
		const settings = panel.dataset.turgenevSettings === '1';
		const decorations = window.TurgenevHighlights.create( targets, () => {
			const doc = visualEditor()?.getDoc();
			return doc ? [ doc ] : [];
		} );
		const session = window.TurgenevAnalysis.create(
			getSource,
			decorations,
			window.TurgenevContentReset.create(
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
						const textarea = document.getElementById( 'content' );
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
		window.TurgenevAnalysis.mount( panel, session, { settings } );
		const textarea = document.getElementById( 'content' );
		textarea?.addEventListener( 'input', session.invalidate );
		textarea?.addEventListener( 'change', session.invalidate );
		const bound = new Set();
		function bind( editor ) {
			if ( editor?.id !== 'content' || bound.has( editor ) ) {
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
