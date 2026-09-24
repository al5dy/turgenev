// Regression for a freshly opened saved article, before Gutenberg creates entity block edits.
async page => {
	const assert = ( value, message ) => { if ( ! value ) throw new Error( message ); };
	const checks = [];
	const categories = [ 'frequency', 'style', 'keywords', 'formality', 'readability' ];
	// 'risk' is the overall report's own token; each maps to the provider class that section paints with.
	const markTypes = { risk: [ 'style', 'bb', 2 ], frequency: [ 'frequency', 'doubles', 2 ], style: [ 'style', 'slop', 2 ], keywords: [ 'keywords', 'queries', 1 ], formality: [ 'formality', 'fog', 1 ], readability: [ 'readability', 'fre', 2 ] };
	const sentence = 'Сохранённый текст\u00a0с повторяющимися словами, «кавычками» и обычными пробелами. ';
	const plain = '<!-- wp:paragraph -->\n<p>' + sentence.repeat( 40 ) + '</p>\n<!-- /wp:paragraph -->';
	const legacy = plain.replace( sentence, '<span data-turgenev-category="style" data-turgenev-level="1" class="turgenev-highlight">' + sentence + '</span>' );
	const fixtures = [ plain, legacy ];
	await page.addInitScript( contents => {
		const index = new URLSearchParams( location.search ).get( 'saved' );
		if ( index !== null ) window.smokeInitialContent = contents[ Number( index ) ];
	}, fixtures );
	await page.unroute( '**/analysis' );
	let expected = [];
	await page.route( '**/analysis', async route => {
		const body = Object.fromEntries( route.request().postData().split( '&' ).map( part => part.split( '=' ).map( value => decodeURIComponent( value.replace( /\+/g, ' ' ) ) ) ) );
		let data;
		if ( body.operation === 'balance' ) data = { balance: '1' };
		if ( body.operation === 'risk' ) data = { result: { risk: '5', level: 'medium', link: 'risk12345', details: categories.map( block => ( { block, sum: '1', link: block + '12345' } ) ) } };
		if ( body.operation === 'details' ) data = { details: { params: [] } };
		if ( body.operation === 'highlights' ) {
			const [ category, type, level ] = markTypes[ body.report_token.replace( '12345', '' ) ];
			const pattern = category === 'readability' ? /[\s\S]+/gu : category === 'style' ? /[^.!?]+[.!?]?/gu : /\S+/gu;
			const marks = [ ...body.text.matchAll( pattern ) ].map( match => ( { start: match.index, end: match.index + match[ 0 ].length, category, type, level, sentence: null } ) );
			expected = marks.map( mark => body.text.slice( mark.start, mark.end ).replace( /\s+/gu, ' ' ).trim() );
			data = { highlights: { text: body.text, marks } };
		}
		await route.fulfill( { json: { success: true, data } } );
	} );
	for ( const iframe of [ false, true ] ) {
		for ( let index = 0; index < fixtures.length; index++ ) {
			await page.goto( 'http://127.0.0.1:8897/?saved=' + index + ( iframe ? '&iframe=1' : '' ) );
			const editor = iframe ? page.frameLocator( 'iframe[name="editor-canvas"]' ) : page;
			await editor.locator( '[data-block]' ).first().waitFor();
			const snapshot = () => page.evaluate( () => ( {
				html: wp.data.select( 'core/editor' ).getEditedPostContent(),
				text: TurgenevEditorContent.snapshot().text,
				blocks: JSON.stringify( wp.data.select( 'core/block-editor' ).getBlocks() ),
				unedited: ! wp.data.select( 'core' ).getEditedEntityRecord( 'postType', 'post', 42 ).blocks,
			} ) );
			const original = await snapshot();
			assert( original.unedited && original.html === fixtures[ index ], 'The fixture must be a saved post, not manufactured unsaved block edits.' );
			await page.getByRole( 'button', { name: 'Turgenev', exact: true } ).click();
			await page.getByRole( 'button', { name: 'Analyze document', exact: true } ).click();
			// The accordion replaced per-section "Highlight" buttons: opening a section runs its
			// highlight request, so re-highlighting an open one means closing it first.
			const toggles = page.locator( '.turgenev-accordion-toggle' );
			const idle = () => page.waitForFunction( () => {
				const panel = document.querySelector( '.turgenev-panel' );
				return panel && panel.getAttribute( 'aria-busy' ) === 'false' && ! panel.querySelector( '.turgenev-accordion .turgenev-spinner' );
			} );
			await toggles.nth( 5 ).waitFor(); await idle();
			for ( let categoryIndex = 0; categoryIndex < 6; categoryIndex++ ) {
				if ( await toggles.nth( categoryIndex ).getAttribute( 'aria-expanded' ) === 'true' ) await toggles.nth( categoryIndex ).click();
				// Reset view may legitimately strip legacy wrappers, so each highlight is
				// compared with the document as it stood right before it.
				const before = await snapshot();
				await toggles.nth( categoryIndex ).click();
				await idle();
				const state = await page.evaluate( () => {
					const docs = TurgenevEditorContent.documents();
					const groups = docs.flatMap( doc => [ ...doc.defaultView.CSS.highlights ] );
					return {
						notices: [ ...document.querySelectorAll( '.turgenev-notice' ) ].map( node => node.textContent ),
						categories: groups.map( ( [ key ] ) => key ),
						fragments: groups.flatMap( ( [ , ranges ] ) => [ ...ranges ].map( range => range.toString().replace( /\s+/gu, ' ' ).trim() ) ),
						html: wp.data.select( 'core/editor' ).getEditedPostContent(),
						blocks: JSON.stringify( wp.data.select( 'core/block-editor' ).getBlocks() ),
						unedited: ! wp.data.select( 'core' ).getEditedEntityRecord( 'postType', 'post', 42 ).blocks,
					};
				} );
				assert( ! state.notices.length, 'Fresh saved post highlight failed: ' + state.notices.join( '; ' ) );
				assert( JSON.stringify( state.fragments ) === JSON.stringify( expected ), 'Every reported word, sentence and whole-paragraph range must map exactly.' );
				const [ , type, level ] = markTypes[ categoryIndex ? categories[ categoryIndex - 1 ] : 'risk' ];
				assert( state.categories.length && state.categories.every( key => key === 'turgenev-' + type + level ), 'A category retained unrelated highlights.' );
				assert( state.unedited === before.unedited && state.html === before.html && state.blocks === before.blocks, 'Highlight introduced a save/autosave edit or changed block attributes.' );
				if ( categoryIndex === 2 ) await page.screenshot( { path: 'output/playwright/saved-post-' + index + ( iframe ? '-iframe' : '' ) + '.png' } );
				await page.getByRole( 'button', { name: 'Reset view', exact: true } ).click();
				assert( await page.evaluate( () => TurgenevEditorContent.documents().every( doc => doc.defaultView.CSS.highlights.size === 0 && ! doc.querySelector( '.turgenev-decoration-layer' ) ) ), 'Reset left decorations on a saved post.' );
				const afterReset = await snapshot();
				assert( afterReset.text === original.text && afterReset.html === fixtures[ 0 ], 'Reset must remove legacy Turgenev wrappers, and only them, keeping the text.' );
			}
			checks.push( 'saved post ' + index + ( iframe ? ' in native iframe' : ' in inline editor' ) + ': all categories, exact ranges, no edits, complete reset' );
		}
	}
	await page.evaluate( results => { window.savedPostSmokeResults = results; }, checks );
}
