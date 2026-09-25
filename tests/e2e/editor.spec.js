import { expect, test } from '@playwright/test';
import { access, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { wpCli, wpTestRoot } from './support/wp-cli.mjs';

const username = process.env.WP_ADMIN_USER;
const password = process.env.WP_ADMIN_PASSWORD;

/**
 * Requires `tests/e2e/mu-plugins/turgenev-e2e-support.php` to be installed in the target
 * site's `wp-content/mu-plugins/` (mocks the provider through `pre_http_request` and adds
 * the `turgenev_e2e_classic` post type / `turgenev_has_dom` filter these tests rely on).
 */

async function login( page, user, pass ) {
	await page.goto( '/wp-login.php', { waitUntil: 'domcontentloaded' } );
	// wp-login.php focuses and selects the username field 200 ms after it loads
	// (`wp_attempt_focus()`). Landing between two fills, that sends the password into the
	// username field. The timer runs once, so fill until both fields hold what was typed.
	await expect( async () => {
		await page.locator( '#user_login' ).fill( user );
		await page.locator( '#user_pass' ).fill( pass );
		await expect( page.locator( '#user_login' ) ).toHaveValue( user, { timeout: 500 } );
		await expect( page.locator( '#user_pass' ) ).toHaveValue( pass, { timeout: 500 } );
	} ).toPass( { timeout: 10000 } );

	await Promise.all( [
		page.waitForURL(
			url => url.hostname === 'localhost' && url.pathname.startsWith( '/wp-admin' ),
			{ waitUntil: 'domcontentloaded', timeout: 20000 }
		),
		page.locator( '#wp-submit' ).click(),
	] );

	await expect( page.locator( '#wpadminbar' ) ).toBeVisible( { timeout: 20000 } );
}

async function loginAsAdmin( page ) {
	test.skip( ! username || ! password, 'WP_ADMIN_USER and WP_ADMIN_PASSWORD are required.' );
	await login( page, username, password );
}

/**
 * Waits for the block editor and switches off its first-run welcome guide.
 *
 * A fresh site (every CI run) shows that guide to each user the first time they open the
 * editor, and while its modal is open WordPress hides the rest of the editor from
 * assistive technology, so no role-based locator (the toolbar's "Turgenev" button, the
 * header's "Settings" toggle) resolves. The guide follows the `core/edit-post` preference,
 * the same switch WordPress's own E2E utilities turn off.
 */
async function editorReady( page ) {
	await page.waitForFunction(
		() => Boolean( window.wp?.data?.select( 'core/editor' )?.getCurrentPostId?.() ),
		null,
		{ timeout: 20000 }
	);
	await page.evaluate( () =>
		window.wp.data.dispatch( 'core/preferences' ).set( 'core/edit-post', 'welcomeGuide', false )
	);
	await expect( page.locator( '.edit-post-welcome-guide' ) ).toHaveCount( 0 );
}

async function openPostEditor( page, postId ) {
	await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit` );
	await editorReady( page );
}

/** Where the block editor renders blocks: its `editor-canvas` iframe, when it has one. */
async function editorCanvas( page ) {
	const frame = page.locator( 'iframe[name="editor-canvas"]' );
	return ( await frame.count() ) ? frame.contentFrame() : page;
}

/**
 * Every Turgenev highlight painted in the editor, as `name => [text of each range]`.
 * Highlights are drawn through the CSS Custom Highlight API, which adds no element to the
 * document, so they are read off `CSS.highlights` of the page and of the editor canvas.
 */
function paintedHighlights( page ) {
	return page.evaluate( () => {
		const documents = [ document, ...[ ...document.querySelectorAll( 'iframe[name="editor-canvas"]' ) ].map( ( frame ) => frame.contentDocument ).filter( Boolean ) ];
		const painted = {};
		for ( const doc of documents ) {
			for ( const [ name, highlight ] of doc.defaultView.CSS.highlights ) {
				if ( name.startsWith( 'turgenev-' ) && highlight.size ) {
					painted[ name ] = [ ...( painted[ name ] || [] ), ...[ ...highlight ].map( ( range ) => range.toString() ) ];
				}
			}
		}
		return painted;
	} );
}

/**
 * The Turgenev panel is an independent overlay, hidden until the "Turgenev" button in the
 * editor's top toolbar is clicked; it is not a Document settings tab any more.
 */
async function openTurgenevPanel( page ) {
	await page
		.locator( '.editor-document-tools.edit-post-header-toolbar' )
		.getByRole( 'button', { name: /Turgenev/i } )
		.click();
	const panel = page.locator( '.turgenev-sidebar' );
	await expect( panel ).toBeVisible( { timeout: 20000 } );
	return panel;
}

// The provider mock answers for any key, but the editor only offers an analysis once one is
// configured. Set it here instead of inheriting whatever admin.spec.js left behind, and put
// the site's own setting back afterwards.
let savedSettings = null;

test.beforeAll( () => {
	savedSettings = wpCli( [ 'option', 'get', 'turgenev', '--format=json' ] );
	wpCli( [ 'option', 'update', 'turgenev', JSON.stringify( { api_key: 'e2e-editor-mock-key' } ), '--format=json' ] );
} );

test.afterAll( () => {
	if ( null === savedSettings ) {
		wpCli( [ 'option', 'delete', 'turgenev' ] );
	} else {
		wpCli( [ 'option', 'update', 'turgenev', savedSettings, '--format=json' ] );
	}
} );

test.describe( 'Gutenberg independent Turgenev overlay', () => {
	let postId;

	test.beforeAll( () => {
		postId = wpCli( [
			'post', 'create',
			'--post_type=post',
			'--post_title=Turgenev E2E baseline post',
			'--post_status=draft',
			// Real block markup: plain text would open as a single Classic block.
			'--post_content=<!-- wp:paragraph --><p>Turgenev E2E baseline content for the panel and analyze scenarios.</p><!-- /wp:paragraph -->',
			'--porcelain',
		] );
	} );

	test.afterAll( () => {
		if ( postId ) {
			wpCli( [ 'post', 'delete', postId, '--force' ] );
		}
	} );

	test( 'is visible on a post edit screen', async ( { page } ) => {
		test.skip( ! postId, 'wp-cli is required to create a test post (set WP_TEST_ROOT).' );
		await loginAsAdmin( page );
		await openPostEditor( page, postId );
		const panel = await openTurgenevPanel( page );
		await expect( panel.getByRole( 'heading', { name: /Turgenev/i } ) ).toBeVisible();
	} );

	test( 'opens and closes together with the editor\'s settings sidebar', async ( { page } ) => {
		test.skip( ! postId, 'wp-cli is required to create a test post (set WP_TEST_ROOT).' );
		await loginAsAdmin( page );
		await openPostEditor( page, postId );
		const settings = page
			.locator( '.editor-header' )
			.getByRole( 'button', { name: 'Settings', exact: true } );
		if ( ( await settings.getAttribute( 'aria-expanded' ) ) === 'true' ) {
			await settings.click();
		}
		await expect( settings ).toHaveAttribute( 'aria-expanded', 'false' );

		// Opened over a closed sidebar, the panel brings the sidebar with it...
		const panel = await openTurgenevPanel( page );
		await expect( settings ).toHaveAttribute( 'aria-expanded', 'true' );
		// ...which takes the panel with it when the Settings button closes it.
		await settings.click();
		await expect( panel ).toHaveCount( 0 );
		await expect( settings ).toHaveAttribute( 'aria-expanded', 'false' );

		// Closing the panel closes the sidebar it opened, and only that one.
		await openTurgenevPanel( page );
		await page.locator( '.turgenev-sidebar__close' ).click();
		await expect( page.locator( '.turgenev-sidebar' ) ).toHaveCount( 0 );
		await expect( settings ).toHaveAttribute( 'aria-expanded', 'false' );
		await settings.click();
		await openTurgenevPanel( page );
		await page.locator( '.turgenev-sidebar__close' ).click();
		await expect( page.locator( '.turgenev-sidebar' ) ).toHaveCount( 0 );
		await expect( settings ).toHaveAttribute( 'aria-expanded', 'true' );
	} );

	test( 'analyzes unsaved document content without requiring a prior save', async ( { page } ) => {
		test.skip( ! postId, 'wp-cli is required to create a test post (set WP_TEST_ROOT).' );
		await loginAsAdmin( page );
		await openPostEditor( page, postId );
		const panel = await openTurgenevPanel( page );

		// Type new, unsaved content; the draft in the DB never receives this edit.
		const block = ( await editorCanvas( page ) ).locator( '[data-type="core/paragraph"]' ).first();
		await block.click();
		await page.keyboard.press( 'End' );
		await page.keyboard.type( ' Unsaved addition proving analysis does not require a save first.' );

		await panel.getByRole( 'button', { name: /Analyze document/i } ).click();
		// The result panel is six accordion buttons (Overall risk, Frequency, Style,
		// Keywords, Formality, Readability), not a heading, so it is found by its button role.
		await expect( panel.getByRole( 'button', { name: /Overall risk/i } ) ).toBeVisible( { timeout: 20000 } );

		const savedContent = wpCli( [ 'post', 'get', String( postId ), '--field=post_content' ] );
		expect( savedContent ).not.toContain( 'Unsaved addition' );
	} );

	test( 'an invalid nonce is rejected with a clear, non-fatal message', async ( { page } ) => {
		test.skip( ! postId, 'wp-cli is required to create a test post (set WP_TEST_ROOT).' );
		await loginAsAdmin( page );
		await openPostEditor( page, postId );
		const panel = await openTurgenevPanel( page );

		await page.evaluate( () => {
			window.TurgenevConfig.nonce = 'deliberately-invalid-nonce';
		} );
		await panel.getByRole( 'button', { name: /Analyze document/i } ).click();
		await expect( panel.getByText( /session expired/i ) ).toBeVisible( { timeout: 20000 } );
	} );
} );

test.describe( 'Classic Editor metabox', () => {
	let classicPostId;

	test.beforeAll( () => {
		classicPostId = wpCli( [
			'post', 'create',
			'--post_type=turgenev_e2e_classic',
			'--post_title=Turgenev E2E classic post',
			'--post_status=draft',
			'--porcelain',
		] );
	} );

	test.afterAll( () => {
		if ( classicPostId ) {
			wpCli( [ 'post', 'delete', classicPostId, '--force' ] );
		}
	} );

	test( 'is visible for a post type without block-editor support', async ( { page } ) => {
		test.skip(
			! classicPostId,
			'wp-cli is required, and the e2e support mu-plugin must register turgenev_e2e_classic (set WP_TEST_ROOT).'
		);
		await loginAsAdmin( page );
		await page.goto( `/wp-admin/post.php?post=${ classicPostId }&action=edit` );
		const metabox = page.locator( '#turgenev_metabox' );
		await expect( metabox ).toBeVisible( { timeout: 20000 } );
		await expect( metabox.getByText( /Current balance/i ) ).toBeVisible();
	} );
} );

test.describe( 'Post-level authorization', () => {
	// Distinct from nonce validation (see the Gutenberg document panel's "invalid nonce"
	// test above): this proves a *valid* nonce is still rejected once it hits
	// `current_user_can( 'edit_post', $post_id )` for a post this user cannot edit.
	const contributorUser = 'turgenev-e2e-contributor';
	const contributorPassword = 'Turgenev-E2E-' + Date.now();
	let contributorId;
	let contributorPostId;
	let adminPostId;

	test.beforeAll( () => {
		contributorId = wpCli( [
			'user', 'create', contributorUser, contributorUser + '@example.test',
			'--role=contributor',
			'--user_pass=' + contributorPassword,
			'--porcelain',
		] );
		// A post the contributor genuinely owns and can edit, so the editor screen that
		// supplies the nonce is one this role can legitimately open (turgenev-client is
		// actually enqueued there), unlike the previous profile.php approach.
		contributorPostId = contributorId && wpCli( [
			'post', 'create',
			'--post_type=post',
			'--post_title=Turgenev E2E contributor-owned post',
			'--post_status=draft',
			'--post_content=Contributor-owned baseline content.',
			'--post_author=' + contributorId,
			'--porcelain',
		] );
		adminPostId = wpCli( [
			'post', 'create',
			'--post_type=post',
			'--post_title=Turgenev E2E admin-owned post',
			'--post_status=draft',
			'--post_author=1',
			'--porcelain',
		] );
	} );

	test.afterAll( () => {
		if ( contributorPostId ) {
			wpCli( [ 'post', 'delete', contributorPostId, '--force' ] );
		}
		if ( adminPostId ) {
			wpCli( [ 'post', 'delete', adminPostId, '--force' ] );
		}
		if ( contributorId ) {
			wpCli( [ 'user', 'delete', contributorUser, '--yes' ] );
		}
	} );

	test( 'a contributor with edit_post on their own post is still rejected on another author\'s post, not authorized by a generic edit_posts check', async ( { page } ) => {
		test.skip(
			! contributorId || ! contributorPostId || ! adminPostId,
			'wp-cli is required to create the contributor and both posts (set WP_TEST_ROOT).'
		);
		await login( page, contributorUser, contributorPassword );

		// The contributor's own post-edit screen: a screen this role can legitimately open,
		// where turgenev-client (and therefore TurgenevConfig.nonce) is really enqueued.
		await openPostEditor( page, contributorPostId );
		const panel = await openTurgenevPanel( page );
		// The editor asks for the balance as it loads, a legitimate provider request for a
		// post this contributor owns. Let it finish, then count only what the forged
		// cross-post request below sends.
		await expect( panel.locator( '.turgenev-balance-value' ) ).toHaveText( '42.50 ₽', { timeout: 20000 } );
		wpCli( [ 'option', 'update', 'turgenev_e2e_mock_request_count', '0' ] );

		const nonce = await page.evaluate( () => window.TurgenevConfig && window.TurgenevConfig.nonce );
		expect( typeof nonce ).toBe( 'string' );
		expect( nonce.length ).toBeGreaterThan( 0 );

		const result = await page.evaluate(
			async ( { postId, nonce: validNonce } ) => {
				const body = new URLSearchParams( {
					action: 'turgenev_api',
					operation: 'risk',
					text: 'Attempted cross-post analysis.',
					post_id: String( postId ),
					nonce: validNonce,
				} );
				const response = await fetch( '/wp-admin/admin-ajax.php', {
					method: 'POST',
					credentials: 'same-origin',
					headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
					body: body.toString(),
				} );
				const data = await response.json().catch( () => null );
				return { status: response.status, data };
			},
			{ postId: adminPostId, nonce }
		);

		expect( result.status ).toBe( 403 );
		// A valid nonce that is still rejected, with this specific message (not the generic
		// "session expired" nonce-failure text), proves the request passed nonce validation
		// and was turned away by object-level authorization instead.
		expect( result.data?.data?.message ?? '' ).toMatch( /not allowed to analyze this post/i );

		expect( wpCli( [ 'option', 'get', 'turgenev_e2e_mock_request_count' ] ) ).toBe( '0' );
	} );
} );

test.describe( 'Highlight rendering never mutates saved content', () => {
	const original = 'Turgenev highlight content baseline, unchanged after highlighting.';
	let postId;

	test.beforeAll( () => {
		postId = wpCli( [
			'post', 'create',
			'--post_type=post',
			'--post_title=Turgenev E2E highlight post',
			'--post_status=draft',
			'--post_content=' + original,
			'--porcelain',
		] );
	} );

	test.afterAll( () => {
		if ( postId ) {
			wpCli( [ 'post', 'delete', postId, '--force' ] );
		}
	} );

	function assertNoHighlightMarkup( savedContent ) {
		expect( savedContent ).not.toBeNull();
		expect( savedContent ).not.toContain( 'turgenev-highlight' );
		expect( savedContent ).not.toMatch( /data-turgenev-/i );
		expect( savedContent ).not.toContain( 'turgenev-source-mark' );
		expect( savedContent ).not.toContain( 'turgenev-decoration-layer' );
		expect( savedContent.replace( /<[^>]+>/g, '' ).trim() ).toContain( original.trim() );
	}

	test( 'Highlight renders a real annotation but never mutates saved content, including after save, autosave and reload', async ( { page } ) => {
		test.skip( ! postId, 'wp-cli is required (set WP_TEST_ROOT).' );
		await loginAsAdmin( page );
		await openPostEditor( page, postId );
		const panel = await openTurgenevPanel( page );

		await panel.getByRole( 'button', { name: /Analyze document/i } ).click();
		const overallToggle = panel.getByRole( 'button', { name: /Overall risk/i } );
		await expect( overallToggle ).toBeVisible( { timeout: 20000 } );

		// A successful analysis now opens "Overall risk" itself (the accordion button
		// doubles as the Highlight action, so this also runs the same highlight pipeline
		// a dedicated "Highlight" button used to) — no click needed, and clicking it now
		// would only collapse the already-open section.
		await expect( overallToggle ).toHaveAttribute( 'aria-expanded', 'true', { timeout: 20000 } );
		// The open section's own spinner covers its highlight and details requests alike.
		await expect( panel.locator( '.turgenev-accordion-panel:not([hidden]) .turgenev-spinner' ) ).toBeHidden( { timeout: 20000 } );

		// The provider mock marks the document's first word as a style problem (`xhl slop2
		// xhint`); confirm it was actually painted in the editor, on exactly that word, not
		// just that the request succeeded silently.
		await expect.poll( () => paintedHighlights( page ), { timeout: 20000 } ).toEqual( { 'turgenev-slop2-u': [ 'Turgenev' ] } );

		// In-memory: not yet saved, the highlight decoration exists but is not part of the
		// serialized block content that would be sent to the database.
		const unsavedContent = wpCli( [ 'post', 'get', String( postId ), '--field=post_content' ] );
		assertNoHighlightMarkup( unsavedContent );

		// After an explicit save: assert against what actually persists, not in-memory state.
		const saveButton = page.getByRole( 'button', { name: /^Save draft$/i } );
		if ( await saveButton.isVisible().catch( () => false ) ) {
			await saveButton.click();
			await page.waitForTimeout( 1500 );
		}
		assertNoHighlightMarkup( wpCli( [ 'post', 'get', String( postId ), '--field=post_content' ] ) );

		// After autosave: Gutenberg autosaves periodically and on `Ctrl/Cmd+S`; force one
		// explicitly rather than waiting on the real interval.
		await page.keyboard.press( process.platform === 'darwin' ? 'Meta+S' : 'Control+S' );
		await page.waitForTimeout( 1500 );
		assertNoHighlightMarkup( wpCli( [ 'post', 'get', String( postId ), '--field=post_content' ] ) );

		// After a full editor reload: the highlight decoration must not have been persisted
		// and re-rendered from stored markup either.
		await page.reload();
		await editorReady( page );
		await openTurgenevPanel( page );
		assertNoHighlightMarkup( wpCli( [ 'post', 'get', String( postId ), '--field=post_content' ] ) );
	} );
} );

