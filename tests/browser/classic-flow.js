async page => {
	const assert = ( value, message ) => { if ( ! value ) throw new Error( message ); };
	// The analysis payload is the document's own blocks with their text escaped (the provider
	// reads it as HTML and ends sentences at block elements): these read it back.
	const visible = html => html.replace( /<[^>]*>/g, ' ' ).replace( /&nbsp;/g, ' ' ).replace( /&lt;/g, '<' ).replace( /&gt;/g, '>' ).replace( /&amp;/g, '&' ).replace( /\s+/g, ' ' ).trim();
	const onlyBlocks = html => ! /<!--|<(?!\/?(?:address|article|aside|blockquote|br|dd|div|dl|dt|figcaption|figure|h[1-6]|hr|li|main|ol|p|pre|section|table|td|th|tr|ul)>)/.test( html );
	const requests = [];
	let failure = '', malicious = false, balance = '100', fragments = false, provider = false;
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	// Shaped like a live report: one mark per word (trailing space included); the first
	// sentence's words are tied together only by a shared provider fragment id, the rest
	// carry none and stand alone.
	// Shaped like live reports of "Visual test text 😀. Second paragraph.", one per section,
	// with every class a live report sends for such words (see highlight-flow.js).
	const providerMarks = ( text, token ) => {
		const mark = ( word, fields ) => ( { start: text.indexOf( word ), end: text.indexOf( word ) + word.length, sentence: null, ...fields } );
		if ( token === 'formality12345' ) return [
			mark( 'Visual', { category: 'formality', type: 'stop', level: 1, classes: [ 'fog1', 'stop1' ], fragments: [ 'xhlln-0-1' ] } ),
			mark( 'text', { category: 'formality', type: 'fog', level: 1, classes: [ 'fog1' ], fragments: [ 'xhlln-2-1' ] } ),
		];
		if ( token === 'frequency12345' ) return [
			mark( 'test', { category: 'frequency', type: 'doubles', level: 4, classes: [ 'doubles4' ], stems: [ 'stm-6-EE20', 'stm-6-B' ] } ),
			mark( 'text', { category: 'frequency', type: 'doubles', level: 4, classes: [ 'doubles4' ], stems: [ 'stm-6-B' ] } ),
			mark( 'Second', { category: 'frequency', type: 'top_notstop', level: 2, classes: [ 'top_notstop2', 'doubles5' ], stems: [ 'stm-6-A' ] } ),
		];
		return [
			mark( 'Visual', { category: 'style', type: 'slop', level: 1, classes: [ 'slop1' ], xhint: true, sentence: '0-1', fragments: [ 'xhint-0-1' ] } ),
			mark( 'Second ', { category: 'style', type: 'slop', level: 2, classes: [ 'slop2' ], xhint: true, sentence: '4-2', fragments: [ 'xhint-4-2' ] } ),
			mark( 'paragraph', { category: 'style', type: 'slop', level: 2, classes: [ 'slop2' ], xhint: true, sentence: '4-2', fragments: [ 'xhint-4-2' ] } ),
		];
	};
	const providerDetails = section => ( {
		frequency: { params: [], words: [ { text: 'test', count: 2, percent: '33.3%', stopword: false, type: 'doubles', level: 4, score: '1', stems: [ 'stm-6-B' ] }, { text: 'second', count: 1, percent: '16.7%', stopword: false, type: 'top_notstop', level: 2, stems: [ 'stm-6-A' ] } ] },
		style: { params: [], legend: [ { type: 'slop', level: 1, label: 'Потенциальные' }, { type: 'slop', level: 2, label: 'Почти точно' } ], hints: { '4-2': [ { title: 'Second paragraph', text: [ { text: 'Пояснение про ' }, { text: 'second', italic: true }, { text: '.' } ], more: 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#heavy' }, { title: 'Second paragraph', text: [ { text: 'Второе пояснение.' } ], seeAlso: [ { label: 'Канцелярит', url: 'https://turgenev.ashmanov.com/?h=oshibki_kopirajterov#kants' } ] } ] } },
		formality: { params: [], legend: [ { type: 'fog', level: 1, label: 'Общие слова' }, { type: 'stop', level: 1, label: 'Стоп-слова' } ] },
	}[ section ] ?? { params: [] } );
	const wordMarks = ( text, mark ) => {
		const words = [ ...text.matchAll( /\S+ ?/gu ) ];
		const last = words.findIndex( match => /\. ?$/u.test( match[ 0 ] ) );
		return words.map( ( match, index ) => ( { ...mark, start: match.index, end: match.index + match[ 0 ].length, sentence: index <= last ? mark.sentence : null, fragments: index <= last ? [ 'xhint-0-' + ( last + 1 ) ] : [] } ) );
	};
	await page.unroute( '**/analysis' );
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		requests.push( body );
		if ( failure && body.operation === 'risk' ) {
			await route.fulfill( { status: 502, json: { success: false, data: { message: failure } } } ); return;
		}
		let data;
		if ( body.operation === 'balance' ) data = { balance };
		if ( body.operation === 'risk' ) data = { result: { risk: 0, level: malicious ? '<img src=x onerror="window.leaked=true">' : 'low', link: 'risk12345', details: categories.map( block => ( { block, sum: 0, link: block + '12345' } ) ) } };
		if ( body.operation === 'details' && provider ) data = { details: providerDetails( body.section ) };
		else if ( body.operation === 'details' ) {
			data = { details: { params: body.section === 'frequency' ? [ { name: 'Сверхчастые слова', value: malicious ? '<img src=x onerror="window.leaked=true">' : 'Нет', score: '0', low: false }, { name: 'Доля', value: '12.5%', score: '0', low: false } ] : [] } };
			if ( body.section === 'overall' ) data.details.sentenceProblems = { '0-2': [ { label: malicious ? '<img src=x onerror="window.leaked=true">' : 'Повторы слов', section: 'frequency' }, { label: 'Без раздела' } ] };
		}
		// Only the overall report ('risk' token) ties its marks to a sentence id (XHints).
		if ( body.operation === 'highlights' ) {
			const mark = body.report_token === 'risk12345' ? { start: 7, end: 11, category: 'style', type: 'bb', level: 2, sentence: '0-2' } : { start: 7, end: 11, category: 'frequency', type: 'doubles', level: 2, sentence: null };
			data = { highlights: { text: body.text, marks: provider ? providerMarks( body.text, body.report_token ) : fragments ? wordMarks( body.text, mark ) : [ mark ] } };
		}
		await route.fulfill( { json: { success: true, data } } );
	} );
	const analyze = () => page.getByRole( 'button', { name: 'Analyze document', exact: true } );
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
	const lastRisk = () => requests.filter( request => request.operation === 'risk' ).at( -1 );
	const checks = [];
	await page.goto( 'http://127.0.0.1:8897/classic' );
	await page.waitForFunction( () => window.tinymce?.get( 'content' )?.initialized );
	const original = await page.evaluate( () => tinymce.get( 'content' ).getContent() );
	await analyze().click(); await analyzed();
	await open( 1 );
	const superfreqRow = page.locator( '.turgenev-section-param', { hasText: 'Сверхчастые слова' } );
	assert( await superfreqRow.locator( '.turgenev-section-param-value-text' ).innerText() === 'Нет', 'Textual parameter value must appear in Classic results.' );
	assert( await superfreqRow.locator( '.turgenev-section-param-score' ).innerText() === '0', 'Score badge shows the plain score, no parentheses.' );
	const shareRow = page.locator( '.turgenev-section-param', { hasText: 'Доля' } );
	assert( await shareRow.locator( '.turgenev-section-param-value-text' ).innerText() === '12.5%', 'Formatted measurement must retain its units.' );
	assert( lastRisk().text.replace( />\s+</g, '><' ) === '<p>Visual test text 😀.</p><p>Second paragraph.</p>', 'Visual mode must analyze the entire unsaved TinyMCE document, in its own paragraphs, without inline markup.' );
	await open( 1 );
	await page.waitForFunction( () => tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights.size > 0 );
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Visual highlights changed TinyMCE content.' );
	await page.screenshot( { path: 'output/playwright/classic-highlight.png' } );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Reset changed TinyMCE formatting.' );
	checks.push( 'Visual/TinyMCE whole document, highlight, exact reset, no serialization changes' );

	await open( 0 );
	const point = await page.evaluate( () => {
		const frame = tinymce.get( 'content' ).iframeElement.getBoundingClientRect();
		const [ , group ] = [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights ].find( ( [ key ] ) => key.startsWith( 'turgenev-bb' ) );
		const rect = [ ...group ][ 0 ].getClientRects()[ 0 ];
		return { x: frame.left + rect.left + rect.width / 2, y: frame.top + rect.top + rect.height / 2 };
	} );
	await page.mouse.move( point.x, point.y );
	const problemLink = page.locator( '.turgenev-section-problem-link', { hasText: 'Повторы слов' } );
	await problemLink.waitFor();
	// Every hover highlight's ranges (each in its own class's hover color), and the active one.
	const tinyHover = () => page.evaluate( () => [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights ].filter( ( [ key ] ) => key.startsWith( 'turgenev-hover-' ) ).flatMap( ( [ , group ] ) => [ ...group ] ).map( range => range.toString() ) );
	const tinyActive = () => page.evaluate( () => [ ...( tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights.get( 'turgenev-active' ) || [] ) ].map( range => range.toString().trim() ).sort() );
	assert( JSON.stringify( await tinyHover() ) === JSON.stringify( [ 'test' ] ) && await page.evaluate( () => tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights.has( 'turgenev-hover-bb2' ) ), 'Hovering a TinyMCE mark must paint exactly it, in its own class\'s hover color.' );
	assert( await page.locator( '.turgenev-section-problem-link' ).count() === 1 && await page.getByText( '• Без раздела', { exact: true } ).count() === 1, 'Only a problem with a known section may become a link.' );
	// Leaving the TinyMCE iframe is the path a reader takes to reach the metabox.
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights.keys() ].some( key => key.startsWith( 'turgenev-hover-' ) ) );
	assert( await problemLink.count() === 1, 'Leaving the sentence must keep its problems reachable.' );
	assert( JSON.stringify( await tinyActive() ) === JSON.stringify( [ 'test' ] ), 'The sentence left behind stays active (#ececec), as on the provider\'s page.' );
	await problemLink.click();
	await idle();
	assert( await toggles().nth( 1 ).getAttribute( 'aria-expanded' ) === 'true' && await toggles().nth( 0 ).getAttribute( 'aria-expanded' ) === 'false', 'A problem link must close the overall section and open its target.' );
	assert( requests.filter( r => r.operation === 'highlights' ).at( -1 ).report_token === 'frequency12345' && requests.filter( r => r.operation === 'details' ).at( -1 ).section === 'frequency', 'A problem link must run the same requests as the target section\'s own toggle.' );
	assert( await page.evaluate( () => [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights.keys() ].every( key => key.startsWith( 'turgenev-doubles' ) ) ), 'The target section\'s highlights must replace the overall ones.' );
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Hovering or switching sections changed TinyMCE content.' );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	checks.push( 'hovered TinyMCE sentence problems stay after leaving the iframe; a problem link opens its section like the toggle' );

	// Hovering one word lights up the whole flagged sentence, never that word alone; a mark
	// with no fragment stays alone. Kept on for the two overlay paths below.
	fragments = true;
	await open( 0 );
	const tinyWord = async word => {
		const point = await page.evaluate( word => {
			const frame = tinymce.get( 'content' ).iframeElement.getBoundingClientRect();
			const range = [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights.get( 'turgenev-bb2' ) ].find( candidate => candidate.toString().trim() === word );
			const rect = range.getClientRects()[ 0 ];
			return { x: frame.left + rect.left + rect.width / 2, y: frame.top + rect.top + rect.height / 2 };
		}, word );
		await page.mouse.move( point.x, point.y );
		await page.evaluate( () => new Promise( resolve => requestAnimationFrame( () => requestAnimationFrame( resolve ) ) ) );
		return ( await tinyHover() ).map( text => text.trim() ).sort();
	};
	const firstSentence = JSON.stringify( [ 'Visual', 'test', 'text', '😀.' ].sort() );
	assert( JSON.stringify( await tinyWord( 'text' ) ) === firstSentence, 'Hovering a TinyMCE word must light up its whole sentence.' );
	assert( JSON.stringify( await tinyWord( 'paragraph.' ) ) === JSON.stringify( [ 'paragraph.' ] ), 'A TinyMCE mark with no fragment must light up alone.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( () => ! [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights.keys() ].some( key => key.startsWith( 'turgenev-hover-' ) ) );
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Hovering fragments changed TinyMCE content.' );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	checks.push( 'TinyMCE hover lights up the whole flagged sentence, standalone marks alone' );

	// Everything else a live report carries, rendered exactly as in Gutenberg.
	provider = true;
	const frame = () => page.evaluate( () => new Promise( resolve => requestAnimationFrame( () => requestAnimationFrame( resolve ) ) ) );
	const tinyNames = () => page.evaluate( () => Object.fromEntries( [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights ].filter( ( [ key ] ) => /^turgenev-(?!hover-|active)/.test( key ) ).map( ( [ key, group ] ) => [ key, [ ...group ].map( range => range.toString().trim() ) ] ) ) );
	const tinyHoverNames = () => page.evaluate( () => Object.fromEntries( [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights ].filter( ( [ key ] ) => key.startsWith( 'turgenev-hover-' ) ).map( ( [ key, group ] ) => [ key, [ ...group ].map( range => range.toString().trim() ).sort() ] ) ) );
	const hoverTiny = async word => {
		const point = await page.evaluate( word => {
			const frameRect = tinymce.get( 'content' ).iframeElement.getBoundingClientRect();
			const range = [ ...tinymce.get( 'content' ).getDoc().defaultView.CSS.highlights ].filter( ( [ key ] ) => /^turgenev-(?!hover-|active)/.test( key ) ).flatMap( ( [ , group ] ) => [ ...group ] ).find( candidate => candidate.toString().trim() === word );
			const rect = range.getClientRects()[ 0 ];
			return { x: frameRect.left + rect.left + rect.width / 2, y: frameRect.top + rect.top + rect.height / 2 };
		}, word );
		await page.mouse.move( point.x, point.y );
		await frame();
	};
	const legendState = () => page.evaluate( () => { const legend = document.querySelector( '.turgenev-section-legend' ); return { dimmed: legend.classList.contains( 'has-active' ), active: [ ...legend.querySelectorAll( '.is-active' ) ].map( row => row.textContent ) }; } );

	await open( 4 ); // Formality
	assert( JSON.stringify( await tinyNames() ) === JSON.stringify( { 'turgenev-stop1': [ 'Visual' ], 'turgenev-fog1': [ 'text' ] } ), 'A stop word ("fog1 stop1") is painted as "stop1" in TinyMCE too.' );
	assert( JSON.stringify( await legendState() ) === JSON.stringify( { dimmed: false, active: [] } ), 'The legend is plain until a mark is hovered.' );
	await hoverTiny( 'Visual' );
	await page.mouse.move( 1, 1 );
	await frame();
	assert( JSON.stringify( await legendState() ) === JSON.stringify( { dimmed: true, active: [ 'Стоп-слова' ] } ), 'The last legend row the span\'s classes name lights up and outlives the hover.' );

	await open( 1 ); // Frequency
	assert( JSON.stringify( await tinyNames() ) === JSON.stringify( { 'turgenev-doubles4-u': [ 'test', 'text' ], 'turgenev-top_notstop2-u': [ 'Second' ] } ), 'Repeated words carry the underline and the color the provider paints last.' );
	await hoverTiny( 'test' );
	assert( JSON.stringify( await tinyHoverNames() ) === JSON.stringify( { 'turgenev-hover-doubles4': [ 'test' ] } ) && JSON.stringify( await tinyActive() ) === JSON.stringify( [ 'text' ] ), 'Hovering a repeated word lights it up and marks the other occurrences of its row active.' );
	const wordRows = page.locator( '.turgenev-section-words tr' );
	assert( await wordRows.nth( 0 ).getAttribute( 'aria-pressed' ) === 'true', 'The hovered word picks its table row.' );
	await page.mouse.move( 1, 1 );
	await frame();
	assert( JSON.stringify( await tinyActive() ) === JSON.stringify( [ 'test', 'text' ] ), 'Every occurrence stays active after the hover.' );
	await wordRows.nth( 0 ).click();
	assert( ! ( await tinyActive() ).length, 'Picking the picked row releases it.' );
	await wordRows.nth( 1 ).click();
	assert( JSON.stringify( await tinyActive() ) === JSON.stringify( [ 'Second' ] ), 'Picking a row lights up its word in TinyMCE.' );

	await open( 2 ); // Style
	assert( JSON.stringify( await tinyNames() ) === JSON.stringify( { 'turgenev-slop1-u': [ 'Visual' ], 'turgenev-slop2-u': [ 'Second', 'paragraph' ] } ), 'Style marks carrying "xhint" are underlined.' );
	await hoverTiny( 'paragraph' );
	assert( JSON.stringify( await tinyHoverNames() ) === JSON.stringify( { 'turgenev-hover-slop2': [ 'Second', 'paragraph' ] } ), 'The whole fragment lights up in its hover color.' );
	const hintsBox = page.locator( '.turgenev-section-hints' );
	assert( await hintsBox.locator( '.turgenev-section-hint-title' ).innerText() === 'Second paragraph' && await hintsBox.locator( '.turgenev-section-hint-text i' ).innerText() === 'second' && await hintsBox.locator( '.turgenev-section-hints-info' ).innerText() === '1/2', 'The hints box shows the fragment\'s explainers with a pager.' );
	await page.mouse.move( 1, 1 );
	await frame();
	await hintsBox.getByRole( 'button', { name: 'Next hint' } ).click();
	assert( await hintsBox.locator( '.turgenev-section-hint-text' ).innerText() === 'Второе пояснение.', 'The box outlives the hover and pages through its explainers.' );
	assert( JSON.stringify( await tinyActive() ) === JSON.stringify( [ 'Second', 'paragraph' ] ), 'The fragment left behind stays active.' );
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Nothing here changed TinyMCE content.' );
	provider = false;
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	checks.push( 'TinyMCE provider fidelity: class cascade, underlines, sticky legend, frequency stems and row picking, style hints box' );

	await page.evaluate( () => { tinymce.get( 'content' ).getDoc().defaultView.Highlight = undefined; } );
	await open( 1 );
	await page.waitForFunction( () => tinymce.get( 'content' ).getDoc().querySelector( '.turgenev-decoration-layer span' ) );
	assert( original === await page.evaluate( () => tinymce.get( 'content' ).getContent() ), 'Fallback rectangles contaminated TinyMCE content.' );
	assert( ! await page.evaluate( () => tinymce.get( 'content' ).getBody().querySelector( '.turgenev-decoration-layer' ) ), 'Fallback layer must be outside editable body.' );
	const box = () => page.evaluate( () => {
		const frame = tinymce.get( 'content' ).iframeElement.getBoundingClientRect();
		const node = tinymce.get( 'content' ).getDoc().querySelector( '.turgenev-decoration-layer span' );
		const rect = node.getBoundingClientRect();
		return { x: frame.left + rect.left + rect.width / 2, y: frame.top + rect.top + rect.height / 2, color: node.style.backgroundColor, events: node.style.pointerEvents };
	} );
	const resting = await box();
	await page.mouse.move( resting.x, resting.y );
	// 20% black seen through the box's own .45 opacity: the same #ccc as the Highlight API path.
	await page.waitForFunction( () => tinymce.get( 'content' ).getDoc().querySelector( '.turgenev-decoration-layer span' ).style.backgroundColor.startsWith( 'rgba(0, 0, 0, 0.44' ) );
	assert( resting.events === 'none', 'Fallback boxes must never swallow clicks meant for the editor.' );
	// The first box is the first sentence's first word: its whole line lights up, the
	// fragment-less second paragraph does not.
	const boxLines = await page.evaluate( () => {
		// Zero-width boxes are the invisible line-break edges of a mark ending at a paragraph.
		const boxes = [ ...tinymce.get( 'content' ).getDoc().querySelectorAll( '.turgenev-decoration-layer span' ) ].filter( node => node.getBoundingClientRect().width > 0 );
		const top = boxes[ 0 ].getBoundingClientRect().top;
		return boxes.map( node => ( { first: node.getBoundingClientRect().top === top, lit: node.style.backgroundColor.startsWith( 'rgba(0, 0, 0, 0.44' ) } ) );
	} );
	const sentenceBoxes = boxLines.filter( entry => entry.first ), otherBoxes = boxLines.filter( entry => ! entry.first );
	// A word spanning an inline element (e.g. "<strong>test</strong> ") draws one box per piece.
	assert( sentenceBoxes.length >= 4 && sentenceBoxes.every( entry => entry.lit ) && otherBoxes.length >= 2 && otherBoxes.every( entry => ! entry.lit ), 'Fallback hover must tint every box of the hovered sentence and no other.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( color => tinymce.get( 'content' ).getDoc().querySelector( '.turgenev-decoration-layer span' ).style.backgroundColor === color, resting.color );
	await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
	checks.push( 'older-browser rectangle fallback lives outside editable body; its hover tint covers the whole sentence and clears' );

	await page.goto( 'http://127.0.0.1:8897/classic?text=1' );
	await page.locator( '#content' ).waitFor( { state: 'visible' } );
	await analyze().click(); await analyzed();
	assert( lastRisk().text.replace( />\s+</g, '><' ) === '<p>Text mode unsaved document.</p><p>Second paragraph.</p>', 'Hidden TinyMCE must not override Text mode textarea.' );
	const sourceMark = () => page.evaluate( () => {
		const node = document.querySelector( '.turgenev-source-mark' );
		const rect = node.getBoundingClientRect();
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, color: node.style.backgroundColor };
	} );
	const restingMark = await sourceMark();
	await page.mouse.move( restingMark.x, restingMark.y );
	// 20% black seen through the overlay's .5 opacity: the same #ccc as the Highlight API path.
	await page.waitForFunction( () => document.querySelector( '.turgenev-source-mark' ).style.backgroundColor === 'rgba(0, 0, 0, 0.4)' );
	assert( await page.evaluate( ( { x, y } ) => document.elementFromPoint( x, y ).id === 'content', restingMark ), 'The textarea overlay must let clicks through to the textarea.' );
	const litWords = await page.evaluate( () => [ ...document.querySelectorAll( '.turgenev-source-mark' ) ].filter( node => node.style.backgroundColor === 'rgba(0, 0, 0, 0.4)' ).map( node => node.textContent.trim() ) );
	assert( JSON.stringify( litWords ) === JSON.stringify( [ 'Text', 'mode', 'unsaved', 'document.' ] ), 'Hovering a textarea word must tint its whole sentence and nothing past it.' );
	await page.mouse.move( 1, 1 );
	await page.waitForFunction( color => [ ...document.querySelectorAll( '.turgenev-source-mark' ) ].every( node => node.style.backgroundColor === color ), restingMark.color );
	fragments = false;
	checks.push( 'Text-mode textarea: hover tints the whole sentence on the overlay, clicks still reach the textarea, cleared on leave' );
	await page.getByRole( 'checkbox', { name: 'HTML analysis (send markup)' } ).check();
	await analyze().click(); await analyzed();
	assert( lastRisk().text === '<p>Text mode unsaved document.</p><p>Second paragraph.</p>', 'Classic HTML payload is not current textarea markup.' );
	checks.push( 'Text/HTML mode reads textarea, never hidden TinyMCE, explicit HTML payload preserved' );

	await page.goto( 'http://127.0.0.1:8897/classic?fallback=1' );
	await page.locator( '#content' ).fill( '<p>Fallback one.</p><p>Fallback two.</p>' );
	await analyze().click(); await analyzed();
	assert( lastRisk().text.replace( />\s+</g, '><' ) === '<p>Fallback one.</p><p>Fallback two.</p>', 'TinyMCE unavailable fallback failed.' );
	// Text-tab content keeps paragraphs as blank lines: they must still end sentences.
	await page.evaluate( () => { window.wp.editor = { autop: text => text.split( /\n\s*\n/ ).map( block => '<p>' + block.trim() + '</p>' ).join( '\n' ) }; } );
	await page.locator( '#content' ).fill( 'Заголовок без точки\n\nПервый абзац & <второй>.' );
	await analyze().click(); await analyzed();
	assert( lastRisk().text === '<p>Заголовок без точки</p>\n<p>Первый абзац &amp; &lt;второй&gt;.</p>' && visible( lastRisk().text ) === 'Заголовок без точки Первый абзац & <второй>.', 'Text-tab paragraphs must reach the provider as paragraphs, text escaped.' );
	assert( await page.locator( '#content' ).inputValue() === 'Заголовок без точки\n\nПервый абзац & <второй>.', 'Restoring paragraphs for analysis must never rewrite the textarea.' );
	await page.evaluate( () => { delete window.wp.editor; } );
	const beforeEmpty = requests.filter( request => request.operation === 'risk' ).length;
	await page.locator( '#content' ).fill( '' ); await analyze().click();
	await page.getByText( 'Add content to the editor before running Turgenev.', { exact: true } ).waitFor();
	await page.locator( '#content' ).fill( 'a'.repeat( 50001 ) ); await analyze().click();
	await page.getByText( 'The content is longer than the maximum size accepted by Turgenev.', { exact: true } ).waitFor();
	assert( requests.filter( request => request.operation === 'risk' ).length === beforeEmpty, 'Invalid content issued paid request.' );
	checks.push( 'TinyMCE unavailable fallback, empty/oversized document blocked before network' );
	await page.locator( '#content' ).fill( 'Valid text again.' );
	for ( const error of [ 'Invalid API key', 'Insufficient balance', 'Provider unavailable' ] ) {
		failure = error; await analyze().click();
		await page.getByText( error, { exact: true } ).waitFor();
	}
	failure = ''; malicious = true; await analyze().click(); await analyzed();
	// Once on the overall verdict (provider level string), once on a section's params.
	assert( ! await page.evaluate( () => window.leaked ) && ! await page.locator( '#turgenev-panel img' ).count(), 'Provider verdict executed as HTML.' );
	await open( 1 );
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
		// Gutenberg's panel starts closed behind its toolbar button; Classic's metabox is always open.
		if ( ! url.startsWith( '/classic' ) ) await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
		await page.getByRole( 'link', { name: 'Configure API key', exact: true } ).waitFor();
		assert( await analyze().isDisabled(), 'No-key state should disable paid analysis.' );
		assert( requests.length === before, 'No-key state must not call remote API.' );
	}
	checks.push( 'Gutenberg and Classic panel visible without API key, no remote calls' );
	await page.evaluate( results => { window.classicSmokeResults = results; }, checks );
}
