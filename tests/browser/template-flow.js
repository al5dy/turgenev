// Real controlled core/post-content inside a template, not a post-only editor approximation.
async page => {
	const assert = ( value, message ) => { if ( ! value ) throw new Error( message ); };
	// The analysis payload is the document's own blocks with their text escaped (the provider
	// reads it as HTML and ends sentences at block elements): these read it back.
	const visible = html => html.replace( /<[^>]*>/g, ' ' ).replace( /&nbsp;/g, ' ' ).replace( /&lt;/g, '<' ).replace( /&gt;/g, '>' ).replace( /&amp;/g, '&' ).replace( /\s+/g, ' ' ).trim();
	const onlyBlocks = html => ! /<!--|<(?!\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|h[1-6]|hr|li|main|ol|p|pre|section|table|td|th|tr|ul)>)/.test( html );
	const checks = [];
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	// 'risk' is the overall report's own token; each maps to the provider class that section paints with.
	const markTypes = { risk: [ 'style', 'bb', 2 ], frequency: [ 'frequency', 'doubles', 2 ], style: [ 'style', 'slop', 2 ], keywords: [ 'keywords', 'queries', 1 ], formality: [ 'formality', 'fog', 1 ], readability: [ 'readability', 'fre', 2 ] };
	const submitted = [];
	await page.unroute( '**/analysis' );
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		let data;
		if ( body.operation === 'balance' ) data = { balance: '1' };
		if ( body.operation === 'risk' ) {
			submitted.push( body );
			data = { result: { risk: '5', level: 'medium', link: 'risk12345', details: categories.map( block => ( { block, sum: '1', link: block + '12345' } ) ) } };
		}
		if ( body.operation === 'details' ) data = { details: { params: [] } };
		if ( body.operation === 'highlights' ) {
			const [ category, type, level ] = markTypes[ body.report_token.replace( '12345', '' ) ];
			data = { highlights: { text: body.text, marks: [ ...body.text.matchAll( /\S+/gu ) ].map( match => ( { start: match.index, end: match.index + match[ 0 ].length, category, type, level, sentence: null } ) ) } };
		}
		await route.fulfill( { json: { success: true, data } } );
	} );
	// The accordion replaced per-section "Highlight" buttons: opening a section is what runs
	// its highlight + details requests, so re-highlighting an open one means closing it first.
	const toggles = () => page.locator( '.turgenev-accordion-toggle' );
	const idle = () => page.waitForFunction( () => {
		const panel = document.querySelector( '.turgenev-panel' );
		return panel && panel.getAttribute( 'aria-busy' ) === 'false' && ! panel.querySelector( '.turgenev-accordion .turgenev-spinner' );
	} );
	const open = async index => {
		if ( await toggles().nth( index ).getAttribute( 'aria-expanded' ) === 'true' ) await toggles().nth( index ).click();
		await toggles().nth( index ).click();
		await idle();
	};
	const analyzed = async () => { await toggles().nth( 5 ).waitFor(); await idle(); };
	const reset = () => page.getByRole( 'button', { name: 'Reset view', exact: true } );
	const analyze = () => page.getByRole( 'button', { name: 'Analyze document', exact: true } );
	const state = () => page.evaluate( () => {
		const { postType, postId } = window.smokePost;
		const store = wp.data.select( 'core/block-editor' );
		const docs = TurgenevEditorContent.documents();
		const ranges = docs.flatMap( doc => [ ...doc.defaultView.CSS.highlights ].flatMap( ( [ key, group ] ) => [ ...group ].map( range => ( { key, text: range.toString(), inPost: !!range.startContainer.parentElement.closest( '[data-type="core/post-content"]' ) && !!range.endContainer.parentElement.closest( '[data-type="core/post-content"]' ) } ) ) ) );
		return {
			html: wp.data.select( 'core/editor' ).getEditedPostContent(),
			text: TurgenevEditorContent.snapshot().text,
			template: wp.blocks.serialize( store.getBlocks() ),
			postBlocks: JSON.stringify( store.getBlocksByName( 'core/post-content' ).map( id => store.getBlocks( id ) ) ),
			edits: JSON.stringify( wp.data.select( 'core' ).getEntityRecordEdits( 'postType', postType, postId ) ),
			notices: [ ...document.querySelectorAll( '.turgenev-notice' ) ].map( node => node.textContent ),
			ranges,
		};
	} );
	async function verifyCategories() {
		const original = await state();
		await analyze().click(); await analyzed();
		assert( visible( submitted.at( -1 ).text ) === original.text && onlyBlocks( submitted.at( -1 ).text ), 'The request must contain only the current post body, not template chrome.' );
		for ( let index = 0; index < 6; index++ ) {
			await open( index );
			const result = await state();
			assert( ! result.notices.length, 'Template highlight failed: ' + result.notices.join( '; ' ) );
			assert( result.ranges.length === original.text.match( /\S+/gu ).length, 'Every body word must be highlighted once.' );
			assert( result.ranges.every( range => range.inPost ), 'A highlight escaped into navigation, the template, a query or another entity.' );
			const [ , type, level ] = markTypes[ index ? categories[ index - 1 ] : 'risk' ];
			assert( result.ranges.every( range => range.key === 'turgenev-' + type + level + ( type === 'doubles' ? '-u' : '' ) ), 'Previous category survived a new selection.' );
			for ( const key of [ 'html', 'template', 'postBlocks', 'edits' ] ) assert( result[ key ] === original[ key ], 'Highlight changed ' + key );
			await reset().click();
			assert( !( await state() ).ranges.length, 'Template reset left highlights.' );
		}
	}
	for ( const postType of [ 'post', 'page', 'book' ] ) {
		for ( const iframe of [ false, true ] ) {
			await page.goto( 'http://127.0.0.1:8897/?template=1&postType=' + postType + ( iframe ? '&iframe=1' : '' ) );
			const editor = iframe ? page.frameLocator( 'iframe[name="editor-canvas"]' ) : page;
			await editor.locator( '[data-type="core/post-content"] [contenteditable="true"]' ).first().waitFor();
			await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
			await verifyCategories();
			assert( visible( submitted.at( -1 ).text ) === 'Это тестовый текст с ссылкой и 😀 словами. Первый абзац. Второй абзац.', 'Repeated header/footer text contaminated the submitted body.' );
			checks.push( postType + ( iframe ? ' iframe' : ' inline' ) + ': controlled Content root, all categories, exact reset, unchanged post/template' );
		}
	}
	await page.evaluate( () => {
		const el = wp.element.createElement;
		wp.blocks.registerBlockType( 'smoke/custom-copy', {
			apiVersion: 3, title: 'Custom copy', category: 'text', attributes: { copy: { type: 'string', default: 'Текст стороннего блока.' } },
			edit: ( { attributes } ) => el( 'div', wp.blockEditor.useBlockProps(), el( 'p', null, 'Editor-only instructions', el( 'span', null, attributes.copy ) ) ),
			save: ( { attributes } ) => el( 'article', null, attributes.copy ),
		} );
		const b = wp.blocks.createBlock;
		const blocks = [
			b( 'core/group', {}, [ b( 'core/columns', {}, [ b( 'core/column', {}, [ b( 'core/heading', { content: 'Заголовок внутри колонки' } ), b( 'core/paragraph', { content: 'Первый абзац.' } ) ] ), b( 'core/column', {}, [ b( 'core/paragraph', { content: 'Второй <strong>абзац</strong>.' } ), b( 'core/image', { url: 'https://example.test/image.png', caption: 'Подпись изображения', alt: 'Not analyzed' } ) ] ) ] ) ] ),
			b( 'core/details', { summary: 'Закрытый раздел' }, [ b( 'core/paragraph', { content: 'Содержимое закрытого раздела.' } ) ] ),
			b( 'core/table', { body: [ { cells: [ { tag: 'td', content: 'Ячейка один' }, { tag: 'td', content: 'Ячейка два' } ] } ] } ),
			b( 'smoke/custom-copy' ),
		];
		const { postType, postId } = window.smokePost;
		wp.data.dispatch( 'core' ).editEntityRecord( 'postType', postType, postId, { content: wp.blocks.serialize( blocks ), blocks } );
	} );
	await page.frameLocator( 'iframe[name="editor-canvas"]' ).getByText( 'Заголовок внутри колонки', { exact: true } ).waitFor();
	await verifyCategories();
	checks.push( 'nested columns, image caption, closed details, table, third-party block with editor-only help' );
	// Gutenberg versions may keep Details open while editing. Simulate a block
	// UI collapsing a field without changing its persisted attributes or content.
	await page.frameLocator( 'iframe[name="editor-canvas"]' ).getByText( 'Содержимое закрытого раздела.', { exact: true } ).evaluate( node => { node.style.display = 'none'; } );
	await open( 2 );
	await page.locator( '.turgenev-highlight-text-content' ).waitFor();
	await page.screenshot( { path: 'output/playwright/template-complex-highlights.png' } );
	await reset().click();
	await page.evaluate( () => {
		const b = wp.blocks.createBlock;
		const { postType, postId } = window.smokePost;
		wp.data.dispatch( 'core' ).receiveEntityRecords( 'postType', 'wp_block', { id: 123, type: 'wp_block', title: 'Shared copy', content: wp.blocks.serialize( [ b( 'core/paragraph', { content: 'Текст синхронизированного блока.' } ) ] ) } );
		const blocks = [ b( 'core/paragraph', { content: 'До общего блока.' } ), b( 'core/block', { ref: 123 } ), b( 'core/paragraph', { content: 'После общего блока.' } ) ];
		wp.data.dispatch( 'core' ).editEntityRecord( 'postType', postType, postId, { content: wp.blocks.serialize( blocks ), blocks } );
	} );
	await page.frameLocator( 'iframe[name="editor-canvas"]' ).getByText( 'Текст синхронизированного блока.', { exact: true } ).waitFor();
	await verifyCategories();
	assert( submitted.at( -1 ).text.replace( />\s+</g, '><' ) === '<p>До общего блока.</p><p>Текст синхронизированного блока.</p><p>После общего блока.</p>', 'Synced pattern content was omitted from paid analysis.' );
	await page.evaluate( () => {
		wp.data.dispatch( 'core' ).editEntityRecord( 'postType', 'wp_block', 123, { content: '<!-- wp:paragraph --><p>Изменённый общий текст.</p><!-- /wp:paragraph -->', blocks: undefined } );
	} );
	await page.getByText( 'Content changed. Analyze the document again.', { exact: true } ).waitFor();
	checks.push( 'synced pattern body included in analysis, controlled descendants highlighted, edits invalidate stale reports' );
	await page.evaluate( () => {
		const el = wp.element.createElement;
		wp.blocks.registerBlockType( 'smoke/non-rendered-copy', {
			apiVersion: 3, title: 'Non-rendered copy', category: 'text', attributes: { copy: { type: 'string', default: 'Скрытый текст <img src=x onerror=alert(1)>.' } },
			edit: () => el( 'div', wp.blockEditor.useBlockProps(), 'This widget has no text preview.' ),
			save: ( { attributes } ) => el( 'p', null, attributes.copy ),
		} );
		const b = wp.blocks.createBlock, { postType, postId } = window.smokePost;
		const blocks = [ b( 'core/paragraph', { content: 'Обычный видимый текст.' } ), b( 'smoke/non-rendered-copy' ) ];
		wp.data.dispatch( 'core' ).editEntityRecord( 'postType', postType, postId, { content: wp.blocks.serialize( blocks ), blocks } );
	} );
	await page.frameLocator( 'iframe[name="editor-canvas"]' ).getByText( 'Обычный видимый текст.', { exact: true } ).waitFor();
	const hiddenOriginal = await state();
	await analyze().click(); await analyzed();
	for ( let index = 0; index < 6; index++ ) {
		await open( index );
		await page.locator( '.turgenev-highlight-text-content mark' ).first().waitFor();
		const result = await state();
		assert( ! result.notices.length && result.ranges.length === 3, 'A non-rendered widget discarded valid in-place highlights.' );
		assert( await page.locator( '.turgenev-highlight-text-content' ).textContent() === hiddenOriginal.text, 'Read-only fallback omitted analyzed text.' );
		assert( ! await page.locator( '.turgenev-highlight-text-content img, .turgenev-highlight-text-content script' ).count(), 'Fallback interpreted untrusted content as markup.' );
		for ( const key of [ 'html', 'template', 'postBlocks', 'edits' ] ) assert( result[ key ] === hiddenOriginal[ key ], 'Fallback changed ' + key );
		await reset().click();
		assert( ! await page.locator( '.turgenev-highlight-text' ).count() && !( await state() ).ranges.length, 'Reset left a read-only fallback or native highlight.' );
	}
	checks.push( 'non-rendered third-party content: all fragments in local read-only fallback, native marks retained, no markup execution, exact reset' );
	const overlap = await page.evaluate( () => {
		const host = document.createElement( 'div' );
		TurgenevUI.renderHighlightText( host, { text: 'A B C', marks: [ { start: 0, end: 5, category: 'style', type: 'slop', level: 1, sentence: null }, { start: 2, end: 3, category: 'keywords', type: 'cqueries', level: 2, sentence: null } ] } );
		return { text: host.textContent, spans: [ ...host.children ].map( mark => ( { text: mark.textContent, color: mark.style.color } ) ) };
	} );
	assert( overlap.text === 'A B C' && overlap.spans.length === 3 && overlap.spans[ 0 ].color === overlap.spans[ 2 ].color && overlap.spans[ 1 ].color !== overlap.spans[ 0 ].color, 'Overlapping fallback ranges must retain the strongest severity without losing text.' );
	await page.evaluate( results => { window.templateSmokeResults = results; }, checks );
}
