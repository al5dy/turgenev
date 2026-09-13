// Run with playwright-cli run-code (async page => ...). Only the remote response is stubbed.
async page => {
	const checks = [];
	const assert = ( condition, message ) => { if ( ! condition ) throw new Error( message ); };
	let mode = 'success';
	let pending;
	let release;
	let started;
	let analysisCount = 0;
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	await page.unroute( '**/analysis' );
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		let data;
		if ( body.operation === 'balance' ) data = { balance: '100' };
		if ( body.operation === 'risk' ) {
			analysisCount++;
			data = { result: { link: 'risk12345', risk: 3, level: 'low', details: categories.map( block => ( { block, sum: 1, link: block + '12345', params: [] } ) ) } };
		}
		if ( body.operation === 'highlights' ) {
			if ( mode === 'delayed' ) { started(); await pending; }
			if ( mode === 'failure' ) { await route.fulfill( { status: 502, json: { success: false, data: { message: 'Provider unavailable' } } } ); return; }
			const category = body.report_token.replace( '12345', '' );
			const marks = [ ...body.text.matchAll( /тестовый|абзац/gu ) ].map( match => ( { start: match.index, end: match.index + match[ 0 ].length, category: category === 'risk' ? 'style' : category, level: 2 } ) );
			data = { highlights: { text: body.text, marks: mode === 'empty' ? [] : marks } };
		}
		await route.fulfill( { json: { success: true, data } } );
	} );
	await page.reload();
	await page.getByRole( 'document', { name: 'Block: Paragraph', exact: true } ).first().click();
	const original = await page.evaluate( () => {
		const block = window.smokeRegistry.select( 'core/block-editor' ).getBlocks()[ 0 ];
		return { html: String( block.attributes.content ), type: typeof block.attributes.content, rich: block.attributes.content instanceof wp.richText.RichTextData };
	} );
	assert( original.type === 'object' && original.rich, 'Fixture must exercise real RichTextData.' );
	await page.getByRole( 'button', { name: 'Analyze selected block', exact: true } ).click();
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).first().waitFor();
	assert( await page.getByRole( 'button', { name: 'Highlight', exact: true } ).count() === 6, 'Six report actions required.' );
	for ( let index = 0; index < 6; index++ ) {
		await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( index ).click();
		await page.waitForFunction( () => document.querySelector( '.editor-styles-wrapper .turgenev-highlight' ) );
		const actual = await page.evaluate( () => {
			const mark = document.querySelector( '.editor-styles-wrapper .turgenev-highlight' );
			return { text: mark.textContent, category: mark.dataset.turgenevCategory, color: getComputedStyle( mark ).backgroundColor };
		} );
		assert( actual.text === 'тестовый', 'Highlight must wrap the correct word inside Gutenberg.' );
		assert( actual.category === ( index === 0 ? 'style' : categories[ index - 1 ] ), 'Category token mismatch.' );
		assert( actual.color !== 'rgba(0, 0, 0, 0)', 'Canvas highlight has no color.' );
		if ( index === 2 ) await page.screenshot( { path: 'output/playwright/editor-highlight.png' } );
		await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
		const restored = await page.evaluate( () => String( window.smokeRegistry.select( 'core/block-editor' ).getBlocks()[ 0 ].attributes.content ) );
		assert( restored === original.html, 'Reset must restore exact original HTML, including formatting and entities.' );
	}
	assert( analysisCount === 1, 'Highlight/reset must reuse the original analysis.' );
	checks.push( 'real RichTextData; six categories; colored editor DOM; exact reset; repeat without reanalysis' );

	// Switching categories must replace the previous format, including an empty report.
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 ).click();
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).waitFor();
	mode = 'empty';
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 3 ).click();
	await page.getByText( 'This report has no highlighted fragments.', { exact: true } ).first().waitFor();
	assert( await page.locator( '.editor-styles-wrapper .turgenev-highlight' ).count() === 0, 'Empty report retained old marks.' );
	mode = 'failure';
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 ).click();
	await page.getByText( 'Provider unavailable', { exact: true } ).first().waitFor();
	mode = 'success';
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 ).click();
	await page.waitForFunction( () => document.querySelector( '.editor-styles-wrapper .turgenev-highlight' ) );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	checks.push( 'empty highlights; provider error and retry' );

	// Reset while a request is pending: its response must never reapply the marks.
	mode = 'delayed';
	pending = new Promise( resolve => { release = resolve; } );
	const startedPromise = new Promise( resolve => { started = resolve; } );
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 ).click();
	await startedPromise;
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	const responsePromise = page.waitForResponse( response => response.url().endsWith( '/analysis' ) );
	release();
	await responsePromise;
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 ).waitFor();
	assert( await page.locator( '.editor-styles-wrapper .turgenev-highlight' ).count() === 0, 'A cancelled response reapplied highlights.' );
	mode = 'success';
	checks.push( 'reset cancels pending response' );

	// Test the actual nested registry and multi-paragraph offsets.
	await page.evaluate( () => {
		const registry = window.smokeRegistry;
		registry.dispatch( 'core/block-editor' ).selectBlock( registry.select( 'core/block-editor' ).getBlocks()[ 1 ].clientId );
	} );
	const groupBefore = await page.evaluate( () => wp.blocks.serialize( window.smokeRegistry.select( 'core/block-editor' ).getBlocks()[ 1 ] ) );
	await page.getByRole( 'button', { name: 'Analyze selected block', exact: true } ).click();
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 ).click();
	await page.waitForFunction( () => document.querySelectorAll( '.editor-styles-wrapper .turgenev-highlight' ).length === 2 );
	const children = await page.evaluate( () => {
		const group = window.smokeRegistry.select( 'core/block-editor' ).getBlocks()[ 1 ];
		return { parent: group.attributes.content, children: group.innerBlocks.map( block => String( block.attributes.content ).includes( 'turgenev-highlight' ) ) };
	} );
	assert( children.parent === undefined && children.children.every( Boolean ), 'Wrote child text to the parent block.' );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	assert( groupBefore === await page.evaluate( () => wp.blocks.serialize( window.smokeRegistry.select( 'core/block-editor' ).getBlocks()[ 1 ] ) ), 'Nested reset changed original block markup.' );
	checks.push( 'group with two paragraphs: both children highlighted and reset, parent untouched' );

	// Re-select an already checked block: keep report buttons and protect edits made after analysis.
	await page.getByRole( 'document', { name: 'Block: Paragraph', exact: true } ).first().click();
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 ).click();
	await page.waitForFunction( () => document.querySelector( '.editor-styles-wrapper .turgenev-highlight' ) );
	await page.evaluate( () => {
		const registry = window.smokeRegistry;
		const block = registry.select( 'core/block-editor' ).getBlocks()[ 0 ];
		registry.dispatch( 'core/block-editor' ).updateBlockAttributes( block.clientId, { content: String( block.attributes.content ) + ' Новая правка.' } );
	} );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	const edited = await page.evaluate( () => String( window.smokeRegistry.select( 'core/block-editor' ).getBlocks()[ 0 ].attributes.content ) );
	assert( edited.includes( 'Новая правка.' ) && ! edited.includes( 'turgenev-highlight' ) && edited.includes( '<strong>' ), 'Reset lost user edits or formatting.' );
	await page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 ).click();
	await page.getByText( 'The selected block changed since this report was created.', { exact: true } ).first().waitFor();
	checks.push( 'report retained on reselection; reset preserves later edits; stale report rejected' );
	await page.evaluate( results => { window.smokeResults = results; }, checks );
	console.log( JSON.stringify( { passed: checks }, null, 2 ) );
}
