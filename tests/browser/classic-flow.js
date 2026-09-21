async page => {
	const assert = ( value, message ) => { if ( ! value ) throw new Error( message ); };
	const requests = [];
	let failure = '', malicious = false, balance = '100';
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	await page.unroute( '**/analysis' );
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		requests.push( body );
		if ( failure && body.operation === 'risk' ) {
			await route.fulfill( { status: 502, json: { success: false, data: { message: failure } } } ); return;
		}
		let data;
		if ( body.operation === 'balance' ) data = { balance };
		if ( body.operation === 'risk' ) data = { result: { risk: 0, level: malicious ? '<img src=x onerror="window.leaked=true">' : 'low', link: 'risk12345', details: categories.map( block => ( { block, sum: 0, link: block + '12345', params: block === 'frequency' ? [ { name: 'Сверхчастые слова', value: malicious ? '<img src=x onerror="window.leaked=true">' : 'Нет', score: '0' }, { name: 'Доля', value: '12.5%', score: '0' } ] : [] } ) ) } };
		if ( body.operation === 'highlights' ) data = { highlights: { text: body.text, marks: [ { start: 7, end: 11, category: 'style', level: 2 } ] } };
		await route.fulfill( { json: { success: true, data } } );
	} );
	const analyze = () => page.getByRole( 'button', { name: 'Analyze document', exact: true } );
	const action = () => page.getByRole( 'button', { name: 'Highlight', exact: true } ).nth( 2 );
	const lastRisk = () => requests.filter( request => request.operation === 'risk' ).at( -1 );
	const checks = [];
	await page.goto( 'http://127.0.0.1:8897/classic' );
	await page.waitForFunction( () => window.tinymce?.get( 'content' )?.initialized );
	const original = await page.evaluate( () => tinymce.get( 'content' ).getContent() );
	await analyze().click(); await action().waitFor();
	assert( await page.getByText( 'Нет (0)', { exact: true } ).count() === 1, 'Textual parameter value must appear in Classic results.' );
	assert( await page.getByText( '12.5% (0)', { exact: true } ).count() === 1, 'Formatted measurement must retain its units.' );
	assert( lastRisk().text === 'Visual test text 😀. Second paragraph.', 'Visual mode must analyze entire unsaved TinyMCE document.' );
	await action().click();
	await page.waitForFunction( () => tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights.size > 0 );
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Visual highlights changed TinyMCE content.' );
	await page.screenshot( { path: 'output/playwright/classic-highlight.png' } );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Reset changed TinyMCE formatting.' );
	checks.push( 'Visual/TinyMCE whole document, highlight, exact reset, no serialization changes' );

	await page.evaluate( () => { tinymce.get( 'content' ).getDoc().defaultView.Highlight = undefined; } );
	await action().click();
	await page.waitForFunction( () => tinymce.get( 'content' ).getDoc().querySelector( '.turgenev-decoration-layer span' ) );
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Fallback rectangles contaminated TinyMCE content.' );
	assert( ! await page.evaluate( () => tinymce.get( 'content' ).getBody().querySelector( '.turgenev-decoration-layer' ) ), 'Fallback layer must be outside editable body.' );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	checks.push( 'older-browser rectangle fallback lives outside editable body' );

	await page.goto( 'http://127.0.0.1:8897/classic?text=1' );
	await page.locator( '#content' ).waitFor( { state: 'visible' } );
	await analyze().click(); await action().waitFor();
	assert( lastRisk().text === 'Text mode unsaved document. Second paragraph.', 'Hidden TinyMCE must not override Text mode textarea.' );
	await page.getByRole( 'checkbox', { name: 'HTML analysis (send markup)' } ).check();
	await analyze().click(); await action().waitFor();
	assert( lastRisk().text === '<p>Text mode unsaved document.</p><p>Second paragraph.</p>', 'Classic HTML payload is not current textarea markup.' );
	checks.push( 'Text/HTML mode reads textarea, never hidden TinyMCE, explicit HTML payload preserved' );

	await page.goto( 'http://127.0.0.1:8897/classic?fallback=1' );
	await page.locator( '#content' ).fill( '<p>Fallback one.</p><p>Fallback two.</p>' );
	await analyze().click(); await action().waitFor();
	assert( lastRisk().text === 'Fallback one. Fallback two.', 'TinyMCE unavailable fallback failed.' );
	const beforeEmpty = requests.filter( request => request.operation === 'risk' ).length;
	await page.locator( '#content' ).fill( '' ); await analyze().click();
	await page.getByText( 'Add content to the editor before running Turgenev.', { exact: true } ).waitFor();
	await page.locator( '#content' ).fill( 'a'.repeat( 20001 ) ); await analyze().click();
	await page.getByText( 'The content is longer than the maximum size accepted by Turgenev.', { exact: true } ).waitFor();
	assert( requests.filter( request => request.operation === 'risk' ).length === beforeEmpty, 'Invalid content issued paid request.' );
	checks.push( 'TinyMCE unavailable fallback, empty/oversized document blocked before network' );
	await page.locator( '#content' ).fill( 'Valid text again.' );
	for ( const error of [ 'Invalid API key', 'Insufficient balance', 'Provider unavailable' ] ) {
		failure = error; await analyze().click();
		await page.getByText( error, { exact: true } ).waitFor();
	}
	failure = ''; malicious = true; await analyze().click(); await action().waitFor();
	assert( ! await page.evaluate( () => window.leaked ) && ! await page.locator( '#turgenev-panel img' ).count(), 'Provider strings executed as HTML.' );
	checks.push( 'invalid-key/insufficient-balance/provider-error recovery, safe provider string rendering' );

	const beforeZeroBalance = requests.filter( request => request.operation === 'risk' ).length;
	balance = '0';
	await page.getByRole( 'button', { name: 'Refresh balance', exact: true } ).click();
	await page.getByText( 'Your Turgenev balance is empty. Top it up before running an analysis.', { exact: true } ).waitFor();
	assert( await analyze().isDisabled(), 'A zero balance must disable "Analyze document".' );
	assert( await page.getByRole( 'link', { name: 'Top up Turgenev balance', exact: true } ).count(), 'Top-up link missing at zero balance.' );
	balance = '100';
	await page.getByRole( 'button', { name: 'Refresh balance', exact: true } ).click();
	await page.getByRole( 'button', { name: 'Analyze document', exact: true, disabled: false } ).waitFor();
	assert( requests.filter( request => request.operation === 'risk' ).length === beforeZeroBalance, 'A zero balance must never reach a paid request.' );
	checks.push( 'refresh-balance icon updates the shown balance; a zero balance disables analysis and surfaces the top-up icon/message' );

	for ( const url of [ '/?unconfigured=1', '/classic?unconfigured=1&fallback=1' ] ) {
		const before = requests.length;
		await page.goto( 'http://127.0.0.1:8897' + url );
		await page.getByRole( 'link', { name: 'Configure API key', exact: true } ).waitFor();
		assert( await analyze().isDisabled(), 'No-key state should disable paid analysis.' );
		assert( requests.length === before, 'No-key state must not call remote API.' );
	}
	checks.push( 'Gutenberg and Classic panel visible without API key, no remote calls' );
	await page.evaluate( results => { window.classicSmokeResults = results; }, checks );
}