test.describe( 'No API key ever reaches the browser', () => {
	test( 'editor page HTML and TurgenevConfig never contain the configured secret', async ( { page } ) => {
		test.skip( ! username || ! password, 'WP_ADMIN_USER and WP_ADMIN_PASSWORD are required.' );
		const restored = wpCli( [ 'option', 'get', 'turgenev', '--format=json' ] );
		test.skip( restored === null, 'wp-cli is required (set WP_TEST_ROOT).' );

		const secretMarker = 'turgenev-e2e-secret-marker-' + Date.now();
		wpCli( [ 'option', 'update', 'turgenev', JSON.stringify( { api_key: secretMarker } ), '--format=json' ] );
		let postId;
		try {
			await loginAsAdmin( page );
			postId = wpCli( [
				'post', 'create',
				'--post_type=post',
				'--post_title=Turgenev E2E secret post',
				'--post_status=draft',
				'--porcelain',
			] );
			await page.goto(
				postId ? `/wp-admin/post.php?post=${ postId }&action=edit` : '/wp-admin/options-general.php?page=turgenev-settings'
			);
			await page.waitForTimeout( 2000 );

			const html = await page.content();
			expect( html ).not.toContain( secretMarker );

			const configLeaksKey = await page.evaluate( () => {
				const config = window.TurgenevConfig || {};
				return 'api_key' in config || 'apiKey' in config || JSON.stringify( config ).includes( 'api_key' );
			} );
			expect( configLeaksKey ).toBe( false );
		} finally {
			if ( postId ) {
				wpCli( [ 'post', 'delete', postId, '--force' ] );
			}
			wpCli( [ 'option', 'update', 'turgenev', restored, '--format=json' ] );
		}
	} );
} );

