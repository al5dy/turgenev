( function ( wp ) {
	const { createElement: el, useState } = wp.element;
	const { BlockEditorProvider, BlockList, BlockInspector, WritingFlow, ObserveTyping } = wp.blockEditor;
	wp.blockLibrary.registerCoreBlocks();
	const initialBlocks = [
		wp.blocks.createBlock( 'core/paragraph', { content: 'Это <strong>тестовый</strong> текст с <a href="https://example.org">ссылкой</a> и&nbsp;😀 словами.' } ),
		wp.blocks.createBlock( 'core/group', {}, [
			wp.blocks.createBlock( 'core/paragraph', { content: 'Первый <em>абзац</em>.' } ),
			wp.blocks.createBlock( 'core/paragraph', { content: 'Второй абзац.' } ),
		] ),
		wp.blocks.createBlock( 'core/image', { url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/%3E', alt: 'Not document text' } ),
	];
	wp.data.dispatch( 'core' ).addEntities( [ { kind: 'postType', name: 'post', baseURL: '/wp/v2/posts', key: 'id' } ] );
	const initialContent = window.smokeInitialContent ?? wp.blocks.serialize( wp.blocks.parse( wp.blocks.serialize( initialBlocks ) ) );
	wp.data.dispatch( 'core' ).receiveEntityRecords( 'postType', 'post', { id: 42, type: 'post', status: 'draft', content: initialContent, title: 'Smoke document' } );
	const editorStore = wp.data.dispatch( 'core/editor' );
	if ( editorStore.setEditedPost ) { editorStore.setEditedPost( 'post', 42 ); }
	else { editorStore.setupEditorState( { type: 'post', id: 42 } ); }
	function RegistryProbe() {
		window.smokeRegistry = wp.data.useRegistry();
		return null;
	}
	function Editor() {
		const [ codeMode, setCodeMode ] = useState( false );
		const iframeMode = new URLSearchParams( window.location.search ).has( 'iframe' );
		// Use the real saved-post lifecycle: opening a document must not create block edits.
		const [ blocks, onInput, onChange ] = wp.coreData.useEntityBlockEditor( 'postType', 'post', { id: 42 } );
		return el( wp.components.SlotFillProvider, null,
			el( BlockEditorProvider, { value: blocks, onInput, onChange, useSubRegistry: false, settings: { hasFixedToolbar: false } },
				el( RegistryProbe ),
				el( 'main', { style: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: '40px', padding: '30px' } },
					el( 'div', { className: 'editor-styles-wrapper' },
						el( 'button', { onClick: () => setCodeMode( ! codeMode ) }, codeMode ? 'Switch to visual editor' : 'Switch to code editor' ),
						codeMode ? el( wp.editor.PostTextEditor ) : iframeMode
							? el( wp.blockEditor.__unstableIframe, { name: 'editor-canvas', style: { height: '600px', width: '100%' } }, el( BlockList ) )
							: el( WritingFlow, null, el( ObserveTyping, null, el( BlockList ) ) )
					),
					el( 'aside', null, el( wp.editor.PluginDocumentSettingPanel.Slot ), el( BlockInspector ) )
				),
				el( wp.components.Popover.Slot )
			),
			el( wp.plugins.PluginArea )
		);
	}
	wp.element.createRoot( document.getElementById( 'editor' ) ).render( el( Editor ) );
} )( window.wp );
