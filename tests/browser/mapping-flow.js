// Full editor coverage, including raw HTML: real WordPress components, mocked remote responses.
async page => {
	const assert = ( value, message ) => { if ( ! value ) throw new Error( message ); };
	const checks = [];
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	await page.unroute( '**/analysis' );
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		let data;
		if ( body.operation === 'balance' ) data = { balance: '1' };
		if ( body.operation === 'risk' ) data = { result: { risk: '5', level: 'medium', link: 'risk12345', details: categories.map( block => ( { block, sum: '1', link: block + '12345', params: [] } ) ) } };
		if ( body.operation === 'highlights' ) {
			const category = body.report_token.replace( '12345', '' );
			data = { highlights: { text: body.text, marks: [ ...body.text.matchAll( /\S+/gu ) ].map( match => ( { start: match.index, end: match.index + match[ 0 ].length, category: category === 'risk' ? 'style' : category, level: 2 } ) ) } };
		}
		await route.fulfill( { json: { success: true, data } } );
	} );
	const analyze = () => page.getByRole( 'button', { name: 'Analyze document', exact: true } );
	const action = index => page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( index );
	const reset = () => page.getByRole( 'button', { name: 'Reset view', exact: true } );
	const openPanel = () => page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
	await page.goto( 'http://127.0.0.1:8897/' );
	await openPanel();
	await analyze().waitFor();
	const sourceMapping = await page.evaluate( () => {
		const samples = [
			[ '<p>сло<strong>во</strong> &amp; &#x1F600;</p>', 'слово & 😀', [ 'слово', '&amp;', '&#x1F600;' ] ],
			[ '<!-- wp:paragraph {"content":"Ignored"} --><p>Один&nbsp;\r\n два</p><!-- /wp:paragraph -->', 'Один два', [ 'Один', 'два' ] ],
			[ '<section><h2>Первый</h2><div>Второй<br>третий</div></section>', 'Первый Второй третий', [ 'Первый', 'Второй', 'третий' ] ],
			[ '<p title="fake > text">Повтор</p><script>ignored <p>stuff</p></script><p>Повтор</p>', 'Повтор Повтор', [ 'Повтор', 'Повтор' ] ],
		];
		return samples.map( ( [ html, text, expected ] ) => {
			const model = TurgenevClient.sourceModel( html );
			return model?.text === text && JSON.stringify( [ ...text.matchAll( /\S+/gu ) ].map( match => model.ranges( match.index, match.index + match[ 0 ].length ).map( range => html.slice( range.start, range.end ) ).join( '' ) ) ) === JSON.stringify( expected );
		} );
	} );
	assert( sourceMapping.every( Boolean ), 'HTML source offsets must preserve inline splits, entities, emoji, comments and repeated words.' );
	checks.push( 'exact HTML offsets and entities, comments excluded, split inline text and repeated words' );
	await page.evaluate( () => {
		const b = wp.blocks.createBlock;
		const blocks = [
			b( 'core/heading', { content: 'Точный заголовок' } ),
			b( 'core/paragraph', { content: 'Повтор <strong>сло</strong>во &amp; 😀.' } ),
			b( 'core/group', {}, [ b( 'core/paragraph', { content: 'Повтор в группе.' } ), b( 'core/html', { content: '<p>HTML <em>слово</em> &amp; &#x1F600;.</p>' } ), b( 'core/paragraph', { content: 'Соседний абзац.' } ) ] ),
			b( 'core/list', {}, [ b( 'core/list-item', { content: 'Первый пункт' } ), b( 'core/list-item', { content: 'Второй пункт' }, [ b( 'core/list', {}, [ b( 'core/list-item', { content: 'Вложенный пункт' } ) ] ) ] ) ] ),
			b( 'core/quote', { citation: 'Автор цитаты' }, [ b( 'core/paragraph', { content: 'Слова цитаты.' } ) ] ),
			b( 'core/table', { body: [ { cells: [ { content: 'Ячейка один', tag: 'td' }, { content: 'Ячейка два', tag: 'td' } ] } ] } ),
			b( 'core/image', { url: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="20"/%3E', alt: 'Ignored alt', caption: 'Подпись изображения' } ),
			b( 'core/buttons', {}, [ b( 'core/button', { text: 'Текст кнопки', url: 'https://example.test' } ) ] ),
			b( 'core/code', { content: 'Код &lt;тест&gt;' } ),
		];
		window.smokeRegistry.dispatch( 'core/block-editor' ).resetBlocks( blocks );
	} );
	await page.getByText( 'Точный заголовок', { exact: true } ).waitFor();
	await analyze().click(); await action( 5 ).waitFor();
	const original = await page.evaluate( () => wp.data.select( 'core/editor' ).getEditedPostContent() );
	for ( let i = 0; i < 6; i++ ) {
		await action( i ).click();
		await page.waitForFunction( () => document.querySelector( '.turgenev-highlight-action[aria-pressed="true"]' ) );
		const status = await page.evaluate( () => {
			const source = TurgenevEditorContent.snapshot();
			const covered = new Uint8Array( source.text.length );
			for ( const target of TurgenevEditorContent.targets( source ) ) covered.fill( 1, target.offset, target.offset + target.text.length );
			const missing = [ ...source.text.matchAll( /\S+/gu ) ].filter( m => ! covered.slice( m.index, m.index + m[ 0 ].length ).every( Boolean ) ).map( m => m[ 0 ] );
			return { missing, notices: [ ...document.querySelectorAll( '.turgenev-notice' ) ].map( n => n.textContent ), categories: [ ...CSS.highlights.keys() ], raw: [ ...document.querySelectorAll( '.turgenev-source-mark' ) ].map( n => n.dataset.category ), html: wp.data.select( 'core/editor' ).getEditedPostContent() };
		} );
		assert( status.missing.length === 0, 'Unmapped Gutenberg text: ' + status.missing.join( ', ' ) );
		assert( ! status.notices.length, 'Highlight produced a notice: ' + status.notices.join( ', ' ) );
		const category = i ? categories[ i - 1 ] : 'style';
		assert( status.categories.length && status.categories.every( name => name.startsWith( 'turgenev-' + category + '-' ) ) && status.raw.every( value => value === category ), 'Wrong category: ' + JSON.stringify( { category, visual: status.categories, raw: status.raw } ) );
		assert( status.html === original, 'Mixed block highlighting changed serialized post content.' );
	}
	await page.evaluate( () => {
		const registry = window.smokeRegistry;
		registry.dispatch( 'core/block-editor' ).toggleBlockMode( registry.select( 'core/block-editor' ).getBlocks()[ 2 ].innerBlocks[ 0 ].clientId );
	} );
	await page.locator( 'textarea' ).waitFor();
	await action( 2 ).click();
	await page.locator( '.turgenev-source-mark' ).first().waitFor();
	assert( await page.evaluate( () => CSS.highlights.size > 0 && wp.data.select( 'core/editor' ).getEditedPostContent() ) === original, 'Mixed visual/HTML editing must highlight both modes without changing the document.' );
	assert( ! await page.locator( '.turgenev-notice' ).count(), 'A block in HTML mode must not discard its group highlights.' );
	await page.screenshot( { path: 'output/playwright/mixed-block-highlights.png', fullPage: true } );
	await reset().click();
	assert( await page.evaluate( () => CSS.highlights.size === 0 && ! document.querySelector( '.turgenev-decoration-layer' ) ), 'Reset must remove every decoration, including source overlays.' );
	checks.push( 'all six categories across mixed Gutenberg blocks, raw HTML, nested lists, captions, tables and code; exact reset' );
	await page.getByRole( 'button', { name: 'Switch to code editor', exact: true } ).click();
	await page.locator( '.editor-post-text-editor' ).waitFor();
	await action( 2 ).click();
	await page.locator( '.turgenev-source-mark' ).first().waitFor();
	assert( await page.locator( '.editor-post-text-editor' ).inputValue() === original, 'Gutenberg code mode content changed.' );
	assert( ! await page.locator( '.turgenev-notice' ).count(), 'Code mode must highlight without a partial-results notice.' );
	await page.screenshot( { path: 'output/playwright/code-highlights.png', fullPage: true } );
	await reset().click();
	assert( ! await page.locator( '.turgenev-decoration-layer' ).count(), 'Gutenberg code reset retained a layer.' );
	checks.push( 'native Gutenberg PostTextEditor supports highlighting and reset without changing HTML' );
	await page.goto( 'http://127.0.0.1:8897/classic?fallback=1' );
	const html = '<p>Первая строка &amp; &#x1F600;.</p>\n<p>Раз<strong>делённое</strong> слово.</p>\n' + '<p>Повтор &nbsp; слова.</p>\n'.repeat( 15 );
	await page.locator( '#content' ).fill( html );
	await page.locator( '#content' ).evaluate( node => { node.style.cssText = 'width:360px;height:160px;font:16px/24px monospace;padding:12px;border:2px solid #888;'; } );
	await analyze().click(); await action( 5 ).waitFor();
	for ( let i = 0; i < 6; i++ ) {
		await action( i ).click(); await page.locator( '.turgenev-source-mark' ).first().waitFor();
		assert( await page.locator( '#content' ).inputValue() === html, 'Classic code highlighting changed content.' );
		assert( ! await page.locator( '.turgenev-notice' ).count(), 'Classic text mode reported missing highlights.' );
	}
	await page.locator( '#content' ).evaluate( node => { node.scrollTop = 100; node.dispatchEvent( new Event( 'scroll' ) ); } );
	await page.waitForFunction( () => document.querySelector( '.turgenev-source-decoration > div' ).style.top === -document.getElementById( 'content' ).scrollTop + 'px' );
	await page.screenshot( { path: 'output/playwright/classic-code-highlights.png' } );
	await reset().click();
	assert( ! await page.locator( '.turgenev-decoration-layer' ).count() && await page.locator( '#content' ).inputValue() === html, 'Classic code reset retained markup or changed text.' );
	checks.push( 'Classic Text mode, all categories, repeated words, source scrolling, no value mutations and complete reset' );
	await page.goto( 'http://127.0.0.1:8897/?iframe=1' );
	await page.frameLocator( 'iframe[name="editor-canvas"]' ).locator( '[data-block]' ).first().waitFor();
	await openPanel();
	await analyze().click(); await action( 5 ).waitFor();
	const iframeOriginal = await page.evaluate( () => wp.data.select( 'core/editor' ).getEditedPostContent() );
	for ( let i = 0; i < 6; i++ ) {
		await action( i ).click();
		await page.waitForFunction( () => document.querySelector( 'iframe[name="editor-canvas"]' ).contentWindow.CSS.highlights.size > 0 );
		assert( ! await page.locator( '.turgenev-notice' ).count(), 'Iframe editor did not match all report fragments.' );
		await reset().click();
		assert( await page.evaluate( () => document.querySelector( 'iframe[name="editor-canvas"]' ).contentWindow.CSS.highlights.size === 0 && wp.data.select( 'core/editor' ).getEditedPostContent() ) === iframeOriginal, 'Iframe reset changed content or retained highlights.' );
	}
	await page.evaluate( () => window.smokeRegistry.dispatch( 'core/block-editor' ).resetBlocks( [ wp.blocks.createBlock( 'core/paragraph', { content: 'слово '.repeat( 700 ) } ) ] ) );
	await analyze().click(); await action( 5 ).waitFor(); await action( 2 ).click();
	await page.waitForFunction( () => [ ...document.querySelector( 'iframe[name="editor-canvas"]' ).contentWindow.CSS.highlights.values() ].reduce( ( count, group ) => count + group.size, 0 ) === 700 );
	await reset().click();
	checks.push( 'native Gutenberg iframe, all categories and reset, 700 fragments without omissions' );
	await page.evaluate( results => { window.mappingSmokeResults = results; }, checks );
}