test.describe( 'Missing DOM extension degrades gracefully', () => {
	let postId;

	test.beforeAll( () => {
		postId = wpCli( [
			'post', 'create',
			'--post_type=post',
			'--post_title=Turgenev E2E no-dom post',
			'--post_status=draft',
			'--post_content=Turgenev E2E content analyzed without the PHP DOM extension.',
			'--porcelain',
		] );
	} );

	test.afterAll( () => {
		if ( postId ) {
			wpCli( [ 'post', 'delete', postId, '--force' ] );
		}
		wpCli( [ 'option', 'delete', 'turgenev_e2e_force_no_dom' ] );
	} );

	test( 'accordion sections are disabled and a clear notice is shown when ext-dom is unavailable', async ( { page } ) => {
		test.skip(
			! postId,
			'wp-cli is required, and the e2e support mu-plugin must register the turgenev_has_dom filter (set WP_TEST_ROOT).'
		);
		wpCli( [ 'option', 'update', 'turgenev_e2e_force_no_dom', '1' ] );
		try {
			await loginAsAdmin( page );
			await openPostEditor( page, postId );
			const panel = await openTurgenevPanel( page );
			await expect( panel.getByText( /unavailable on this server/i ) ).toBeVisible();

			await panel.getByRole( 'button', { name: /Analyze document/i } ).click();
			// Without ext-dom, neither highlighting nor the per-section detail fetch can
			// succeed, so every accordion toggle is rendered disabled rather than clickable.
			await expect( panel.getByRole( 'button', { name: /Overall risk/i } ) ).toBeDisabled( { timeout: 20000 } );
		} finally {
			wpCli( [ 'option', 'delete', 'turgenev_e2e_force_no_dom' ] );
		}
	} );
} );

