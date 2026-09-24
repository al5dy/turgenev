// CLI-first smoke: real WordPress blocks/stores/SlotFill; only provider responses are fixtures.
async page => {
	const checks = [];
	const assert = ( value, message ) => { if ( ! value ) throw new Error( message ); };
	let mode = 'success', operationMode = 'highlights', release;
	const requests = [];
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	// Accordion order: 'risk' is the overall report's own token. Each maps to the provider
	// class a real report of that section paints with (see ReportHighlightParser::CATEGORIES).
	const markTypes = { risk: [ 'style', 'bb', 2 ], frequency: [ 'frequency', 'doubles', 2 ], style: [ 'style', 'slop', 2 ], keywords: [ 'keywords', 'queries', 1 ], formality: [ 'formality', 'fog', 1 ], readability: [ 'readability', 'fre', 2 ] };
	const keyOf = index => { const [ , type, level ] = markTypes[ index ? categories[ index - 1 ] : 'risk' ]; return 'turgenev-' + type + level; };
	// Shaped like a live report: one mark per word (trailing space included), a flagged
	// sentence or phrase tied together only by the provider fragment ids its words share. For
	// "<sentence>. Первый абзац. Второй абзац.": the sentence is one fragment, "Первый абзац."
	// and "абзац. Второй" overlap on the first "абзац.", and the last "абзац." stands alone.
	const fragmentMarks = text => {
		const words = [ ...text.matchAll( /\S+ ?/gu ) ];
		const last = words.findIndex( match => /\. ?$/u.test( match[ 0 ] ) );
		const tail = [ [ 'xhlln-8-2' ], [ 'xhlln-8-2', 'xhlln-9-2' ], [ 'xhlln-9-2' ], [] ];
		return words.map( ( match, index ) => ( { start: match.index, end: match.index + match[ 0 ].length, category: 'style', type: 'bb', level: 1, sentence: index <= last ? '0-2' : null, fragments: index <= last ? [ 'xhint-0-' + ( last + 1 ) ] : tail[ index - last - 1 ] } ) );
	};
	await page.unroute( '**/analysis' );
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		requests.push( body );
		if ( mode === 'delay' && body.operation === operationMode ) await new Promise( resolve => { release = resolve; } );
		if ( mode === 'error' && body.operation === operationMode ) { await route.fulfill( { status: 502, json: { success: false, data: { message: 'Provider unavailable' } } } ); return; }
		if ( mode === 'json' && body.operation === operationMode ) { await route.fulfill( { body: '{broken', contentType: 'application/json' } ); return; }
		let data;
		if ( body.operation === 'balance' ) data = { balance: '100' };
		if ( body.operation === 'risk' ) data = { result: { link: 'risk12345', risk: '3', level: 'low', details: categories.map( block => ( { block, sum: '1', link: block + '12345' } ) ) } };
		if ( body.operation === 'details' ) {
			data = { details: { params: body.section === 'frequency' ? [ { name: 'Сверхчастые слова', value: 'Нет', score: '0', low: false }, { name: 'Доля', value: '12.5%', score: '0', low: false } ] : [] } };
			if ( body.section === 'overall' ) data.details.sentenceProblems = { '0-2': [ { label: 'Повторы слов', section: 'frequency' }, { label: 'Без раздела' } ] };
		}
		if ( body.operation === 'highlights' ) {
			const token = body.report_token.replace( '12345', '' );
			const [ category, type, level ] = markTypes[ token ];
			// Only the overall report ties its marks to a sentence (XHints); every other section's are null.
			const marks = mode === 'fragments' ? fragmentMarks( body.text ) : [ ...body.text.matchAll( /тестовый|абзац|😀/gu ) ].map( match => ( { start: match.index, end: match.index + match[ 0 ].length, category, type, level, sentence: token === 'risk' ? '0-2' : null } ) );
			data = { highlights: { text: body.text, marks: mode === 'empty' ? [] : marks } };
		}
		await route.fulfill( { json: { success: true, data } } );
	} );
	const highlights = async () => page.evaluate( () => [ ...CSS.highlights ].filter( ( [ key ] ) => key.startsWith( 'turgenev-' ) ).flatMap( ( [ key, ranges ] ) => [ ...ranges ].map( range => ( { key, text: range.toString() } ) ) ) );
	const serialized = () => page.evaluate( () => wp.data.select( 'core/editor' ).getEditedPostContent() );
	const analyze = () => page.getByRole( 'button', { name: 'Analyze document', exact: true } );
	const reset = () => page.getByRole( 'button', { name: 'Reset view', exact: true } );
	// The accordion replaced per-section "Highlight" buttons: opening a section is what runs
	// its highlight + details requests, so re-highlighting an open one means closing it first.
	const toggles = () => page.locator( '.turgenev-accordion-toggle' );
	const idle = () => page.waitForFunction( () => {
		const panel = document.querySelector( '.turgenev-panel' );
		return panel && panel.getAttribute( 'aria-busy' ) === 'false' && ! panel.querySelector( '.turgenev-accordion .turgenev-spinner' );
	} );
	const open = async ( index, settle = true ) => {
		if ( await toggles().nth( index ).getAttribute( 'aria-expanded' ) === 'true' ) await toggles().nth( index ).click();
		await toggles().nth( index ).click();
		if ( settle ) await idle();
	};
	const analyzed = async () => { await toggles().nth( 5 ).waitFor(); await idle(); };
	await page.goto( 'http://127.0.0.1:8897/' );
	await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
	await analyze().waitFor();
	assert( await page.getByText( 'No block selected.', { exact: true } ).count(), 'Must start without selection.' );
	assert( await page.evaluate( () => ! wp.data.select( 'core' ).getEditedEntityRecord( 'postType', 'post', 42 ).blocks ), 'Opening a saved post must not manufacture block edits: that hid the real initial-load mapping failure.' );
	const original = await serialized();
	await analyze().click();
	await analyzed();
	assert( await toggles().nth( 0 ).getAttribute( 'aria-expanded' ) === 'true', 'Analysis must land on the overall section.' );
	await open( 1 );
	const superfreqRow = page.locator( '.turgenev-section-param', { hasText: 'Сверхчастые слова' } );
	assert( await superfreqRow.locator( '.turgenev-section-param-value-text' ).innerText() === 'Нет', 'Textual parameter value must appear in Gutenberg results.' );
	assert( await superfreqRow.locator( '.turgenev-section-param-score' ).innerText() === '0', 'Score badge shows the plain score, no parentheses.' );
	const shareRow = page.locator( '.turgenev-section-param', { hasText: 'Доля' } );
	assert( await shareRow.locator( '.turgenev-section-param-value-text' ).innerText() === '12.5%', 'Formatted measurement must retain its units.' );
	const riskRequest = requests.find( r => r.operation === 'risk' );
	assert( riskRequest.text === 'Это тестовый текст с ссылкой и 😀 словами. Первый абзац. Второй абзац.', 'Analyze must submit all unsaved document text without block comments/HTML/image alt.' );
	checks.push( 'document panel immediately visible, no selection, entire unsaved content' );
	for ( let i = 0; i < 6; i++ ) {
		await open( i );
		const marks = await highlights();
		assert( marks.length === 4, 'Must highlight all four fragments across nested paragraphs, including emoji.' );
		assert( marks.every( m => m.key === keyOf( i ) ), 'Wrong category.' );
		assert( await serialized() === original, 'Highlight changed save/autosave content.' );
		assert( await page.locator( '[contenteditable] .turgenev-highlight' ).count() === 0, 'No wrappers may enter editable DOM.' );
		if ( i === 2 ) await page.screenshot( { path: 'output/playwright/document-highlight.png' } );
		await reset().click();
		assert( !( await highlights() ).length && await serialized() === original, 'Reset changed document or retained highlights.' );
	}
	assert( requests.filter( r => r.operation === 'risk' ).length === 1, 'Reset must preserve analysis.' );
	checks.push( 'six categories; nested fields; emoji; repeated reset; attributes/serialization unchanged' );
	await open( 2 );
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
	await toggles().nth( 5 ).waitFor();
	assert( ( await highlights() ).length === 4, 'Selecting an image discarded highlights.' );
	await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
	assert( ( await highlights() ).length === 4, 'Closing panel discarded highlights.' );
	await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
	await toggles().nth( 5 ).waitFor();
	await page.evaluate( () => window.smokeRegistry.dispatch( 'core/block-editor' ).clearSelectedBlock() );
	assert( ( await highlights() ).length === 4, 'Deselecting discarded highlights.' );
	checks.push( 'recreated live block IDs, selection/image/deselection/panel close preserve report and decorations' );

	mode = 'empty';
	await open( 1 );
	await page.getByText( 'This report has no highlighted fragments.', { exact: true } ).waitFor();
	assert( !( await highlights() ).length, 'Empty section retained marks.' );
	for ( const failure of [ 'error', 'json' ] ) {
		mode = failure;
		await open( 1 );
		await page.getByText( failure === 'error' ? 'Provider unavailable' : 'WordPress returned an invalid response.', { exact: true } ).waitFor();
	}
	mode = 'success';
	await open( 1 );
	await page.waitForFunction( () => CSS.highlights.size > 0 );
	checks.push( 'empty section, provider error, malformed JSON, retry' );

	mode = 'delay';
	await open( 1, false );
	await page.getByText( 'Loading highlights…', { exact: true } ).waitFor();
	await reset().click();
	release();
	mode = 'success';
	await open( 1 );
	await page.waitForFunction( () => CSS.highlights.size > 0 );
	await page.evaluate( () => {
		const registry = window.smokeRegistry;
		const first = registry.select( 'core/block-editor' ).getBlocks()[ 0 ];
		registry.dispatch( 'core/block-editor' ).updateBlockAttributes( first.clientId, { content: String( first.attributes.content ) + ' Новая правка.' } );
	} );
	await page.getByText( 'Content changed. Analyze the document again.', { exact: true } ).waitFor();
	assert( !( await highlights() ).length && ! await toggles().count(), 'Edit must invalidate results and decorations.' );
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
	await analyze().click(); await analyzed();
	assert( requests.filter( r => r.operation === 'risk' ).at( -1 ).text.startsWith( 'Совсем другой документ.' ), 'Stale analysis won race.' );
	checks.push( 'content edit cancels pending analysis; next analysis uses current content' );

	await page.getByRole( 'checkbox', { name: 'HTML analysis (send markup)' } ).check();
	await analyze().click(); await analyzed();
	const htmlRequest = requests.filter( r => r.operation === 'risk' ).at( -1 ).text;
	assert( htmlRequest.includes( '<p>' ) && ! htmlRequest.includes( '<!-- wp:' ) && ! htmlRequest.includes( 'turgenev-highlight' ), 'HTML mode must be explicit and exclude technical block metadata.' );
	checks.push( 'explicit HTML mode excludes technical block comments and decorations' );

	await page.getByRole( 'checkbox', { name: 'HTML analysis (send markup)' } ).uncheck();
	await analyze().click(); await analyzed();
	const point = await page.evaluate( () => {
		const [ , group ] = [ ...CSS.highlights ].find( ( [ key ] ) => key.startsWith( 'turgenev-bb' ) );
		const rect = [ ...group ][ 0 ].getClientRects()[ 0 ];
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	} );
	await page.mouse.move( point.x, point.y );
	const problemLink = page.locator( '.turgenev-section-problem-link', { hasText: 'Повторы слов' } );
	await problemLink.waitFor();
	assert( await page.evaluate( () => CSS.highlights.has( 'turgenev-hover-on-light' ) ), 'Hovering a sentence must paint its hover background.' );
	assert( await page.locator( '.turgenev-section-problem-link' ).count() === 1 && await page.getByText( '• Без раздела', { exact: true } ).count() === 1, 'Only a problem with a known section may become a link.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! CSS.highlights.has( 'turgenev-hover-on-light' ) );
	assert( await problemLink.count() === 1, 'Leaving the sentence must keep its problems reachable.' );
	await problemLink.click();
	await idle();
	assert( await toggles().nth( 1 ).getAttribute( 'aria-expanded' ) === 'true' && await toggles().nth( 0 ).getAttribute( 'aria-expanded' ) === 'false', 'A problem link must close the overall section and open its target.' );
	assert( requests.filter( r => r.operation === 'highlights' ).at( -1 ).report_token === 'frequency12345' && requests.filter( r => r.operation === 'details' ).at( -1 ).section === 'frequency', 'A problem link must run the same requests as the target section\'s own toggle.' );
	assert( ( await highlights() ).every( m => m.key.startsWith( 'turgenev-doubles' ) ), 'The target section\'s highlights must replace the overall ones.' );
	checks.push( 'hovered sentence problems stay after leaving it; a problem link opens its section like the toggle' );

	// Hover background, now in any section (Frequency is open): exactly the hovered mark,
	// kept through the sidebar re-render and repaints, gone once the cursor leaves it.
	const hoverRanges = () => page.evaluate( () => Object.fromEntries( [ 'turgenev-hover-on-light', 'turgenev-hover-on-dark' ].map( name => [ name, [ ...( CSS.highlights.get( name ) || [] ) ].map( range => range.toString() ) ] ) ) );
	const frame = () => page.evaluate( () => new Promise( resolve => requestAnimationFrame( () => requestAnimationFrame( resolve ) ) ) );
	const beforeHover = await serialized();
	const wordPoint = await page.evaluate( () => {
		const range = [ ...CSS.highlights.get( 'turgenev-doubles2' ) ][ 0 ];
		const rect = range.getClientRects()[ 0 ];
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: range.toString() };
	} );
	assert( await page.evaluate( () => [ ...document.querySelectorAll( 'style' ) ].some( node => node.textContent.includes( '::highlight(turgenev-hover-on-light){background-color:rgba(0, 0, 0, 0.2);}' ) && node.textContent.includes( '::highlight(turgenev-hover-on-dark){background-color:rgba(255, 255, 255, 0.2);}' ) ) ), 'Hover tints must be 20% toward black on light backdrops (#ccc on white) and toward white on dark ones.' );
	await page.mouse.move( wordPoint.x, wordPoint.y );
	await page.waitForFunction( () => CSS.highlights.has( 'turgenev-hover-on-light' ) );
	assert( JSON.stringify( await hoverRanges() ) === JSON.stringify( { 'turgenev-hover-on-light': [ wordPoint.text ], 'turgenev-hover-on-dark': [] } ), 'Hover must paint exactly the hovered word, with the light-backdrop tint.' );
	await frame();
	await page.evaluate( () => window.dispatchEvent( new Event( 'resize' ) ) );
	await frame();
	assert( ( await hoverRanges() )[ 'turgenev-hover-on-light' ].length === 1, 'A sidebar re-render or repaint under a still cursor must keep the hover background.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! CSS.highlights.has( 'turgenev-hover-on-light' ) && ! CSS.highlights.has( 'turgenev-hover-on-dark' ) );
	await page.evaluate( ( { x, y } ) => {
		const cover = document.createElement( 'div' );
		cover.id = 'smoke-cover';
		cover.style.cssText = `position:fixed;left:${ x - 20 }px;top:${ y - 20 }px;width:40px;height:40px;z-index:99999;`;
		document.documentElement.appendChild( cover );
	}, wordPoint );
	await page.mouse.move( wordPoint.x, wordPoint.y );
	await frame();
	assert( ! ( await hoverRanges() )[ 'turgenev-hover-on-light' ].length, 'UI floating over a mark must not light it up.' );
	await page.evaluate( () => document.getElementById( 'smoke-cover' ).remove() );
	await page.mouse.move( 1, 1 );
	await page.evaluate( () => { document.querySelector( '.editor-styles-wrapper' ).style.background = '#111'; } );
	await frame();
	await page.mouse.move( wordPoint.x, wordPoint.y );
	await page.waitForFunction( () => CSS.highlights.has( 'turgenev-hover-on-dark' ) );
	assert( ( await hoverRanges() )[ 'turgenev-hover-on-light' ].length === 0, 'A dark backdrop must switch to the light tint.' );
	await page.mouse.move( 1, 1 );
	await page.evaluate( () => { document.querySelector( '.editor-styles-wrapper' ).style.background = ''; } );
	assert( await serialized() === beforeHover, 'Hovering changed the document.' );
	checks.push( 'hover background in any section: exact mark, contrast-aware tint, survives repaints, ignores covering UI, clears on leave' );

	// Hovering one word lights up the whole flagged sentence or phrase it belongs to (every
	// fragment it is in), never that word alone; a mark with no fragment stays alone.
	assert( requests.filter( r => r.operation === 'risk' ).at( -1 ).text === 'Совсем другой документ. Первый абзац. Второй абзац.', 'Fragment scenario expects the document left by the edits above.' );
	mode = 'fragments';
	await open( 0 );
	const hoverWord = async ( word, nth = 0 ) => {
		const point = await page.evaluate( ( { word, nth } ) => {
			const range = [ ...CSS.highlights.get( 'turgenev-bb1' ) ].filter( candidate => candidate.toString().trim() === word )[ nth ];
			const rect = range.getClientRects()[ 0 ];
			return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
		}, { word, nth } );
		await page.mouse.move( point.x, point.y );
		await frame();
		return ( await hoverRanges() )[ 'turgenev-hover-on-light' ].map( text => text.trim() ).sort();
	};
	const same = ( actual, expected ) => JSON.stringify( actual ) === JSON.stringify( [ ...expected ].sort() );
	const sentence = [ 'Совсем', 'другой', 'документ.' ];
	assert( same( await hoverWord( 'другой' ), sentence ), 'Hovering a word must light up its whole sentence, not the word alone.' );
	await page.evaluate( () => {
		window.smokePanelRenders = 0;
		new MutationObserver( () => window.smokePanelRenders++ ).observe( document.querySelector( '.turgenev-panel' ), { childList: true } );
	} );
	assert( same( await hoverWord( 'Совсем' ), sentence ) && await page.evaluate( () => window.smokePanelRenders ) === 0, 'Moving between words of one sentence must keep its background and never re-render the sidebar.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! CSS.highlights.has( 'turgenev-hover-on-light' ) );
	assert( same( await hoverWord( 'Первый' ), [ 'Первый', 'абзац.' ] ), 'Hovering a word must light up its whole phrase and nothing past it.' );
	assert( same( await hoverWord( 'абзац.' ), [ 'Первый', 'абзац.', 'Второй' ] ), 'A word in two overlapping fragments must light up both of them.' );
	assert( same( await hoverWord( 'абзац.', 1 ), [ 'абзац.' ] ), 'A mark with no fragment must light up alone.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! CSS.highlights.has( 'turgenev-hover-on-light' ) );
	assert( await serialized() === beforeHover, 'Hovering fragments changed the document.' );
	mode = 'success';
	checks.push( 'hover lights up the whole flagged sentence/phrase (union of overlapping fragments), standalone marks alone, no sidebar re-render within one sentence' );
	await page.evaluate( results => { window.smokeResults = results; }, checks );
}
