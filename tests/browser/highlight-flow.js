// CLI-first smoke: real WordPress blocks/stores/SlotFill; only provider responses are fixtures.
async page => {
	const checks = [];
	const assert = ( value, message ) => { if ( ! value ) throw new Error( message ); };
	let mode = 'success', operationMode = 'highlights', release;
	const requests = [];
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	await page.unroute( '**/analysis' );
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		requests.push( body );
		if ( mode === 'delay' && body.operation === operationMode ) await new Promise( resolve => { release = resolve; } );
		if ( mode === 'error' && body.operation === operationMode ) { await route.fulfill( { status: 502, json: { success: false, data: { message: 'Provider unavailable' } } } ); return; }
		if ( mode === 'json' && body.operation === operationMode ) { await route.fulfill( { body: '{broken', contentType: 'application/json' } ); return; }
		let data;
		if ( body.operation === 'balance' ) data = { balance: '100' };
		if ( body.operation === 'risk' ) data = { result: { link: 'risk12345', risk: '3', level: 'low', details: categories.map( block => ( { block, sum: '1', link: block + '12345', params: block === 'frequency' ? [ { name: 'Сверхчастые слова', value: 'Нет', score: '0' }, { name: 'Доля', value: '12.5%', score: '0' } ] : [] } ) ) } };
		if ( body.operation === 'highlights' ) {
			const category = body.report_token.replace( '12345', '' );
			const marks = [ ...body.text.matchAll( /тестовый|абзац|😀/gu ) ].map( match => ( { start: match.index, end: match.index + match[ 0 ].length, category: category === 'risk' ? 'style' : category, level: 2 } ) );
			data = { highlights: { text: body.text, marks: mode === 'empty' ? [] : marks } };
		}
		await route.fulfill( { json: { success: true, data } } );
	} );
	const highlights = async () => page.evaluate( () => [ ...CSS.highlights ].filter( ( [ key ] ) => key.startsWith( 'turgenev-' ) ).flatMap( ( [ key, ranges ] ) => [ ...ranges ].map( range => ( { key, text: range.toString() } ) ) ) );
	const serialized = () => page.evaluate( () => wp.data.select( 'core/editor' ).getEditedPostContent() );
	const analyze = () => page.getByRole( 'button', { name: 'Analyze document', exact: true } );
	const reset = () => page.getByRole( 'button', { name: 'Reset view', exact: true } );
	const action = index => page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( index );
	await page.goto( 'http://127.0.0.1:8897/' );
	await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
	await analyze().waitFor();
	assert( await page.getByText( 'No block selected.', { exact: true } ).count(), 'Must start without selection.' );
	assert( await page.evaluate( () => ! wp.data.select( 'core' ).getEditedEntityRecord( 'postType', 'post', 42 ).blocks ), 'Opening a saved post must not manufacture block edits: that hid the real initial-load mapping failure.' );
	const original = await serialized();
	await analyze().click();
	await action( 5 ).waitFor();
	assert( await page.getByText( 'Нет (0)', { exact: true } ).count() === 1, 'Textual parameter value must appear in Gutenberg results.' );
	assert( await page.getByText( '12.5% (0)', { exact: true } ).count() === 1, 'Formatted measurement must retain its units.' );
	const riskRequest = requests.find( r => r.operation === 'risk' );
	assert( riskRequest.text === 'Это тестовый текст с ссылкой и 😀 словами. Первый абзац. Второй абзац.', 'Analyze must submit all unsaved document text without block comments/HTML/image alt.' );
	checks.push( 'document panel immediately visible, no selection, entire unsaved content' );
	for ( let i = 0; i < 6; i++ ) {
		await action( i ).click();
		await page.waitForFunction( () => [ ...CSS.highlights.keys() ].some( key => key.startsWith( 'turgenev-' ) ) );
		const marks = await highlights();
		assert( marks.length === 4, 'Must highlight all four fragments across nested paragraphs, including emoji.' );
		assert( marks.every( m => m.key.startsWith( 'turgenev-' + ( i ? categories[ i - 1 ] : 'style' ) ) ), 'Wrong category.' );
		assert( await serialized() === original, 'Highlight changed save/autosave content.' );
		assert( await page.locator( '[contenteditable] .turgenev-highlight' ).count() === 0, 'No wrappers may enter editable DOM.' );
		if ( i === 2 ) await page.screenshot( { path: 'output/playwright/document-highlight.png' } );
		await reset().click();
		assert( !( await highlights() ).length && await serialized() === original, 'Reset changed document or retained highlights.' );
	}
	assert( requests.filter( r => r.operation === 'risk' ).length === 1, 'Reset must preserve analysis.' );
	checks.push( 'six categories; nested fields; emoji; repeated reset; attributes/serialization unchanged' );
	await action( 2 ).click();
	await page.waitForFunction( () => CSS.highlights.size > 0 );
	await page.evaluate( () => window.smokeRegistry.dispatch( 'core/block-editor' ).resetBlocks( wp.blocks.parse( wp.data.select( 'core/editor' ).getEditedPostContent() ) ) );
	await page.waitForFunction( () => {
		const ranges = [ ...CSS.highlights.values() ].flatMap( group => [ ...group ] );
		return ranges.length === 4 && ranges.every( range => range.startContainer.isConnected && range.endContainer.isConnected );
	} );
	assert( await serialized() === original, 'Recreating block IDs without text edits must preserve the analysis and highlights.' );
	await page.evaluate( () => {
		const registry = window.smokeRegistry;
		registry.dispatch( 'core/block-editor' ).selectBlock( registry.select( 'core/block-editor' ).getBlocks()[ 2 ].clientId );
	} );
	await action( 5 ).waitFor();
	assert( ( await highlights() ).length === 4, 'Selecting an image discarded highlights.' );
	await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
	assert( ( await highlights() ).length === 4, 'Closing panel discarded highlights.' );
	await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
	await action( 5 ).waitFor();
	await page.evaluate( () => window.smokeRegistry.dispatch( 'core/block-editor' ).clearSelectedBlock() );
	assert( ( await highlights() ).length === 4, 'Deselecting discarded highlights.' );
	checks.push( 'recreated live block IDs, selection/image/deselection/panel close preserve report and decorations' );

	mode = 'empty';
	await action( 1 ).click();
	await page.getByText( 'This report has no highlighted fragments.', { exact: true } ).waitFor();
	assert( !( await highlights() ).length, 'Empty section retained marks.' );
	for ( const failure of [ 'error', 'json' ] ) {
		mode = failure;
		await action( 1 ).click();
		await page.getByText( failure === 'error' ? 'Provider unavailable' : 'WordPress returned an invalid response.', { exact: true } ).waitFor();
	}
	mode = 'success';
	await action( 1 ).click();
	await page.waitForFunction( () => CSS.highlights.size > 0 );
	checks.push( 'empty section, provider error, malformed JSON, retry' );

	mode = 'delay';
	await action( 1 ).click();
	await page.getByText( 'Loading highlights…', { exact: true } ).waitFor();
	await reset().click();
	release();
	mode = 'success';
	await action( 1 ).click();
	await page.waitForFunction( () => CSS.highlights.size > 0 );
	await page.evaluate( () => {
		const registry = window.smokeRegistry;
		const first = registry.select( 'core/block-editor' ).getBlocks()[ 0 ];
		registry.dispatch( 'core/block-editor' ).updateBlockAttributes( first.clientId, { content: String( first.attributes.content ) + ' Новая правка.' } );
	} );
	await page.getByText( 'Content changed. Analyze the document again.', { exact: true } ).waitFor();
	assert( !( await highlights() ).length && ! await page.getByRole( 'button', { name: 'Highlight', exact: true } ).count(), 'Edit must invalidate results and decorations.' );
	assert( ( await serialized() ).includes( 'Новая правка.' ), 'Lost user edit.' );
	checks.push( 'reset cancels pending highlight; content edit clears report and marks, preserves edit' );

	mode = 'delay'; operationMode = 'risk';
	await analyze().click();
	await page.getByRole( 'button', { name: 'Analyzing document…', exact: true } ).waitFor();
	await page.evaluate( () => {
		const registry = window.smokeRegistry, first = registry.select( 'core/block-editor' ).getBlocks()[ 0 ];
		registry.dispatch( 'core/block-editor' ).updateBlockAttributes( first.clientId, { content: 'Совсем другой документ.' } );
	} );
	await analyze().waitFor();
	release(); mode = 'success';
	await analyze().click(); await action( 5 ).waitFor();
	assert( requests.filter( r => r.operation === 'risk' ).at( -1 ).text.startsWith( 'Совсем другой документ.' ), 'Stale analysis won race.' );
	checks.push( 'content edit cancels pending analysis; next analysis uses current content' );

	await page.getByRole( 'checkbox', { name: 'HTML analysis (send markup)' } ).check();
	await analyze().click(); await action( 5 ).waitFor();
	const htmlRequest = requests.filter( r => r.operation === 'risk' ).at( -1 ).text;
	assert( htmlRequest.includes( '<p>' ) && ! htmlRequest.includes( '<!-- wp:' ) && ! htmlRequest.includes( 'turgenev-highlight' ), 'HTML mode must be explicit and exclude technical block metadata.' );
	checks.push( 'explicit HTML mode excludes technical block comments and decorations' );
	await page.evaluate( results => { window.smokeResults = results; }, checks );
}
