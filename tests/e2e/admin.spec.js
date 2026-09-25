import { expect, test } from '@playwright/test';
import { wpCli } from './support/wp-cli.mjs';

const username = process.env.WP_ADMIN_USER;
const password = process.env.WP_ADMIN_PASSWORD;
const SETTINGS_URL = '/wp-admin/options-general.php?page=turgenev-settings';

async function login( page ) {
	test.skip( ! username || ! password, 'WP_ADMIN_USER and WP_ADMIN_PASSWORD are required.' );
	await page.goto( '/wp-login.php' );
	await page.locator( '#user_login' ).fill( username );
	await page.locator( '#user_pass' ).fill( password );
	await page.getByRole( 'button', { name: /Log In/i } ).click();
	await page.waitForURL( /wp-admin/ );
}

/** Reads the stored `api_key`, or null if wp-cli/the option is unavailable. */
function getSavedApiKey() {
	const raw = wpCli( [ 'option', 'get', 'turgenev', '--format=json' ] );
	if ( null === raw ) {
		return null;
	}
	try {
		return JSON.parse( raw ).api_key ?? '';
	} catch {
		return null;
	}
}

async function submitApiKeyForm( page, { newKey = '', clear = false } = {} ) {
	await page.goto( SETTINGS_URL );
	if ( newKey ) {
		await page.locator( '#turgenev-api-key' ).fill( newKey );
	}
	await page.getByRole( 'button', { name: clear ? /Delete API Key/i : /Save API key/i } ).click();
	await page.waitForLoadState( 'networkidle' );
}

test( 'settings page loads without exposing a configured secret', async ( { page } ) => {
	await login( page );
	await page.goto( SETTINGS_URL );
	await expect( page.getByRole( 'heading', { name: /Turgenev/i } ) ).toBeVisible();
	await expect( page.locator( '#turgenev-api-key' ) ).toHaveAttribute( 'type', 'password' );

	const secret = process.env.TURGENEV_API_KEY;
	if ( secret ) {
		const html = await page.content();
		expect( html ).not.toContain( secret );
	}
} );

test.describe( 'API key save/rotate/clear', () => {
	// Every scenario below asserts against the actual stored option via wp-cli, not just
	// the UI's own state, and asserts the submitted plaintext key is never echoed back into
	// page HTML (the field is always re-rendered empty; see SettingsPage::renderApiKeyField()).
	test.beforeEach( () => {
		wpCli( [ 'option', 'delete', 'turgenev_e2e_force_balance_error' ] );
		wpCli( [ 'option', 'delete', 'turgenev_e2e_force_outage' ] );
	} );

	test( 'a fresh valid key is saved', async ( { page } ) => {
		test.skip( null === getSavedApiKey(), 'wp-cli is required (set WP_TEST_ROOT).' );
		wpCli( [ 'option', 'delete', 'turgenev' ] );
		await login( page );

		const candidate = 'e2e-fresh-valid-key-' + Date.now();
		await submitApiKeyForm( page, { newKey: candidate } );

		expect( getSavedApiKey() ).toBe( candidate );
		expect( await page.content() ).not.toContain( candidate );
		// A missing option equals its registered default, so WordPress sanitizes twice here.
		await expect( page.locator( '#setting-error-turgenev_key_saved' ) ).toHaveCount( 1 );
		await expect( page.locator( '.turgenev-saved-key' ) ).toContainText( 'Saved API key: ••••••••••••' + candidate.slice( -4 ) );
		await expect( page.getByRole( 'button', { name: /Delete API Key/i } ) ).toBeVisible();
	} );

	test( 'a blank field preserves the currently saved key', async ( { page } ) => {
		const original = 'e2e-original-key-' + Date.now();
		wpCli( [ 'option', 'update', 'turgenev', JSON.stringify( { api_key: original } ), '--format=json' ] );
		test.skip( original !== getSavedApiKey(), 'wp-cli is required (set WP_TEST_ROOT).' );
		await login( page );

		await submitApiKeyForm( page ); // No key typed.

		expect( getSavedApiKey() ).toBe( original );
		expect( await page.content() ).not.toContain( original );
	} );

	test( 'an invalid replacement key preserves the currently saved key', async ( { page } ) => {
		const original = 'e2e-still-working-key-' + Date.now();
		wpCli( [ 'option', 'update', 'turgenev', JSON.stringify( { api_key: original } ), '--format=json' ] );
		test.skip( original !== getSavedApiKey(), 'wp-cli is required (set WP_TEST_ROOT).' );
		wpCli( [ 'option', 'update', 'turgenev_e2e_force_balance_error', '1' ] );
		await login( page );

		const rejectedCandidate = 'e2e-rejected-candidate-' + Date.now();
		await submitApiKeyForm( page, { newKey: rejectedCandidate } );

		expect( getSavedApiKey() ).toBe( original );
		const html = await page.content();
		expect( html ).not.toContain( original );
		expect( html ).not.toContain( rejectedCandidate );
	} );

	test( 'a provider outage during validation preserves the currently saved key', async ( { page } ) => {
		const original = 'e2e-outage-survivor-key-' + Date.now();
		wpCli( [ 'option', 'update', 'turgenev', JSON.stringify( { api_key: original } ), '--format=json' ] );
		test.skip( original !== getSavedApiKey(), 'wp-cli is required (set WP_TEST_ROOT).' );
		wpCli( [ 'option', 'update', 'turgenev_e2e_force_outage', '1' ] );
		await login( page );

		const candidateDuringOutage = 'e2e-candidate-during-outage-' + Date.now();
		await submitApiKeyForm( page, { newKey: candidateDuringOutage } );

		expect( getSavedApiKey() ).toBe( original );
		const html = await page.content();
		expect( html ).not.toContain( original );
		expect( html ).not.toContain( candidateDuringOutage );
	} );

	test( 'explicitly clearing the key removes it', async ( { page } ) => {
		const original = 'e2e-key-to-clear-' + Date.now();
		wpCli( [ 'option', 'update', 'turgenev', JSON.stringify( { api_key: original } ), '--format=json' ] );
		test.skip( original !== getSavedApiKey(), 'wp-cli is required (set WP_TEST_ROOT).' );
		await login( page );

		await submitApiKeyForm( page, { clear: true } );

		expect( getSavedApiKey() ?? '' ).toBe( '' );
		expect( await page.content() ).not.toContain( original );
		await expect( page.getByRole( 'button', { name: /Delete API Key/i } ) ).toHaveCount( 0 );
		await expect( page.locator( '.turgenev-saved-key' ) ).toHaveCount( 0 );
	} );

	test( 'a key saved right after Delete API Key is verified and announced once', async ( { page } ) => {
		const original = 'e2e-key-before-delete-' + Date.now();
		wpCli( [ 'option', 'update', 'turgenev', JSON.stringify( { api_key: original } ), '--format=json' ] );
		test.skip( original !== getSavedApiKey(), 'wp-cli is required (set WP_TEST_ROOT).' );
		await login( page );

		await submitApiKeyForm( page, { clear: true } );
		const replacement = 'e2e-key-after-delete-' + Date.now();
		await submitApiKeyForm( page, { newKey: replacement } );

		expect( getSavedApiKey() ).toBe( replacement );
		await expect( page.locator( '#setting-error-turgenev_key_saved' ) ).toHaveCount( 1 );
		expect( await page.content() ).not.toContain( replacement );
	} );
} );
