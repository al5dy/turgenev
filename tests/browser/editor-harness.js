( function ( wp ) {
	const { createElement: el, useState } = wp.element;
	const { BlockEditorProvider, BlockList, BlockInspector, WritingFlow, ObserveTyping } = wp.blockEditor;
	const params = new URLSearchParams( window.location.search );
	const postType = window.smokePostType || params.get( 'postType' ) || 'post';
	const postId = window.smokePostId || 42;
	const templateMode = params.has( 'template' );
	window.smokePost = { postType, postId };
	wp.blockLibrary.registerCoreBlocks();
	const initialBlocks = [
		wp.blocks.createBlock( 'core/paragraph', { content: 'Это <strong>тестовый</strong> текст с <a href="https://example.org">ссылкой</a> и&nbsp;😀 словами.' } ),
		wp.blocks.createBlock( 'core/group', {}, [
			wp.blocks.createBlock( 'core/paragraph', { content: 'Первый <em>абзац</em>.' } ),
			wp.blocks.createBlock( 'core/paragraph', { content: 'Второй абзац.' } ),
		] ),
		wp.blocks.createBlock( 'core/image', { url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="80" height="40"/%3E', alt: 'Not document text' } ),
	];
	wp.data.dispatch( 'core' ).addEntities( [ ...new Set( [ 'post', postType, 'wp_template', 'wp_template_part', 'wp_block' ] ) ].map( name => ( { kind: 'postType', name, baseURL: '/wp/v2/' + name, key: 'id' } ) ) );
	const initialContent = window.smokeInitialContent ?? wp.blocks.serialize( wp.blocks.parse( wp.blocks.serialize( initialBlocks ) ) );
	wp.data.dispatch( 'core' ).receiveEntityRecords( 'postType', postType, { id: postId, type: postType, status: 'draft', content: initialContent, title: 'Smoke document', meta: {} } );
	const b = wp.blocks.createBlock;
	const templateBlocks = window.smokeTemplateContent ? wp.blocks.parse( window.smokeTemplateContent ) : [
		b( 'core/group', { tagName: 'header' }, [ b( 'core/navigation', {}, [ b( 'core/navigation-link', { label: 'Первый абзац.', url: '#' } ), b( 'core/navigation-link', { label: 'Второй абзац.', url: '#' } ) ] ) ] ),
		b( 'core/group', { tagName: 'main' }, [ b( 'core/heading', { content: 'Текст шаблона' } ), b( 'core/group', {}, [ b( 'core/post-content' ) ] ) ] ),
		b( 'core/group', { tagName: 'footer' }, [ b( 'core/paragraph', { content: 'Первый абзац. Второй абзац.' } ) ] ),
	];
	wp.data.dispatch( 'core' ).receiveEntityRecords( 'postType', 'wp_template', { id: 'smoke//page', type: 'wp_template', content: wp.blocks.serialize( templateBlocks ), title: 'Page template' } );
	for ( const entity of window.smokeEntities || [] ) wp.data.dispatch( 'core' ).receiveEntityRecords( 'postType', entity.type, entity );
	const editorStore = wp.data.dispatch( 'core/editor' );
	if ( editorStore.setEditedPost ) { editorStore.setEditedPost( postType, postId ); }
	else { editorStore.setupEditorState( { type: postType, id: postId } ); }
	function RegistryProbe() {
		window.smokeRegistry = wp.data.useRegistry();
		return null;
	}
	function Editor() {
		const [ codeMode, setCodeMode ] = useState( false );
		const iframeMode = new URLSearchParams( window.location.search ).has( 'iframe' );
		// Use the real saved-post lifecycle: opening a document must not create block edits.
		const [ blocks, onInput, onChange ] = wp.coreData.useEntityBlockEditor( 'postType', templateMode ? 'wp_template' : postType, { id: templateMode ? 'smoke//page' : postId } );
		return el( wp.components.SlotFillProvider, null,
			el( wp.blockEditor.BlockContextProvider, { value: { postId, postType } },
			el( BlockEditorProvider, { value: blocks, onInput, onChange, useSubRegistry: false, settings: { hasFixedToolbar: false } },
				el( RegistryProbe ),
				el( 'header', { className: 'editor-header edit-post-header' },
					el( 'div', { className: 'editor-header__toolbar' } )
				),
				el( 'main', { style: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: '40px', padding: '30px' } },
					el( 'div', { className: 'editor-styles-wrapper' },
						el( 'button', { onClick: () => setCodeMode( ! codeMode ) }, codeMode ? 'Switch to visual editor' : 'Switch to code editor' ),
						codeMode ? el( wp.editor.PostTextEditor ) : iframeMode
							? el( wp.blockEditor.__unstableIframe, { name: 'editor-canvas', style: { height: '600px', width: '100%' } }, el( BlockList ) )
							: el( WritingFlow, null, el( ObserveTyping, null, el( BlockList ) ) )
					),
					el( 'aside', { className: 'interface-interface-skeleton__sidebar' }, el( BlockInspector ) )
				),
				el( wp.components.Popover.Slot )
			),
			),
			el( wp.plugins.PluginArea )
		);
	}
	wp.element.createRoot( document.getElementById( 'editor' ) ).render( el( Editor ) );
} )( window.wp );
