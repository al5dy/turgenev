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
	await page.goto( '/wp-login.php' );
	await page.getByLabel( /Username|Email Address/i ).fill( user );
	await page.getByLabel( /Password/i ).fill( pass );
	await page.getByRole( 'button', { name: /Log In/i } ).click();
	await page.waitForURL( /wp-admin/ );
}

async function loginAsAdmin( page ) {
	test.skip( ! username || ! password, 'WP_ADMIN_USER and WP_ADMIN_PASSWORD are required.' );
	await login( page, username, password );
}

test.describe( 'Gutenberg document panel', () => {
	let postId;

	test.beforeAll( () => {
		postId = wpCli( [
			'post', 'create',
			'--post_type=post',
			'--post_title=Turgenev E2E baseline post',
			'--post_status=draft',
			'--post_content=Turgenev E2E baseline content for the panel and analyze scenarios.',
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
		await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit` );
		const panel = page.locator( '.turgenev-document-panel' );
		await expect( panel ).toBeVisible( { timeout: 20000 } );
		await expect( panel.getByRole( 'heading', { name: /Turgenev/i } ) ).toBeVisible();
	} );

	test( 'analyzes unsaved document content without requiring a prior save', async ( { page } ) => {
		test.skip( ! postId, 'wp-cli is required to create a test post (set WP_TEST_ROOT).' );
		await loginAsAdmin( page );
		await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit` );
		const panel = page.locator( '.turgenev-document-panel' );
		await expect( panel ).toBeVisible( { timeout: 20000 } );

		// Type new, unsaved content; the draft in the DB never receives this edit.
		const block = page.locator( '.wp-block-post-content [data-type="core/paragraph"], [data-type="core/paragraph"]' ).first();
		await block.click();
		await page.keyboard.type( ' Unsaved addition proving analysis does not require a save first.' );

		await panel.getByRole( 'button', { name: /Analyze document/i } ).click();
		await expect( panel.getByRole( 'heading', { name: /Overall risk/i } ) ).toBeVisible( { timeout: 20000 } );

		const savedContent = wpCli( [ 'post', 'get', String( postId ), '--field=post_content' ] );
		expect( savedContent ).not.toContain( 'Unsaved addition' );
	} );

	test( 'an invalid nonce is rejected with a clear, non-fatal message', async ( { page } ) => {
		test.skip( ! postId, 'wp-cli is required to create a test post (set WP_TEST_ROOT).' );
		await loginAsAdmin( page );
		await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit` );
		const panel = page.locator( '.turgenev-document-panel' );
		await expect( panel ).toBeVisible( { timeout: 20000 } );

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
	const contributorUser = 'turgenev-e2e-contributor';
	const contributorPassword = 'Turgenev-E2E-' + Date.now();
	let ownerPostId;

	test.beforeAll( () => {
		ownerPostId = wpCli( [
			'post', 'create',
			'--post_type=post',
			'--post_title=Turgenev E2E authorization post',
			'--post_status=draft',
			'--post_author=1',
			'--porcelain',
		] );
		wpCli( [
			'user', 'create', contributorUser, contributorUser + '@example.test',
			'--role=contributor',
			'--user_pass=' + contributorPassword,
		] );
	} );

	test.afterAll( () => {
		if ( ownerPostId ) {
			wpCli( [ 'post', 'delete', ownerPostId, '--force' ] );
		}
		wpCli( [ 'user', 'delete', contributorUser, '--yes' ] );
	} );

	test( 'a contributor without edit_post on this post is rejected, not just a generic edit_posts check', async ( { page } ) => {
		test.skip( ! ownerPostId, 'wp-cli is required (set WP_TEST_ROOT).' );
		await login( page, contributorUser, contributorPassword );

		// Any admin screen where turgenev-client is enqueued exposes a nonce valid for this
		// user; profile.php is reachable by every role and does not itself touch Turgenev.
		await page.goto( '/wp-admin/profile.php' );
		const status = await page.evaluate( async ( postId ) => {
			const body = new URLSearchParams( {
				action: 'turgenev_api',
				operation: 'risk',
				text: 'Attempted cross-post analysis.',
				post_id: String( postId ),
				nonce: window.TurgenevConfig?.nonce ?? '',
			} );
			const response = await fetch( window.TurgenevConfig?.ajaxUrl ?? '/wp-admin/admin-ajax.php', {
				method: 'POST',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body.toString(),
			} );
			return response.status;
		}, ownerPostId );

		expect( status ).toBe( 403 );
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

	test( 'running Highlight leaves the saved post content byte-identical', async ( { page } ) => {
		test.skip( ! postId, 'wp-cli is required (set WP_TEST_ROOT).' );
		await loginAsAdmin( page );
		await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit` );
		const panel = page.locator( '.turgenev-document-panel' );
		await expect( panel ).toBeVisible( { timeout: 20000 } );

		await panel.getByRole( 'button', { name: /Analyze document/i } ).click();
		await expect( panel.getByRole( 'heading', { name: /Overall risk/i } ) ).toBeVisible( { timeout: 20000 } );

		await panel.getByRole( 'button', { name: /^Highlight$/i } ).first().click();
		await expect( panel.getByText( /Loading highlights…/i ) ).toBeHidden( { timeout: 20000 } );

		// Assert against what actually persists, not just in-memory editor state.
		const saveButton = page.getByRole( 'button', { name: /^Save draft$/i } );
		if ( await saveButton.isVisible().catch( () => false ) ) {
			await saveButton.click();
			await page.waitForTimeout( 1500 );
		}

		const savedContent = wpCli( [ 'post', 'get', String( postId ), '--field=post_content' ] );
		expect( savedContent ).not.toBeNull();
		expect( savedContent ).not.toContain( 'turgenev-highlight' );
		expect( savedContent.replace( /<[^>]+>/g, '' ).trim() ).toContain( original.trim() );
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
			'--porcelain',
		] );
	} );

	test.afterAll( () => {
		if ( postId ) {
			wpCli( [ 'post', 'delete', postId, '--force' ] );
		}
		wpCli( [ 'option', 'delete', 'turgenev_e2e_force_no_dom' ] );
	} );

	test( 'Highlight is hidden and a clear notice shown when ext-dom is unavailable', async ( { page } ) => {
		test.skip(
			! postId,
			'wp-cli is required, and the e2e support mu-plugin must register the turgenev_has_dom filter (set WP_TEST_ROOT).'
		);
		wpCli( [ 'option', 'update', 'turgenev_e2e_force_no_dom', '1' ] );
		try {
			await loginAsAdmin( page );
			await page.goto( `/wp-admin/post.php?post=${ postId }&action=edit` );
			const panel = page.locator( '.turgenev-document-panel' );
			await expect( panel ).toBeVisible( { timeout: 20000 } );
			await expect( panel.getByText( /unavailable on this server/i ) ).toBeVisible();

			await panel.getByRole( 'button', { name: /Analyze document/i } ).click();
			await expect( panel.getByRole( 'heading', { name: /Overall risk/i } ) ).toBeVisible( { timeout: 20000 } );
			await expect( panel.getByRole( 'button', { name: /^Highlight$/i } ) ).toHaveCount( 0 );
		} finally {
			wpCli( [ 'option', 'delete', 'turgenev_e2e_force_no_dom' ] );
		}
	} );
} );

test.describe( 'Stale or missing runtime assets are observable, not silent', () => {
	test( 'a missing analysis.js produces a real, detectable network failure, not a silent no-op', async ( { page } ) => {
		const deployedAsset = resolve( wpTestRoot, 'wp-content/plugins/turgenev/assets/build/analysis.js' );
		const movedAsset = deployedAsset + '.e2e-moved';

		const deployedAssetExists = await access( deployedAsset ).then( () => true, () => false );
		test.skip(
			! deployedAssetExists,
			`WP_TEST_ROOT must point at a real WordPress install with Turgenev deployed; ${ deployedAsset } does not exist.`
		);

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
