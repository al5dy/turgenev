// CLI-first smoke: real WordPress blocks/stores/SlotFill; only provider responses are fixtures.
async page => {
	const checks = [];
	const assert = ( value, message ) => { if ( ! value ) throw new Error( message ); };
	// The analysis payload is the document's own blocks with their text escaped (the provider
	// reads it as HTML and ends sentences at block elements): these read it back.
	const visible = html => html.replace( /<[^>]*>/g, ' ' ).replace( /&nbsp;/g, ' ' ).replace( /&lt;/g, '<' ).replace( /&gt;/g, '>' ).replace( /&amp;/g, '&' ).replace( /\s+/g, ' ' ).trim();
	const onlyBlocks = html => ! /<!--|<(?!\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|h[1-6]|hr|li|main|ol|p|pre|section|table|td|th|tr|ul)>)/.test( html );
	let mode = 'success', operationMode = 'highlights', release, riskLevel = 'low';
	const requests = [];
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	// Accordion order: 'risk' is the overall report's own token. Each maps to the provider
	// class a real report of that section paints with (see ReportHighlightParser::CATEGORIES).
	const markTypes = { risk: [ 'style', 'bb', 2 ], frequency: [ 'frequency', 'doubles', 2 ], style: [ 'style', 'slop', 2 ], keywords: [ 'keywords', 'queries', 1 ], formality: [ 'formality', 'fog', 1 ], readability: [ 'readability', 'fre', 2 ] };
	// Repeated words carry the provider's dotted underline: their own `-u` highlight.
	const keyOf = index => { const [ , type, level ] = markTypes[ index ? categories[ index - 1 ] : 'risk' ]; return 'turgenev-' + type + level + ( type === 'doubles' ? '-u' : '' ); };
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
	// Shaped like live reports of "Совсем другой документ. Первый абзац. Второй абзац.",
	// one per section, with every class a live report sends for such words.
	const providerMarks = ( text, token ) => {
		const at = ( word, nth = 0 ) => { let index = -1; for ( let i = 0; i <= nth; i++ ) index = text.indexOf( word, index + 1 ); return { start: index, end: index + word.length }; };
		const mark = ( word, fields, nth = 0 ) => ( { ...at( word, nth ), sentence: null, ...fields } );
		if ( token === 'formality' ) return [
			mark( 'Совсем', { category: 'formality', type: 'stop', level: 1, classes: [ 'fog1', 'stop1' ], fragments: [ 'xhlln-0-1' ] } ),
			mark( 'другой', { category: 'formality', type: 'fog', level: 1, classes: [ 'fog1' ], fragments: [ 'xhlln-1-1' ] } ),
		];
		if ( token === 'frequency' ) return [
			mark( 'Первый', { category: 'frequency', type: 'top_notstop', level: 2, classes: [ 'top_notstop2', 'doubles5' ], stems: [ 'stm-6-A' ] } ),
			mark( 'абзац', { category: 'frequency', type: 'doubles', level: 4, classes: [ 'doubles4' ], stems: [ 'stm-6-EE20', 'stm-6-B' ] } ),
			mark( 'абзац', { category: 'frequency', type: 'doubles', level: 4, classes: [ 'doubles4' ], stems: [ 'stm-6-B' ] }, 1 ),
		];
		return [
			mark( 'документ', { category: 'style', type: 'slop', level: 1, classes: [ 'slop1' ], xhint: true, sentence: '2-1', fragments: [ 'xhint-2-1' ] } ),
			mark( 'Первый ', { category: 'style', type: 'slop', level: 2, classes: [ 'slop2' ], xhint: true, sentence: '3-2', fragments: [ 'xhint-3-2' ] } ),
			mark( 'абзац', { category: 'style', type: 'slop', level: 2, classes: [ 'slop2' ], xhint: true, sentence: '3-2', fragments: [ 'xhint-3-2' ] } ),
		];
	};
	const providerDetails = section => ( {
		frequency: { params: [], words: [ { text: 'абзац', count: 2, percent: '25.0%', stopword: false, type: 'doubles', level: 4, score: '1', stems: [ 'stm-6-B' ] }, { text: 'первый', count: 1, percent: '12.5%', stopword: false, type: 'top_notstop', level: 2, stems: [ 'stm-6-A' ] } ] },
		style: { params: [], legend: [ { type: 'slop', level: 1, label: 'Потенциальные' }, { type: 'slop', level: 2, label: 'Почти точно' } ], hints: { '3-2': [ { title: 'Первый абзац', text: [ { text: 'Пояснение про ' }, { text: 'первый', italic: true }, { text: '.' } ], more: 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#heavy' }, { title: 'Первый абзац', text: [ { text: 'Второе пояснение.' } ], seeAlso: [ { label: 'Канцелярит', url: 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#kants' } ] } ] } },
		formality: { params: [], legend: [ { type: 'fog', level: 1, label: 'Общие слова' }, { type: 'stop', level: 1, label: 'Стоп-слова' } ] },
	}[ section ] ?? { params: [] } );
	await page.unroute( '**/analysis' );
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		requests.push( body );
		if ( mode === 'delay' && body.operation === operationMode ) await new Promise( resolve => { release = resolve; } );
		if ( mode === 'error' && body.operation === operationMode ) { await route.fulfill( { status: 502, json: { success: false, data: { message: 'Provider unavailable' } } } ); return; }
		if ( mode === 'json' && body.operation === operationMode ) { await route.fulfill( { body: '{broken', contentType: 'application/json' } ); return; }
		let data;
		if ( body.operation === 'balance' ) data = { balance: '100' };
		if ( body.operation === 'risk' ) data = { result: { link: 'risk12345', risk: '3', level: riskLevel, details: categories.map( block => ( { block, sum: '1', link: block + '12345' } ) ) } };
		if ( body.operation === 'details' && mode === 'provider' ) data = { details: providerDetails( body.section ) };
		else if ( body.operation === 'details' ) {
			data = { details: { params: body.section === 'frequency' ? [ { name: 'Сверхчастые слова', value: 'Нет', score: '0', low: false }, { name: 'Доля', value: '12.5%', score: '0', low: false } ] : [] } };
			if ( body.section === 'overall' ) data.details.sentenceProblems = { '0-2': [ { label: 'Повторы слов', section: 'frequency' }, { label: 'Без раздела' } ] };
		}
		if ( body.operation === 'highlights' ) {
			const token = body.report_token.replace( '12345', '' );
			const [ category, type, level ] = markTypes[ token ];
			// Only the overall report ties its marks to a sentence (XHints); every other section's are null.
			const marks = mode === 'provider' ? providerMarks( body.text, token ) : mode === 'fragments' ? fragmentMarks( body.text ) : [ ...body.text.matchAll( /тестовый|абзац|😀/gu ) ].map( match => ( { start: match.index, end: match.index + match[ 0 ].length, category, type, level, sentence: token === 'risk' ? '0-2' : null } ) );
			data = { highlights: { text: body.text, marks: mode === 'empty' ? [] : marks } };
		}
		await route.fulfill( { json: { success: true, data } } );
	} );
	// Resting marks only: hover and active backgrounds are separate highlights of their own.
	const highlights = async () => page.evaluate( () => [ ...CSS.highlights ].filter( ( [ key ] ) => key.startsWith( 'turgenev-' ) && ! key.startsWith( 'turgenev-hover-' ) && key !== 'turgenev-active' ).flatMap( ( [ key, ranges ] ) => [ ...ranges ].map( range => ( { key, text: range.toString() } ) ) ) );
	// Every hover highlight by name, plus the active one, as trimmed text.
	const hoverState = () => page.evaluate( () => {
		const texts = name => [ ...( CSS.highlights.get( name ) || [] ) ].map( range => range.toString().trim() ).sort();
		const hover = Object.fromEntries( [ ...CSS.highlights.keys() ].filter( key => key.startsWith( 'turgenev-hover-' ) ).map( key => [ key, texts( key ) ] ) );
		return { hover, lit: Object.values( hover ).flat().sort(), active: texts( 'turgenev-active' ) };
	} );
	const hovering = () => page.evaluate( () => [ ...CSS.highlights.keys() ].some( key => key.startsWith( 'turgenev-hover-' ) ) );
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
	assert( visible( riskRequest.text ) === 'Это тестовый текст с ссылкой и 😀 словами. Первый абзац. Второй абзац.' && onlyBlocks( riskRequest.text ) && riskRequest.text.startsWith( '<p>' ), 'Analyze must submit all unsaved document text in its own blocks, without block comments, inline markup, attributes or image alt.' );
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
	await page.locator( '.turgenev-accordion-panel:not([hidden]) .turgenev-spinner' ).waitFor();
	assert( ! await page.getByText( 'Loading highlights…' ).count(), 'A loading section shows only its own spinner, no separate highlight status line.' );
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
	assert( visible( requests.filter( r => r.operation === 'risk' ).at( -1 ).text ).startsWith( 'Совсем другой документ.' ), 'Stale analysis won race.' );
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
	assert( await page.evaluate( () => CSS.highlights.has( 'turgenev-hover-bb2' ) ), 'Hovering a sentence must paint its own class\'s hover background.' );
	assert( await page.locator( '.turgenev-section-problem-link' ).count() === 1 && await page.getByText( '• Без раздела', { exact: true } ).count() === 1, 'Only a problem with a known section may become a link.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! [ ...CSS.highlights.keys() ].some( key => key.startsWith( 'turgenev-hover-' ) ) );
	assert( await problemLink.count() === 1, 'Leaving the sentence must keep its problems reachable.' );
	assert( ( await hoverState() ).active.length === 1, 'The sentence left behind stays marked active (#ececec), as on the provider\'s page.' );
	await problemLink.click();
	await idle();
	assert( await toggles().nth( 1 ).getAttribute( 'aria-expanded' ) === 'true' && await toggles().nth( 0 ).getAttribute( 'aria-expanded' ) === 'false', 'A problem link must close the overall section and open its target.' );
	assert( requests.filter( r => r.operation === 'highlights' ).at( -1 ).report_token === 'frequency12345' && requests.filter( r => r.operation === 'details' ).at( -1 ).section === 'frequency', 'A problem link must run the same requests as the target section\'s own toggle.' );
	assert( ( await highlights() ).every( m => m.key.startsWith( 'turgenev-doubles' ) ), 'The target section\'s highlights must replace the overall ones.' );
	checks.push( 'hovered sentence problems stay after leaving it; a problem link opens its section like the toggle' );

	// Hover background, now in any section (Frequency is open): exactly the hovered mark in
	// its own class's hover color, kept through the sidebar re-render and repaints, and
	// replaced by the provider's #ececec "active" background once the cursor leaves it.
	const frame = () => page.evaluate( () => new Promise( resolve => requestAnimationFrame( () => requestAnimationFrame( resolve ) ) ) );
	const beforeHover = await serialized();
	const wordPoint = await page.evaluate( () => {
		const range = [ ...CSS.highlights.get( 'turgenev-doubles2-u' ) ][ 0 ];
		const rect = range.getClientRects()[ 0 ];
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: range.toString() };
	} );
	const stylesheet = await page.evaluate( () => [ ...document.querySelectorAll( 'style' ) ].map( node => node.textContent ).join( '\n' ) );
	for ( const rule of [
		'::highlight(turgenev-doubles2-u){color:#8767a6;text-decoration:underline dotted #8767a6 1px;}',
		'::highlight(turgenev-hover-doubles2){background-color:rgba(135, 103, 166, 0.2);}',
		'::highlight(turgenev-stop1){color:#7687e2;}',
		'::highlight(turgenev-hover-cqueries2){background-color:rgba(236, 0, 140, 0.2);}',
		'::highlight(turgenev-active){background-color:#ececec;}',
	] ) assert( stylesheet.includes( rule ), 'Missing the provider\'s own rule: ' + rule );
	await page.mouse.move( wordPoint.x, wordPoint.y );
	await page.waitForFunction( () => CSS.highlights.has( 'turgenev-hover-doubles2' ) );
	assert( JSON.stringify( ( await hoverState() ).hover ) === JSON.stringify( { 'turgenev-hover-doubles2': [ wordPoint.text ] } ), 'Hover must paint exactly the hovered word, in its own class\'s hover color.' );
	assert( ! ( await hoverState() ).active.includes( wordPoint.text ), 'The hover background replaces the active one rather than stacking on it.' );
	await frame();
	await page.evaluate( () => window.dispatchEvent( new Event( 'resize' ) ) );
	await frame();
	assert( ( await hoverState() ).lit.length === 1, 'A sidebar re-render or repaint under a still cursor must keep the hover background.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! [ ...CSS.highlights.keys() ].some( key => key.startsWith( 'turgenev-hover-' ) ) );
	assert( JSON.stringify( ( await hoverState() ).active ) === JSON.stringify( [ wordPoint.text ] ), 'The word left behind stays active; the previously active sentence is released.' );
	await page.evaluate( ( { x, y } ) => {
		const cover = document.createElement( 'div' );
		cover.id = 'smoke-cover';
		cover.style.cssText = `position:fixed;left:${ x - 20 }px;top:${ y - 20 }px;width:40px;height:40px;z-index:99999;`;
		document.documentElement.appendChild( cover );
	}, wordPoint );
	await page.mouse.move( wordPoint.x, wordPoint.y );
	await frame();
	assert( ! await hovering(), 'UI floating over a mark must not light it up.' );
	await page.evaluate( () => document.getElementById( 'smoke-cover' ).remove() );
	await page.mouse.move( 1, 1 );
	assert( await serialized() === beforeHover, 'Hovering changed the document.' );
	checks.push( 'hover background in any section: exact mark in its own hover color, active #ececec after leaving, survives repaints, ignores covering UI' );

	// Hovering one word lights up the whole flagged sentence or phrase it belongs to (every
	// fragment it is in), never that word alone; a mark with no fragment stays alone.
	assert( visible( requests.filter( r => r.operation === 'risk' ).at( -1 ).text ) === 'Совсем другой документ. Первый абзац. Второй абзац.', 'Fragment scenario expects the document left by the edits above.' );
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
		return ( await hoverState() ).lit;
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
	await page.waitForFunction( () => ! [ ...CSS.highlights.keys() ].some( key => key.startsWith( 'turgenev-hover-' ) ) );
	assert( same( await hoverWord( 'Первый' ), [ 'Первый', 'абзац.' ] ), 'Hovering a word must light up its whole phrase and nothing past it.' );
	assert( same( await hoverWord( 'абзац.' ), [ 'Первый', 'абзац.', 'Второй' ] ), 'A word in two overlapping fragments must light up both of them.' );
	assert( same( await hoverWord( 'абзац.', 1 ), [ 'абзац.' ] ), 'A mark with no fragment must light up alone.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! [ ...CSS.highlights.keys() ].some( key => key.startsWith( 'turgenev-hover-' ) ) );
	assert( await serialized() === beforeHover, 'Hovering fragments changed the document.' );
	mode = 'success';
	checks.push( 'hover lights up the whole flagged sentence/phrase (union of overlapping fragments), standalone marks alone, no sidebar re-render within one sentence' );

	// Everything else a live report carries, rendered as the provider's own page does.
	mode = 'provider';
	const names = () => page.evaluate( () => Object.fromEntries( [ ...CSS.highlights ].filter( ( [ key ] ) => /^turgenev-(?!hover-|active)/.test( key ) ).map( ( [ key, group ] ) => [ key, [ ...group ].map( range => range.toString().trim() ) ] ) ) );
	const pointOf = ( word, nth = 0 ) => page.evaluate( ( { word, nth } ) => {
		const range = [ ...CSS.highlights ].filter( ( [ key ] ) => ! key.startsWith( 'turgenev-hover-' ) && key !== 'turgenev-active' ).flatMap( ( [ , group ] ) => [ ...group ] ).filter( candidate => candidate.toString().trim() === word )[ nth ];
		const rect = range.getClientRects()[ 0 ];
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
	}, { word, nth } );
	const hover = async ( word, nth = 0 ) => { const point = await pointOf( word, nth ); await page.mouse.move( point.x, point.y ); await frame(); };
	const legendState = () => page.evaluate( () => { const legend = document.querySelector( '.turgenev-section-legend' ); return { dimmed: legend.classList.contains( 'has-active' ), active: [ ...legend.querySelectorAll( '.is-active' ) ].map( row => row.textContent ) }; } );

	await open( 4 ); // Formality
	assert( JSON.stringify( await names() ) === JSON.stringify( { 'turgenev-stop1': [ 'Совсем' ], 'turgenev-fog1': [ 'другой' ] } ), 'A stop word ("fog1 stop1") is painted as "stop1", the rule the provider\'s stylesheet defines last.' );
	assert( JSON.stringify( await legendState() ) === JSON.stringify( { dimmed: false, active: [] } ), 'The legend is plain until a mark is hovered.' );
	await hover( 'Совсем' );
	await page.mouse.move( 1, 1 );
	await frame();
	assert( JSON.stringify( await legendState() ) === JSON.stringify( { dimmed: true, active: [ 'Стоп-слова' ] } ), 'A span with several classes lights up the last legend row they name, and it outlives the hover.' );

	await open( 1 ); // Frequency
	assert( JSON.stringify( await names() ) === JSON.stringify( { 'turgenev-top_notstop2-u': [ 'Первый' ], 'turgenev-doubles4-u': [ 'абзац', 'абзац' ] } ), 'Repeated words carry the provider\'s underline and the color its stylesheet paints last.' );
	await hover( 'абзац' );
	let state = await hoverState();
	assert( JSON.stringify( state.hover ) === JSON.stringify( { 'turgenev-hover-doubles4': [ 'абзац' ] } ) && JSON.stringify( state.active ) === JSON.stringify( [ 'абзац' ] ), 'Hovering a repeated word lights it up and marks every other occurrence of its table row active.' );
	const wordRows = page.locator( '.turgenev-section-words tr' );
	assert( await wordRows.nth( 0 ).getAttribute( 'aria-pressed' ) === 'true', 'The hovered word\'s first stem with a row picks that row.' );
	await page.mouse.move( 1, 1 );
	await frame();
	assert( JSON.stringify( ( await hoverState() ).active ) === JSON.stringify( [ 'абзац', 'абзац' ] ), 'Every occurrence stays active after the hover.' );
	await wordRows.nth( 0 ).click();
	assert( ! ( await hoverState() ).active.length && await wordRows.nth( 0 ).getAttribute( 'aria-pressed' ) === 'false', 'Picking the picked row releases it.' );
	await wordRows.nth( 1 ).click();
	assert( JSON.stringify( ( await hoverState() ).active ) === JSON.stringify( [ 'Первый' ] ) && await wordRows.nth( 1 ).getAttribute( 'aria-pressed' ) === 'true', 'Picking a row lights up its word in the document.' );
	assert( await wordRows.nth( 0 ).locator( '.turgenev-section-param-score' ).innerText() === '1', 'An over-frequent word shows its score badge.' );

	await open( 2 ); // Style
	assert( JSON.stringify( await names() ) === JSON.stringify( { 'turgenev-slop1-u': [ 'документ' ], 'turgenev-slop2-u': [ 'Первый', 'абзац' ] } ), 'Style marks carrying "xhint" are underlined.' );
	assert( ! await page.locator( '.turgenev-section-hints' ).count(), 'No hints box until a fragment is hovered.' );
	await hover( 'абзац' );
	assert( JSON.stringify( ( await hoverState() ).hover ) === JSON.stringify( { 'turgenev-hover-slop2': [ 'Первый', 'абзац' ] } ), 'The whole fragment lights up in its hover color.' );
	const hintsBox = page.locator( '.turgenev-section-hints' );
	assert( await hintsBox.locator( '.turgenev-section-hint-title' ).innerText() === 'Первый абзац' && await hintsBox.locator( '.turgenev-section-hint-text i' ).innerText() === 'первый', 'The box shows the fragment\'s first explainer with its italics.' );
	assert( await hintsBox.locator( '.turgenev-section-hint-more' ).getAttribute( 'href' ) === 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#heavy', 'The "Подробнее" link goes to the provider\'s help article.' );
	assert( await hintsBox.locator( '.turgenev-section-hints-info' ).innerText() === '1/2', 'Several explainers get a pager.' );
	await page.mouse.move( 1, 1 );
	await frame();
	await hintsBox.getByRole( 'button', { name: 'Next hint' } ).click();
	assert( await hintsBox.locator( '.turgenev-section-hints-info' ).innerText() === '2/2' && await hintsBox.locator( '.turgenev-section-hint-text' ).innerText() === 'Второе пояснение.' && await hintsBox.locator( '.turgenev-section-hint-see-also a' ).innerText() === 'Канцелярит', 'The box outlives the hover and pages through its explainers.' );
	assert( JSON.stringify( ( await hoverState() ).active ) === JSON.stringify( [ 'Первый', 'абзац' ] ), 'The fragment left behind stays active.' );
	assert( await serialized() === beforeHover, 'Nothing here changed the document.' );
	mode = 'success';
	checks.push( 'provider fidelity: class cascade, underlines, sticky legend, frequency stems and row picking, style hints box with pager' );

	// The panel and the editor's settings sidebar open and close together; here the store
	// actions stand in for the Settings button, Ctrl+Shift+comma and other plugins' panels.
	const sidebarArea = () => page.evaluate( () => wp.data.select( 'core/interface' ).getActiveComplementaryArea( 'core' ) ?? null );
	const setSidebarArea = area => page.evaluate( area => {
		const actions = wp.data.dispatch( 'core/interface' );
		if ( area ) actions.enableComplementaryArea( 'core', area ); else actions.disableComplementaryArea( 'core' );
	}, area );
	const panelButton = () => page.locator( '.turgenev-toolbar-button' );
	const panelShown = async () => await panelButton().getAttribute( 'aria-expanded' ) === 'true';
	const panelGone = () => page.locator( '.turgenev-sidebar' ).waitFor( { state: 'detached' } );
	if ( await panelShown() ) { await panelButton().click(); await panelGone(); }
	await page.evaluate( () => window.smokeRegistry.dispatch( 'core/block-editor' ).clearSelectedBlock() );
	await setSidebarArea( null );
	await panelButton().click();
	assert( await panelShown() && await sidebarArea() === 'edit-post/document', 'Opening the panel over a closed sidebar opens the sidebar on its "Post" tab.' );
	await setSidebarArea( 'edit-post/block' );
	assert( await panelShown(), 'Gutenberg\'s own "Post"/"Block" tab switch keeps the panel open.' );
	await panelButton().click(); await panelGone();
	assert( await sidebarArea() === null, 'Closing the panel closes the sidebar it opened.' );

	await setSidebarArea( 'edit-post/document' );
	await panelButton().click();
	assert( await panelShown() && await sidebarArea() === 'edit-post/document', 'An open sidebar is left as it is.' );
	await page.locator( '.turgenev-sidebar__close' ).click(); await panelGone();
	assert( await sidebarArea() === 'edit-post/document', 'Closing the panel leaves open a sidebar it did not open.' );

	await panelButton().click();
	await setSidebarArea( null );
	await panelGone();
	assert( ! await panelShown(), 'Closing the sidebar (Settings button, shortcut) closes the panel too.' );

	await panelButton().click();
	assert( await sidebarArea() === 'edit-post/document', 'The sidebar reopens with the panel.' );
	await setSidebarArea( 'smoke-plugin/panel' );
	await panelGone();
	assert( ! await panelShown() && await sidebarArea() === 'smoke-plugin/panel', 'Switching the sidebar to another plugin\'s panel reveals it.' );
	await panelButton().click();
	assert( await panelShown() && await sidebarArea() === 'smoke-plugin/panel', 'Over another plugin\'s panel the sidebar is left as it is.' );
	await panelButton().click(); await panelGone();
	assert( await sidebarArea() === 'smoke-plugin/panel', 'Closing the panel leaves another plugin\'s panel open.' );

	// Distraction-free mode keeps the sidebar "open" in the store but no longer renders it.
	const toggleDistractionFree = () => page.evaluate( () => wp.data.dispatch( 'core/editor' ).toggleDistractionFree( { createNotice: false } ) );
	await setSidebarArea( null );
	await panelButton().click();
	await toggleDistractionFree();
	await panelGone();
	assert( ! await panelShown() && await sidebarArea() === null, 'Distraction-free mode hides the panel and puts back the sidebar it opened.' );
	await panelButton().click();
	assert( await panelShown() && await sidebarArea() === 'edit-post/document', 'The panel still opens in distraction-free mode.' );
	await toggleDistractionFree();
	assert( await panelShown() && await sidebarArea() === 'edit-post/document', 'Leaving distraction-free mode keeps it, now over the sidebar.' );
	await panelButton().click(); await panelGone();

	await setSidebarArea( null );
	await page.evaluate( () => {
		const registry = window.smokeRegistry;
		registry.dispatch( 'core/block-editor' ).selectBlock( registry.select( 'core/block-editor' ).getBlocks()[ 0 ].clientId );
	} );
	await panelButton().click();
	assert( await sidebarArea() === 'edit-post/block', 'With a block selected the sidebar opens on its "Block" tab, as Gutenberg\'s own shortcut does.' );
	const panelWidth = () => page.evaluate( () => document.querySelector( '.turgenev-sidebar' ).getBoundingClientRect().width );
	assert( await panelWidth() === 280, 'The panel has the settings sidebar\'s width, border included.' );
	const viewport = page.viewportSize();
	await page.setViewportSize( { width: 600, height: viewport.height } );
	await page.waitForFunction( () => document.querySelector( '.turgenev-sidebar' ).getBoundingClientRect().width === window.innerWidth );
	await page.setViewportSize( viewport );
	await page.waitForFunction( () => document.querySelector( '.turgenev-sidebar' ).getBoundingClientRect().width === 280 );
	await page.evaluate( () => window.smokeRegistry.dispatch( 'core/block-editor' ).clearSelectedBlock() );
	checks.push( 'panel and settings sidebar open and close together: restore on close, Settings/shortcut close, other plugin panels, Post/Block tabs, distraction-free mode, full width on narrow screens' );

	// The critical-risk notice waits for the whole result, as on the provider's own page.
	const riskNotices = () => page.evaluate( () => wp.data.select( 'core/notices' ).getNotices().filter( notice => notice.id === 'turgenev-risk-warning' ).map( notice => notice.content ) );
	riskLevel = 'критический'; mode = 'delay'; operationMode = 'details'; release = null;
	await analyze().click();
	while ( ! release ) await page.waitForTimeout( 20 );
	assert( await page.locator( '.turgenev-loading', { hasText: 'Analyzing document…' } ).isVisible(), 'The overall section is still loading.' );
	assert( ! ( await riskNotices() ).length, 'The critical-risk notice appeared while "Analyzing document…" was still loading.' );
	release(); mode = 'success';
	await analyzed();
	assert( JSON.stringify( await riskNotices() ) === JSON.stringify( [ 'Risk is critical! What to do?' ] ), 'The critical-risk notice must appear once the result has loaded.' );
	await toggles().nth( 0 ).click(); await idle();
	assert( await toggles().nth( 0 ).getAttribute( 'aria-expanded' ) === 'false' && ! ( await riskNotices() ).length, 'Collapsing "Overall risk" removes the notice.' );
	await toggles().nth( 0 ).click(); await idle();
	assert( JSON.stringify( await riskNotices() ) === JSON.stringify( [ 'Risk is critical! What to do?' ] ), 'Reopening "Overall risk" brings it back once loaded.' );
	riskLevel = 'low';
	checks.push( 'critical-risk notice only after "Analyzing document…" has loaded the overall section' );
	await page.evaluate( results => { window.smokeResults = results; }, checks );
}