test.describe( 'Stale or missing runtime assets are observable, not silent', () => {
	test( 'a missing analysis.js produces a real, detectable network failure, not a silent no-op', async ( { page } ) => {
		// A plain install serves the copy under WP_TEST_ROOT. wp-env instead mounts this
		// checkout into its container and leaves only an empty mount point there, so the file
		// it serves is the checkout's own: renamed only on CI, where the checkout is
		// disposable, never in a developer's working copy.
		const candidates = [ resolve( wpTestRoot, 'wp-content/plugins/turgenev/assets/analysis.js' ) ];
		if ( process.env.CI ) {
			candidates.push( resolve( process.cwd(), 'assets/analysis.js' ) );
		}
		let deployedAsset = null;
		for ( const candidate of candidates ) {
			if ( await access( candidate ).then( () => true, () => false ) ) {
				deployedAsset = candidate;
				break;
			}
		}
		test.skip(
			! deployedAsset,
			`WP_TEST_ROOT must point at a real WordPress install with Turgenev deployed; ${ candidates[ 0 ] } does not exist.`
		);
		const movedAsset = deployedAsset + '.e2e-moved';

		await rename( deployedAsset, movedAsset );
		const failedUrls = [];
		page.on( 'requestfailed', ( request ) => failedUrls.push( request.url() ) );
		page.on( 'response', ( response ) => {
			if ( response.status() >= 400 ) {
				failedUrls.push( response.url() );
			}
		} );

		let postId;
		try {
			await loginAsAdmin( page );
			postId = wpCli( [
				'post', 'create',
				'--post_type=post',
				'--post_title=Turgenev E2E missing-asset post',
				'--post_status=draft',
				'--porcelain',
			] );
			await page.goto( postId ? `/wp-admin/post.php?post=${ postId }&action=edit` : '/wp-admin/edit.php' );
			await page.waitForTimeout( 3000 );

			expect( failedUrls.some( ( url ) => url.includes( 'analysis.js' ) ) ).toBe( true );
		} finally {
			if ( postId ) {
				wpCli( [ 'post', 'delete', postId, '--force' ] );
			}
			// Restore even if an assertion above threw, so a failed run never leaves the
			// site's runtime genuinely broken.
			await rename( movedAsset, deployedAsset );
		}
	} );
} );
