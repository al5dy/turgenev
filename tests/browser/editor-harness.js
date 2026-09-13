( function ( wp ) {
	const { createElement: el, useState } = wp.element;
	const { BlockEditorProvider, BlockList, BlockInspector, WritingFlow, ObserveTyping } = wp.blockEditor;
	wp.blockLibrary.registerCoreBlocks();
	function RegistryProbe() {
		window.smokeRegistry = wp.data.useRegistry();
		return null;
	}
	function Editor() {
		const [ blocks, setBlocks ] = useState( () => [
			wp.blocks.createBlock( 'core/paragraph', { content: 'Это <strong>тестовый</strong> текст с <a href="https://example.org">ссылкой</a> и&nbsp;😀 словами.' } ),
			wp.blocks.createBlock( 'core/group', {}, [
				wp.blocks.createBlock( 'core/paragraph', { content: 'Первый <em>абзац</em>.' } ),
				wp.blocks.createBlock( 'core/paragraph', { content: 'Второй абзац.' } ),
			] ),
		] );
		return el( wp.components.SlotFillProvider, null,
			el( BlockEditorProvider, { value: blocks, onInput: setBlocks, onChange: setBlocks, settings: { hasFixedToolbar: false } },
				el( RegistryProbe ),
				el( 'main', { style: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: '40px', padding: '30px' } },
					el( 'div', { className: 'editor-styles-wrapper' }, el( WritingFlow, null, el( ObserveTyping, null, el( BlockList ) ) ) ),
					el( 'aside', null, el( BlockInspector ) )
				),
				el( wp.components.Popover.Slot )
			)
		);
	}
	wp.element.createRoot( document.getElementById( 'editor' ) ).render( el( Editor ) );
} )( window.wp );
